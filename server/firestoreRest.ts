import fs from 'node:fs';
import path from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';

interface FirebaseConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
  storageBucket?: string;
}

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig: FirebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

export const PROJECT_ID = firebaseConfig.projectId;
export const DATABASE_ID = firebaseConfig.firestoreDatabaseId || '(default)';
export const FIREBASE_API_KEY = firebaseConfig.apiKey;
export const STORAGE_BUCKET = firebaseConfig.storageBucket || '';

const BASE_DOC_ROOT = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/${BASE_DOC_ROOT}`;

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  authTime?: number;
  authProvider?: string;
  rawToken: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseToken> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });

  const uid = String(payload.sub || payload.user_id || '');
  const email = String(payload.email || '').toLowerCase();
  const emailVerified = Boolean(payload.email_verified);
  const name = typeof payload.name === 'string' ? payload.name : undefined;
  const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : undefined;
  const firebaseClaim = payload.firebase as Record<string, unknown> | undefined;
  const authProvider =
    firebaseClaim && typeof firebaseClaim.sign_in_provider === 'string'
      ? firebaseClaim.sign_in_provider
      : undefined;

  if (!uid || !email) {
    throw new Error('Invalid authentication token payload');
  }
  return { uid, email, emailVerified, name, authTime, authProvider, rawToken: idToken };
}

function mapIdentityToolkitError(code: string): string {
  switch (code) {
    case 'EMAIL_EXISTS':
      return 'An account with this email address already exists in Firebase Authentication.';
    case 'OPERATION_NOT_ALLOWED':
      return 'Email/Password sign-in is disabled in Firebase Console. Enable Authentication -> Sign-in method -> Email/Password.';
    case 'WEAK_PASSWORD':
      return 'Password does not meet Firebase strength requirements.';
    case 'INVALID_EMAIL':
      return 'The email address format is invalid.';
    case 'EMAIL_NOT_FOUND':
      return 'No Firebase Authentication account was found for this email address.';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Too many attempts. Please wait a moment before trying again.';
    default:
      return code || 'Firebase Authentication request failed';
  }
}

export async function firebaseCreateEmailPasswordUser(params: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ uid: string; idToken: string; email: string }> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.email.trim().toLowerCase(),
        password: params.password,
        displayName: params.displayName?.trim() || undefined,
        returnSecureToken: true,
      }),
    }
  );
  const data = (await res.json()) as {
    localId?: string;
    idToken?: string;
    email?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.localId || !data.idToken) {
    const rawCode = String(data.error?.message || '').split(':')[0].trim();
    throw new Error(mapIdentityToolkitError(rawCode));
  }
  return {
    uid: data.localId,
    idToken: data.idToken,
    email: data.email || params.email.trim().toLowerCase(),
  };
}

export async function firebaseSendOobEmail(params: {
  requestType: 'PASSWORD_RESET' | 'VERIFY_EMAIL';
  email?: string;
  idToken?: string;
}): Promise<void> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: params.requestType,
        ...(params.email ? { email: params.email.trim().toLowerCase() } : {}),
        ...(params.idToken ? { idToken: params.idToken } : {}),
      }),
    }
  );
  const data = (await res.json()) as { error?: { message?: string } };
  if (!res.ok) {
    const rawCode = String(data.error?.message || '').split(':')[0].trim();
    throw new Error(mapIdentityToolkitError(rawCode));
  }
}


type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export function toFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => toFirestoreValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function fromFirestoreValue(val: FirestoreValue | undefined): unknown {
  if (!val) return undefined;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map((item) => fromFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

export function fromFirestoreDoc<T = Record<string, unknown>>(doc: {
  name?: string;
  fields?: Record<string, FirestoreValue>;
}): (T & { id: string }) | null {
  if (!doc || !doc.name) return null;
  const parts = doc.name.split('/');
  const id = parts[parts.length - 1];
  const obj: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(doc.fields || {})) {
    obj[k] = fromFirestoreValue(v);
  }
  return obj as T & { id: string };
}

function buildHeaders(idToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  }
  return headers;
}

async function firestoreFetch(url: string, init: RequestInit): Promise<Response> {
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${sep}key=${encodeURIComponent(FIREBASE_API_KEY)}`;
  return fetch(fullUrl, init);
}

