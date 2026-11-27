import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STORAGE_BUCKET } from './firestoreRest.ts';

const VAULT_DIR = path.resolve(process.cwd(), '.data', 'vault');

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
}

export interface StoredFileMeta {
  fileId: string;
  tenantId?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  category:
    | 'branding'
    | 'candidate_doc'
    | 'course_doc'
    | 'trainer_doc'
    | 'training_card'
    | 'certificate'
    | 'report';
  organizationId?: string;
  candidateDocId?: string;
  candidateUserId?: string;
  isPublicBranding?: boolean;
  uploadedBy: string;
  createdAt: string;
}

import {
  ALLOWED_CANDIDATE_DOC_MIME_TYPES,
  SAUDI_REGULATORY_MAX_FILE_SIZE_BYTES,
  validateCandidateDocumentFile,
} from '../src/lib/documentValidation.ts';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/avif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]);

const BRANDING_IMAGE_EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

export function normalizeBrandingImageMime(mimeType: string, fileName?: string): string {
  const lower = (mimeType || '').trim().toLowerCase().split(';')[0].trim();
  if (lower === 'image/jpg') return 'image/jpeg';
  if (lower.startsWith('image/')) return lower;
  const extMatch = (fileName || '').trim().toLowerCase().match(/\.[a-z0-9]+$/);
  if (extMatch && BRANDING_IMAGE_EXT_TO_MIME[extMatch[0]]) {
    return BRANDING_IMAGE_EXT_TO_MIME[extMatch[0]];
  }
  return '';
}

function matchesRegulatoryMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  const mime = mimeType.toLowerCase();
  if (mime === 'application/pdf') {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF
  }
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  return false;
}

export function validateUploadFile(
  mimeType: string,
  sizeBytes: number,
  category?: StoredFileMeta['category'],
  buffer?: Buffer,
  fileName?: string
) {
  if (category === 'candidate_doc' || category === 'course_doc' || category === 'trainer_doc') {
    const check = validateCandidateDocumentFile(
      { name: fileName || '', type: mimeType, size: sizeBytes },
      'additional',
      'en'
    );
    if (!check.valid) {
      throw new Error(check.errorMessage || 'Invalid document file');
    }
    if (!ALLOWED_CANDIDATE_DOC_MIME_TYPES.includes(mimeType.toLowerCase() as (typeof ALLOWED_CANDIDATE_DOC_MIME_TYPES)[number])) {
      throw new Error(`Unsupported document MIME type: ${mimeType}`);
    }
    if (sizeBytes > SAUDI_REGULATORY_MAX_FILE_SIZE_BYTES) {
      throw new Error('Document exceeds maximum allowed size of 5MB');
    }
    if (buffer && !matchesRegulatoryMagicBytes(buffer, mimeType)) {
      throw new Error('File content does not match declared PDF, JPG, or PNG format');
    }
    return;
  }

  if (category === 'branding') {
    if (sizeBytes <= 0) {
      throw new Error('Selected branding image file is empty');
    }
    const normalizedBrandingMime = normalizeBrandingImageMime(mimeType, fileName);
    if (!normalizedBrandingMime) {
      throw new Error(`Unsupported branding image type: ${mimeType || fileName || 'unknown'}`);
    }
    return;
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
  if (sizeBytes > 25 * 1024 * 1024) {
    throw new Error('File exceeds maximum allowed size of 25MB');
  }
}

const KNOWN_CATEGORIES = [
  'candidate_doc',
  'course_doc',
  'training_card',
  'trainer_doc',
  'certificate',
  'branding',
  'report',
] as const;

function inferCategoryFromFileId(fileId: string): StoredFileMeta['category'] | null {
  for (const cat of KNOWN_CATEGORIES) {
    if (fileId.startsWith(`${cat}_`)) return cat;
  }
  return null;
}

export async function savePrivateFile(
  buffer: Buffer,
  metaInput: Omit<StoredFileMeta, 'fileId' | 'fileSize' | 'createdAt'>,
  idToken?: string
): Promise<StoredFileMeta> {
  validateUploadFile(metaInput.mimeType, buffer.length, metaInput.category, buffer, metaInput.fileName);
  ensureVaultDir();

  const resolvedMimeType =
    metaInput.category === 'branding'
      ? normalizeBrandingImageMime(metaInput.mimeType, metaInput.fileName) || metaInput.mimeType
      : metaInput.mimeType;

  const resolvedTenantId = (metaInput.tenantId || 'tenant_default').trim();
  const fileId = `${metaInput.category}_${crypto.randomBytes(12).toString('hex')}`;
  const meta: StoredFileMeta = {
    ...metaInput,
    mimeType: resolvedMimeType,
    tenantId: resolvedTenantId,
    fileId,
    fileSize: buffer.length,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(VAULT_DIR, `${fileId}.bin`), buffer);
  fs.writeFileSync(path.join(VAULT_DIR, `${fileId}.meta.json`), JSON.stringify(meta, null, 2));

  // Mirror to secured Firebase Storage bucket partitioned under tenants/{tenantId}/
  if (STORAGE_BUCKET && idToken) {
    try {
      const storagePath = encodeURIComponent(`tenants/${resolvedTenantId}/${metaInput.category}/${fileId}`);
      const uploadRes = await fetch(
        `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${storagePath}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': metaInput.mimeType,
          },
          body: new Uint8Array(buffer),
        }
      );
      if (uploadRes.ok) {
        await fetch(
          `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${storagePath}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${idToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              metadata: {
                fileId: meta.fileId,
                tenantId: resolvedTenantId,
                fileName: meta.fileName,
                mimeType: meta.mimeType,
                category: meta.category,
                organizationId: meta.organizationId || '',
                candidateDocId: meta.candidateDocId || '',
                candidateUserId: meta.candidateUserId || '',
                isPublicBranding: String(Boolean(meta.isPublicBranding)),
                uploadedBy: meta.uploadedBy,
                createdAt: meta.createdAt,
              },
            }),
          }
        ).catch(() => {});
      }
    } catch {
      // Primary private vault remains intact even if Storage bucket rules/CORS are unconfigured
    }
  }

  return meta;
}

