import { auth } from '../firebase';

let activeTenantId: string | null = null;

export function setActiveTenantId(tenantId: string | null): void {
  activeTenantId = tenantId ? tenantId.trim() : null;
}

export function getActiveTenantId(): string | null {
  return activeTenantId;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = typeof data.code === 'string' ? data.code : undefined;
    this.data = data;
  }
}

export async function apiFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  const headers = new Headers(init.headers || {});
  if (user) {
    const token = await user.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (activeTenantId && !headers.has('x-tenant-id')) {
    headers.set('x-tenant-id', activeTenantId);
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new ApiError(text || `Request failed (${res.status})`, res.status);
  }
  if (!res.ok) {
    throw new ApiError(String(json.error || `Request failed (${res.status})`), res.status, json);
  }
  return json as T;
}

export async function downloadProtectedFile(
  url: string,
  filename: string,
  init: RequestInit = {}
): Promise<void> {
  const user = auth.currentUser;
  const headers = new Headers(init.headers || {});
  if (user) {
    const token = await user.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (activeTenantId && !headers.has('x-tenant-id')) {
    headers.set('x-tenant-id', activeTenantId);
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

export async function fetchProtectedFileUrl(fileId: string): Promise<string> {
  const user = auth.currentUser;
  const headers = new Headers();
  if (user) {
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  }
  if (activeTenantId && !headers.has('x-tenant-id')) {
    headers.set('x-tenant-id', activeTenantId);
  }
  const res = await fetch(`/api/files/${encodeURIComponent(fileId)}`, { headers });
  if (!res.ok) throw new Error('File unavailable');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function uploadProtectedFile(
  file: File,
  category: string,
  extra: Record<string, string> = {}
): Promise<{ fileId: string; fileName: string; mimeType: string; fileSize: number }> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('category', category);
  for (const [k, v] of Object.entries(extra)) {
    fd.append(k, v);
  }
  const data = await apiFetch<{
    file: { fileId: string; fileName: string; mimeType: string; fileSize: number };
  }>('/api/files/upload', {
    method: 'POST',
    body: fd,
  });
  return data.file;
}