export async function fsGetDocWithMeta<T = Record<string, unknown>>(
  collection: string,
  docId: string,
  idToken?: string
): Promise<{ data: T & { id: string }; updateTime?: string } | null> {
  const res = await firestoreFetch(`${FIRESTORE_BASE_URL}/${collection}/${encodeURIComponent(docId)}`, {
    method: 'GET',
    headers: buildHeaders(idToken),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore GET ${collection}/${docId} failed (${res.status}): ${text}`);
  }
  const raw = (await res.json()) as {
    name?: string;
    fields?: Record<string, FirestoreValue>;
    updateTime?: string;
  };
  const parsed = fromFirestoreDoc<T>(raw);
  if (!parsed) return null;
  return { data: parsed, updateTime: raw.updateTime };
}

export async function fsGetDoc<T = Record<string, unknown>>(
  collection: string,
  docId: string,
  idToken?: string
): Promise<(T & { id: string }) | null> {
  const res = await fsGetDocWithMeta<T>(collection, docId, idToken);
  return res ? res.data : null;
}

export interface QueryFilter {
  field: string;
  op: 'EQUAL' | 'GREATER_THAN' | 'LESS_THAN' | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN_OR_EQUAL' | 'ARRAY_CONTAINS' | 'IN';
  value: unknown;
}

export async function fsQueryDocs<T = Record<string, unknown>>(
  collection: string,
  idToken?: string,
  options?: {
    filters?: QueryFilter[];
    orderBy?: { field: string; direction?: 'ASCENDING' | 'DESCENDING' };
    limit?: number;
  }
): Promise<Array<T & { id: string }>> {
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: collection }],
  };

  if (options?.filters && options.filters.length > 0) {
    const fieldFilters = options.filters.map((f) => ({
      fieldFilter: {
        field: { fieldPath: f.field },
        op: f.op,
        value: toFirestoreValue(f.value),
      },
    }));
    if (fieldFilters.length === 1) {
      structuredQuery.where = fieldFilters[0];
    } else {
      structuredQuery.where = {
        compositeFilter: {
          op: 'AND',
          filters: fieldFilters,
        },
      };
    }
  }

  if (options?.orderBy) {
    structuredQuery.orderBy = [
      {
        field: { fieldPath: options.orderBy.field },
        direction: options.orderBy.direction || 'DESCENDING',
      },
    ];
  }

  if (options?.limit) {
    structuredQuery.limit = options.limit;
  }

  const res = await firestoreFetch(`${FIRESTORE_BASE_URL}:runQuery`, {
    method: 'POST',
    headers: buildHeaders(idToken),
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore QUERY ${collection} failed (${res.status}): ${text}`);
  }

  const rows = (await res.json()) as Array<{ document?: { name: string; fields?: Record<string, FirestoreValue> } }>;
  const results: Array<T & { id: string }> = [];
  for (const row of rows) {
    if (row.document) {
      const parsed = fromFirestoreDoc<T>(row.document);
      if (parsed) results.push(parsed);
    }
  }
  return results;
}

export interface CommitWriteOp {
  type: 'create' | 'set' | 'update' | 'delete';
  collection: string;
  docId: string;
  data?: Record<string, unknown>;
  serverTimestampFields?: string[];
  updateFields?: string[];
  currentUpdateTime?: string;
}