export function readPrivateFile(
  fileId: string,
  expectedTenantId?: string
): { meta: StoredFileMeta; buffer: Buffer } | null {
  if (!/^[a-zA-Z0-9_\-]+$/.test(fileId)) return null;
  ensureVaultDir();
  const metaPath = path.join(VAULT_DIR, `${fileId}.meta.json`);
  const binPath = path.join(VAULT_DIR, `${fileId}.bin`);
  if (!fs.existsSync(metaPath) || !fs.existsSync(binPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as StoredFileMeta;
  if (expectedTenantId) {
    const fileTenant = meta.tenantId || 'tenant_default';
    if (fileTenant !== expectedTenantId) return null;
  }
  const buffer = fs.readFileSync(binPath);
  return { meta, buffer };
}

export async function readPrivateFileAsync(
  fileId: string,
  idToken?: string,
  expectedTenantId?: string
): Promise<{ meta: StoredFileMeta; buffer: Buffer } | null> {
  const local = readPrivateFile(fileId, expectedTenantId);
  if (local) return local;

  if (!/^[a-zA-Z0-9_\-]+$/.test(fileId) || !STORAGE_BUCKET || !idToken) {
    return null;
  }

  const category = inferCategoryFromFileId(fileId);
  if (!category) return null;

  const tenantToTry = (expectedTenantId || 'tenant_default').trim();
  const candidateStoragePaths = [`tenants/${tenantToTry}/${category}/${fileId}`];
  if (!expectedTenantId || expectedTenantId === 'tenant_default') {
    candidateStoragePaths.push(`tcms/${category}/${fileId}`);
  }

  for (const rawStoragePath of candidateStoragePaths) {
    try {
      const storagePath = encodeURIComponent(rawStoragePath);
      const metaRes = await fetch(
        `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${storagePath}`,
        { headers: { Authorization: `Bearer ${idToken}` } }
      );
      if (!metaRes.ok) continue;
      const objMeta = (await metaRes.json()) as {
        contentType?: string;
        size?: string | number;
        metadata?: Record<string, string>;
      };

      const custom = objMeta.metadata || {};
      const objectTenantId = custom.tenantId || 'tenant_default';
      if (expectedTenantId && objectTenantId !== expectedTenantId) {
        continue;
      }

      const mediaRes = await fetch(
        `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${storagePath}?alt=media`,
        { headers: { Authorization: `Bearer ${idToken}` } }
      );
      if (!mediaRes.ok) continue;

      const buffer = Buffer.from(await mediaRes.arrayBuffer());
      const meta: StoredFileMeta = {
        fileId,
        tenantId: objectTenantId,
        fileName: custom.fileName || fileId,
        mimeType: custom.mimeType || objMeta.contentType || 'application/octet-stream',
        fileSize: buffer.length,
        category,
        organizationId: custom.organizationId || undefined,
        candidateDocId: custom.candidateDocId || undefined,
        candidateUserId: custom.candidateUserId || undefined,
        isPublicBranding: custom.isPublicBranding === 'true',
        uploadedBy: custom.uploadedBy || '',
        createdAt: custom.createdAt || new Date().toISOString(),
      };

      ensureVaultDir();
      fs.writeFileSync(path.join(VAULT_DIR, `${fileId}.bin`), buffer);
      fs.writeFileSync(path.join(VAULT_DIR, `${fileId}.meta.json`), JSON.stringify(meta, null, 2));
      return { meta, buffer };
    } catch {
      // try next path
    }
  }
  return null;
}

export function readFileBufferSafe(fileId?: string, expectedTenantId?: string): Buffer | null {
  if (!fileId) return null;
  const found = readPrivateFile(fileId, expectedTenantId);
  return found ? found.buffer : null;
}

export async function deletePrivateFile(fileId: string, idToken?: string, tenantId?: string): Promise<void> {
  if (!fileId || !/^[a-zA-Z0-9_\-]+$/.test(fileId)) return;
  ensureVaultDir();
  const metaPath = path.join(VAULT_DIR, `${fileId}.meta.json`);
  const binPath = path.join(VAULT_DIR, `${fileId}.bin`);
  let category = inferCategoryFromFileId(fileId);
  let fileTenantId = tenantId || 'tenant_default';
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as StoredFileMeta;
      category = meta.category;
      if (meta.tenantId) fileTenantId = meta.tenantId;
    } catch {
      // ignore
    }
    fs.unlinkSync(metaPath);
  }
  if (fs.existsSync(binPath)) {
    fs.unlinkSync(binPath);
  }
  if (STORAGE_BUCKET && idToken && category) {
    const deletePaths = [`tenants/${fileTenantId}/${category}/${fileId}`];
    if (fileTenantId === 'tenant_default') {
      deletePaths.push(`tcms/${category}/${fileId}`);
    }
    for (const rawPath of deletePaths) {
      try {
        const storagePath = encodeURIComponent(rawPath);
        await fetch(`https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${storagePath}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${idToken}` },
        });
      } catch {
        // Non-fatal if Storage object does not exist
      }
    }
  }
}
