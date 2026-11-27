import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const SECRET_FILE = path.join(DATA_DIR, '.server-secret');

let warnedWeakKey = false;

function getMasterSecret(): Buffer {
  const envKey = process.env.SERVER_ENCRYPTION_KEY;
  if (envKey && envKey.trim() && envKey !== 'CHANGE_ME_IN_PRODUCTION_TO_A_32_BYTE_SECRET') {
    return crypto.createHash('sha256').update(envKey.trim()).digest();
  }
  if (process.env.NODE_ENV === 'production' && !warnedWeakKey) {
    warnedWeakKey = true;
    console.warn(
      '[TCMS Security] SERVER_ENCRYPTION_KEY is not set to a persistent secret in production. Configure SERVER_ENCRYPTION_KEY in Secret Manager so encrypted PII and HMAC hashes survive container restarts.'
    );
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(SECRET_FILE)) {
    const hex = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (hex.length === 64) {
      return Buffer.from(hex, 'hex');
    }
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_FILE, generated.toString('hex'), { mode: 0o600 });
  return generated;
}

export function encryptSensitive(plaintext: string): string {
  if (!plaintext) return '';
  const key = getMasterSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSensitive(payload: string): string {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 3) return '';
  const [ivB64, tagB64, dataB64] = parts;
  const key = getMasterSecret();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function hmacIdentityHash(idType: 'iqama' | 'passport', rawValue: string): string {
  const normalized = rawValue.trim().toUpperCase().replace(/\s+/g, '');
  const key = getMasterSecret();
  const digest = crypto.createHmac('sha256', key).update(`${idType}:${normalized}`).digest('hex');
  return `${idType}_${digest}`;
}

export function hmacTenantIdentityHash(
  tenantId: string,
  idType: 'iqama' | 'passport',
  rawValue: string
): string {
  const normalizedTenant = (tenantId || 'tenant_default').trim();
  const normalized = rawValue.trim().toUpperCase().replace(/\s+/g, '');
  const key = getMasterSecret();
  const digest = crypto
    .createHmac('sha256', key)
    .update(`${normalizedTenant}:${idType}:${normalized}`)
    .digest('hex');
  return `${normalizedTenant}_${idType}_${digest}`;
}

export function maskIdentity(rawValue: string): string {
  const clean = rawValue.trim();
  if (!clean) return '';
  if (clean.length <= 4) return '•'.repeat(clean.length);
  return `${'•'.repeat(clean.length - 4)}${clean.slice(-4)}`;
}

export function generateVerificationToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(24).toString('base64url');
  const tokenHash = hashVerificationToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashVerificationToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

export function hashEmailKey(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 40);
}

export function hashTenantEmailKey(tenantId: string, email: string): string {
  const normalizedTenant = (tenantId || 'tenant_default').trim();
  return `${normalizedTenant}_${hashEmailKey(email)}`.slice(0, 120);
}

export function randomId(prefix = ''): string {
  const id = crypto.randomBytes(10).toString('hex');
  return prefix ? `${prefix}_${id}` : id;
}
