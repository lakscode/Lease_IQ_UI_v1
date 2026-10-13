// Lease IQ API client. Adds the Supabase access token and the active organization (X-Org-Id).
import { config } from '../lib/config.ts';
import { supabase } from '../lib/supabase.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let activeOrgId: string | null = null;

/** Set by AuthProvider whenever the active organization changes. */
export function setActiveOrgId(orgId: string | null) {
  activeOrgId = orgId;
}

export function getActiveOrgId() {
  return activeOrgId;
}

export function apiUrl(path: string): string {
  return `${config.apiBase}/api${path.startsWith('/') ? path : `/${path}`}`;
}

async function headers(extra?: HeadersInit, json = false): Promise<Headers> {
  const h = new Headers(extra);
  const { data } = await supabase.auth.getSession();
  if (data.session) h.set('Authorization', `Bearer ${data.session.access_token}`);
  if (activeOrgId) h.set('X-Org-Id', activeOrgId);
  if (json) h.set('Content-Type', 'application/json');
  return h;
}

async function toError(res: Response): Promise<ApiError> {
  let body: { error?: string; code?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    // not JSON
  }
  return new ApiError(body?.error || `Request failed (${res.status})`, res.status, body?.code);
}

type Query = Record<string, string | number | boolean | null | undefined | string[]>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path;
}

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(apiUrl(withQuery(path, opts.query)), {
    method,
    headers: await headers(undefined, opts.body !== undefined && !isForm),
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    signal: opts.signal,
  });
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const get = <T>(path: string, query?: Query, signal?: AbortSignal) => api<T>('GET', path, { query, signal });
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, { body });
export const patch = <T>(path: string, body?: unknown) => api<T>('PATCH', path, { body });
export const put = <T>(path: string, body?: unknown) => api<T>('PUT', path, { body });
export const del = <T>(path: string, body?: unknown) => api<T>('DELETE', path, { body });

/** Fetch a binary response (PDF, CSV). Returns the blob and the server-suggested filename. */
export async function getBlob(path: string, query?: Query, method = 'GET', body?: unknown): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(apiUrl(withQuery(path, query)), {
    method,
    headers: await headers(undefined, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return { blob: await res.blob(), filename: match ? decodeURIComponent(match[1]) : null };
}

/** Trigger a browser download for a blob. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
