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

export function reportError(report: ErrorReport): void {
  console.error(`[${report.area}]`, report.code ?? '', report.message, report.details ?? '');
  void send(report);
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
