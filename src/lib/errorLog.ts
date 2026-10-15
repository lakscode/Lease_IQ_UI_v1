// Reports failures to the API error log (Settings → Error log). Fire-and-forget: never throws, never blocks the UI.
import { apiUrl } from '../api/client.ts';
import { supabase } from './supabase.ts';

export interface ErrorReport {
  /** Where it happened, lower-case dotted: 'signup', 'signup.sso', 'signup.oauth' */
  area: string;
  message: string;
  level?: 'error' | 'warning';
  code?: string | null;
  email?: string | null;
  details?: Record<string, unknown>;
}

// At most this many reports per page load, and identical reports are sent once per 30 s (avoids error storms).
const MAX_REPORTS = 30;
let sent = 0;
const recent = new Map<string, number>();

export function reportError(report: ErrorReport): void {
  const log = report.level === 'warning' ? console.warn : console.error;
  log(`[${report.area}]`, report.code ?? '', report.message, report.details ?? '');
  const key = `${report.area}|${report.code ?? ''}|${report.message}`;
  const now = Date.now();
  if (sent >= MAX_REPORTS || now - (recent.get(key) ?? 0) < 30_000) return;
  recent.set(key, now);
  sent += 1;
  void send(report);
}

let globalInstalled = false;

/** Report uncaught errors and unhandled promise rejections (call once at startup). */
export function installGlobalErrorReporting(): void {
  if (globalInstalled) return;
  globalInstalled = true;
  window.addEventListener('error', (e) => {
    if (!e.error && !e.message) return; // resource load errors carry no message
    const err = e.error as Error | undefined;
    reportError({
      area: 'ui.unhandled',
      message: err?.message || e.message,
      code: err?.name ?? null,
      details: { source: e.filename, line: e.lineno, col: e.colno, stack: err?.stack?.split('\n').slice(0, 6).join('\n') },
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const err = e.reason as Error & { status?: number; code?: string };
    if (err?.name === 'AbortError') return;
    // API errors are reported by the API client already.
    if (err?.name === 'ApiError') return;
    reportError({
      area: 'ui.unhandled_rejection',
      message: err?.message || String(e.reason),
      code: err?.code ?? err?.name ?? null,
      details: { stack: err?.stack?.split('\n').slice(0, 6).join('\n') },
    });
  });
}

async function send(report: ErrorReport) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
    await fetch(apiUrl('/client-errors'), {
      method: 'POST',
      headers,
      keepalive: true, // still delivered when the page navigates away (e.g. an OAuth redirect)
      body: JSON.stringify({ ...report, path: window.location.pathname }),
    });
  } catch {
    // Logging must never break the page.
  }
}

/** Supabase AuthError (and plain errors) → the fields we log. */
export function authErrorFields(err: unknown): Pick<ErrorReport, 'message' | 'code' | 'details'> {
  const e = err as { message?: string; code?: string; name?: string; status?: number };
  return {
    message: e?.message || String(err),
    code: e?.code || e?.name || null,
    details: e?.status ? { status: e.status } : undefined,
  };
}

// ---- OAuth (Google / Microsoft) round trip --------------------------------------------------------
// The provider redirects back with ?error=…&error_description=… (or the same in the URL hash) when sign-in fails.
// We remember where the flow started so the log entry says 'signup.oauth' rather than a generic area.

const OAUTH_KEY = 'leaseiq.oauthStart';

export function rememberOAuthStart(area: string, provider: string) {
  try {
    sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ area, provider, at: Date.now() }));
  } catch {
    // ignore
  }
}

let oauthChecked = false;

/** Call on app start. Logs an OAuth error returned in the URL, if any (once per page load). */
export function captureOAuthRedirectError(): void {
  if (oauthChecked) return;
  oauthChecked = true;
  let start: { area?: string; provider?: string } = {};
  try {
    start = JSON.parse(sessionStorage.getItem(OAUTH_KEY) || '{}');
    sessionStorage.removeItem(OAUTH_KEY);
  } catch {
    // ignore
  }
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const error = params.get('error') || hash.get('error');
  if (!error) return;
  const description = params.get('error_description') || hash.get('error_description');
  reportError({
    area: start.area ? `${start.area}.oauth` : 'auth.oauth',
    code: params.get('error_code') || hash.get('error_code') || error,
    message: description || error,
    details: { provider: start.provider ?? null, error },
  });
}