export async function fsCommit(ops: CommitWriteOp[], idToken?: string): Promise<void> {
  if (ops.length === 0) return;

  const writes: unknown[] = [];

  for (const op of ops) {
    const docName = `${BASE_DOC_ROOT}/${op.collection}/${op.docId}`;
    if (op.type === 'delete') {
      writes.push({ delete: docName });
      continue;
    }

    const fields: Record<string, FirestoreValue> = {};
    const rawData = op.data || {};
    for (const [k, v] of Object.entries(rawData)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }

    const fieldTransforms = (op.serverTimestampFields || []).map((fieldPath) => ({
      fieldPath,
      setToServerValue: 'REQUEST_TIME',
    }));

    const writeEntry: Record<string, unknown> = {
      update: {
        name: docName,
        fields,
      },
    };

    if (op.type === 'create') {
      writeEntry.currentDocument = { exists: false };
    } else if (op.type === 'update') {
      writeEntry.currentDocument = op.currentUpdateTime
        ? { updateTime: op.currentUpdateTime }
        : { exists: true };
      const maskPaths = op.updateFields ? [...op.updateFields] : Object.keys(fields);
      writeEntry.updateMask = { fieldPaths: maskPaths };
    }

    if (fieldTransforms.length > 0) {
      writeEntry.updateTransforms = fieldTransforms;
    }

    writes.push(writeEntry);
  }

  const res = await firestoreFetch(`${FIRESTORE_BASE_URL}:commit`, {
    method: 'POST',
    headers: buildHeaders(idToken),
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const text = await res.text();
    const opsSummary = ops.map((op) => `${op.type}:${op.collection}/${op.docId}`).join(', ');
    console.error(`Firestore COMMIT failed (${res.status}) [${opsSummary}]:`, text);
    throw new Error(`Firestore COMMIT failed (${res.status}) [${opsSummary}]: ${text}`);
  }
}

export async function fsCreateDoc(
  collection: string,
  docId: string,
  data: Record<string, unknown>,
  idToken?: string,
  serverTimestampFields: string[] = ['createdAt', 'updatedAt']
): Promise<void> {
  await fsCommit(
    [{ type: 'create', collection, docId, data, serverTimestampFields }],
    idToken
  );
}

export async function fsSetDoc(
  collection: string,
  docId: string,
  data: Record<string, unknown>,
  idToken?: string,
  serverTimestampFields: string[] = ['updatedAt']
): Promise<void> {
  await fsCommit(
    [{ type: 'set', collection, docId, data, serverTimestampFields }],
    idToken
  );
}

export async function fsUpdateDoc(
  collection: string,
  docId: string,
  data: Record<string, unknown>,
  idToken?: string,
  serverTimestampFields: string[] = ['updatedAt']
): Promise<void> {
  await fsCommit(
    [
      {
        type: 'update',
        collection,
        docId,
        data,
        serverTimestampFields,
        updateFields: Object.keys(data),
      },
    ],
    idToken
  );
}

export async function fsDeleteDoc(
  collection: string,
  docId: string,
  idToken?: string
): Promise<void> {
  await fsCommit([{ type: 'delete', collection, docId }], idToken);
}

export async function fsQueryTenantDocs<T extends { tenantId?: string } = Record<string, unknown> & { tenantId?: string }>(
  collection: string,
  tenantId: string,
  idToken?: string,
  options?: {
    filters?: QueryFilter[];
    orderBy?: { field: string; direction?: 'ASCENDING' | 'DESCENDING' };
    limit?: number;
    strictTenantFilter?: boolean;
  }
): Promise<Array<T & { id: string }>> {
  const normalizedTenant = (tenantId || 'tenant_default').trim();
  const strictFilter =
    options?.strictTenantFilter !== undefined
      ? options.strictTenantFilter
      : normalizedTenant !== 'tenant_default';

  const existingFilters = options?.filters ? [...options.filters] : [];
  if (strictFilter) {
    if (!existingFilters.some((f) => f.field === 'tenantId')) {
      existingFilters.unshift({ field: 'tenantId', op: 'EQUAL', value: normalizedTenant });
    }
    return fsQueryDocs<T>(collection, idToken, {
      ...options,
      filters: existingFilters,
    });
  }

  // Pre-migration compatibility for tenant_default: include untagged legacy docs and tenant_default docs
  const docs = await fsQueryDocs<T>(collection, idToken, options);
  return docs.filter((d) => !d.tenantId || d.tenantId === normalizedTenant);
}

export function filterTenantDocs<T extends { tenantId?: string }>(
  docs: T[],
  tenantId: string,
  allowLegacyUntaggedFallback = true
): T[] {
  const normalizedTenant = (tenantId || 'tenant_default').trim();
  return docs.filter((d) => {
    if (d.tenantId) return d.tenantId === normalizedTenant;
    return allowLegacyUntaggedFallback && normalizedTenant === 'tenant_default';
  });
}

export async function nextSequenceCode(
  counterId: string,
  prefix: string,
  includeYear: boolean,
  idToken: string,
  digits = 4,
  tenantId = 'tenant_default'
): Promise<string> {
  const normalizedTenant = (tenantId || 'tenant_default').trim();
  const scopedCounterId = `${normalizedTenant}_${counterId}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const maxAttempts = 10;
  let allocatedValue: number | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const existing = await fsGetDocWithMeta<{ prefix: string; value: number; tenantId?: string }>(
      'counters',
      scopedCounterId,
      idToken
    );
    try {
      if (!existing) {
        let seedValue = 1;
        if (normalizedTenant === 'tenant_default') {
          const legacy = await fsGetDocWithMeta<{ prefix: string; value: number }>(
            'counters',
            counterId,
            idToken
          ).catch(() => null);
          if (legacy?.data?.value && Number.isFinite(legacy.data.value)) {
            seedValue = legacy.data.value + 1;
          }
        }
        await fsCommit(
          [
            {
              type: 'create',
              collection: 'counters',
              docId: scopedCounterId,
              data: { prefix, value: seedValue, tenantId: normalizedTenant },
              serverTimestampFields: ['updatedAt'],
            },
          ],
          idToken
        );
        allocatedValue = seedValue;
        break;
      } else {
        const nextVal = (existing.data.value || 0) + 1;
        await fsCommit(
          [
            {
              type: 'update',
              collection: 'counters',
              docId: scopedCounterId,
              data: { value: nextVal, tenantId: normalizedTenant },
              updateFields: ['value', 'tenantId'],
              serverTimestampFields: ['updatedAt'],
              currentUpdateTime: existing.updateTime,
            },
          ],
          idToken
        );
        allocatedValue = nextVal;
        break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isConflict =
        msg.includes('(409)') ||
        msg.includes('(400)') ||
        msg.includes('ALREADY_EXISTS') ||
        msg.includes('FAILED_PRECONDITION') ||
        msg.includes('ABORTED');
      if (!isConflict || attempt === maxAttempts - 1) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 25 + Math.floor(Math.random() * 60)));
    }
  }

  if (allocatedValue === null) {
    throw new Error(`Failed to allocate atomic sequence for ${scopedCounterId}`);
  }

  const padded = String(allocatedValue).padStart(digits, '0');
  if (includeYear) {
    const year = new Date().getFullYear();
    return `${prefix}-${year}-${padded}`;
  }
  return `${prefix}-${padded}`;
}
