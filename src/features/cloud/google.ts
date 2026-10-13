// Google Drive: Google Identity Services token client + Google Picker, and multipart upload.
// Scope drive.file: the app can read files the user picks in the Picker and the files it creates.
import { config } from '../../lib/config.ts';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const GAPI_SRC = 'https://apis.google.com/js/api.js';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

// ---- Minimal typings for the bits of GIS / gapi / Picker we use --------------------------------

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void }
interface PickerDoc { id: string; name: string; mimeType: string }
interface PickerData { action: string; docs?: PickerDoc[] }
interface PickerBuilder {
  addView: (v: unknown) => PickerBuilder;
  setOAuthToken: (t: string) => PickerBuilder;
  setDeveloperKey: (k: string) => PickerBuilder;
  setAppId: (id: string) => PickerBuilder;
  setCallback: (cb: (d: PickerData) => void) => PickerBuilder;
  enableFeature: (f: unknown) => PickerBuilder;
  setTitle: (t: string) => PickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
}
interface GoogleNS {
  accounts: { oauth2: { initTokenClient: (o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }) => TokenClient } };
  picker: {
    PickerBuilder: new () => PickerBuilder;
    DocsView: new (viewId?: unknown) => { setMimeTypes: (m: string) => unknown; setIncludeFolders: (b: boolean) => unknown; setSelectFolderEnabled: (b: boolean) => unknown };
    ViewId: { DOCS: unknown };
    Feature: { MULTISELECT_ENABLED: unknown; SUPPORT_DRIVES: unknown };
    Action: { PICKED: string; CANCEL: string };
  };
}
interface GapiNS { load: (lib: string, cb: { callback: () => void; onerror: () => void } | (() => void)) => void }

const w = window as unknown as { google?: GoogleNS; gapi?: GapiNS };

const scripts = new Map<string, Promise<void>>();
export function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scripts.delete(src);
        reject(new Error(`Could not load ${src}`));
      };
      document.head.appendChild(el);
    });
    scripts.set(src, p);
  }
  return p;
}

let cached: { token: string; expires: number } | null = null;

/** Access token for Drive (popup consent the first time; cached until it expires). */
export async function getGoogleToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  await loadScript(GIS_SRC);
  const google = w.google;
  if (!google?.accounts?.oauth2) throw new Error('Google Identity Services did not load.');
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: config.google.clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || 'Google sign-in failed.'));
        cached = { token: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'cancelled' : e.message || e.type)),
    });
    client.requestAccessToken({ prompt: cached ? '' : undefined });
  });
}

async function loadPicker(): Promise<GoogleNS['picker']> {
  await loadScript(GAPI_SRC);
  const gapi = w.gapi;
  if (!gapi) throw new Error('Google API did not load.');
  await new Promise<void>((resolve, reject) => gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('Google Picker did not load.')) }));
  if (!w.google?.picker) throw new Error('Google Picker did not load.');
  return w.google.picker;
}

/** Open the Google Picker and download the chosen files. Resolves [] when cancelled. */
export async function pickGoogleFiles(opts: { mimeTypes?: string[]; multiple?: boolean; title?: string }): Promise<File[]> {
  const [token, picker] = await Promise.all([getGoogleToken(), loadPicker()]);
  const docs = await new Promise<PickerDoc[]>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(false);
    if (opts.mimeTypes?.length) view.setMimeTypes(opts.mimeTypes.join(','));
    let builder = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(config.google.apiKey)
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs ?? []);
        else if (data.action === picker.Action.CANCEL) resolve([]);
      });
    if (config.google.appId) builder = builder.setAppId(config.google.appId);
    if (opts.multiple) builder = builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
    if (opts.title) builder = builder.setTitle(opts.title);
    builder.build().setVisible(true);
  });
  return Promise.all(
    docs.map(async (d) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(d.id)}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Could not download ${d.name} from Google Drive (${res.status}).`);
      const blob = await res.blob();
      return new File([blob], d.name, { type: d.mimeType || blob.type });
    }),
  );
}

/** Upload a file to the root of the user's Drive. Returns the new file's web link. */
export async function uploadToGoogleDrive(blob: Blob, name: string): Promise<string | null> {
  const token = await getGoogleToken();
  const boundary = `leaseiq${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name, mimeType: blob.type || 'application/octet-stream' });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Google Drive upload failed (${res.status}).`);
  const json = (await res.json()) as { webViewLink?: string };
  return json.webViewLink ?? null;
}
