// OneDrive / SharePoint through Microsoft Graph with MSAL (popup sign-in).
// MSAL v5 popups return through a redirect bridge page: public/msal-redirect.html (see docs/CLOUD_SETUP.md).
import type { IPublicClientApplication } from '@azure/msal-browser';
import { config } from '../../lib/config.ts';

export const READ_SCOPES = ['Files.Read.All', 'Sites.Read.All'];
export const ONEDRIVE_WRITE_SCOPES = ['Files.ReadWrite'];
export const SHAREPOINT_WRITE_SCOPES = ['Sites.ReadWrite.All'];

const GRAPH = 'https://graph.microsoft.com/v1.0';

let msalPromise: Promise<IPublicClientApplication> | null = null;

function getMsal(): Promise<IPublicClientApplication> {
  msalPromise ??= (async () => {
    const { createStandardPublicClientApplication } = await import('@azure/msal-browser');
    return createStandardPublicClientApplication({
      auth: {
        clientId: config.microsoft.clientId,
        authority: config.microsoft.authority,
        redirectUri: `${window.location.origin}/msal-redirect.html`,
      },
      cache: { cacheLocation: 'sessionStorage' },
    });
  })().catch((err) => {
    msalPromise = null;
    throw err;
  });
  return msalPromise;
}

/** Graph access token for the scopes: silent when possible, otherwise a popup. */
export async function getGraphToken(scopes: string[]): Promise<string> {
  const msal = await getMsal();
  const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;
  if (account) {
    try {
      const r = await msal.acquireTokenSilent({ scopes, account });
      return r.accessToken;
    } catch {
      // fall through to interactive
    }
  }
  try {
    const r = await msal.acquireTokenPopup({ scopes, prompt: account ? undefined : 'select_account' });
    msal.setActiveAccount(r.account);
    return r.accessToken;
  } catch (err) {
    const e = err as { errorCode?: string; message?: string };
    if (e.errorCode === 'user_cancelled' || e.errorCode === 'popup_window_error') throw new Error('cancelled');
    throw err;
  }
}

export async function graph<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `Microsoft Graph error ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) msg = j.error.message;
    } catch {
      // not JSON
    }
    throw new Error(msg);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  webUrl?: string;
  parentReference?: { driveId?: string };
}
export interface Site { id: string; displayName: string; webUrl: string; name?: string }
export interface Drive { id: string; name: string; driveType: string; webUrl?: string }

/** A drive location: OneDrive (`me`) or a SharePoint document library (drive id). */
export interface DriveRef { driveId: string | null; label: string }

function drivePath(drive: DriveRef): string {
  return drive.driveId ? `/drives/${encodeURIComponent(drive.driveId)}` : '/me/drive';
}

export async function listChildren(token: string, drive: DriveRef, itemId: string | null): Promise<DriveItem[]> {
  const base = `${drivePath(drive)}/${itemId ? `items/${encodeURIComponent(itemId)}` : 'root'}/children`;
  const out: DriveItem[] = [];
  let url: string | undefined = `${base}?$top=200&$select=id,name,size,lastModifiedDateTime,folder,file,webUrl,parentReference`;
  while (url && out.length < 1000) {
    const page: { value: DriveItem[]; '@odata.nextLink'?: string } = await graph(token, url);
    out.push(...page.value);
    url = page['@odata.nextLink'];
  }
  return out.sort((a, b) => Number(Boolean(b.folder)) - Number(Boolean(a.folder)) || a.name.localeCompare(b.name));
}

export async function searchSites(token: string, query: string): Promise<Site[]> {
  const q = query.trim() || '*';
  const r = await graph<{ value: Site[] }>(token, `/sites?search=${encodeURIComponent(q)}&$top=50`);
  return r.value;
}

export async function listLibraries(token: string, siteId: string): Promise<Drive[]> {
  const r = await graph<{ value: Drive[] }>(token, `/sites/${encodeURIComponent(siteId)}/drives`);
  return r.value.filter((d) => d.driveType === 'documentLibrary' || d.driveType === 'business');
}

export async function downloadItem(token: string, drive: DriveRef, item: DriveItem): Promise<File> {
  const res = await fetch(`${GRAPH}${drivePath(drive)}/items/${encodeURIComponent(item.id)}/content`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Could not download ${item.name} (${res.status}).`);
  const blob = await res.blob();
  return new File([blob], item.name, { type: item.file?.mimeType || blob.type });
}

function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

/** Simple upload (files up to 250 MB) into a folder; conflicts are renamed by Graph. */
export async function uploadToFolder(token: string, drive: DriveRef, folderId: string | null, name: string, blob: Blob): Promise<DriveItem> {
  const target = folderId ? `items/${encodeURIComponent(folderId)}` : 'root';
  return graph<DriveItem>(token, `${drivePath(drive)}/${target}:/${encodePath(name)}:/content?@microsoft.graph.conflictBehavior=rename`, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
}

/** OneDrive: save to /Lease IQ/<name> (the folder is created automatically). */
export async function uploadToOneDrive(blob: Blob, name: string): Promise<DriveItem> {
  const token = await getGraphToken(ONEDRIVE_WRITE_SCOPES);
  return graph<DriveItem>(token, `/me/drive/root:/${encodePath(`Lease IQ/${name}`)}:/content?@microsoft.graph.conflictBehavior=rename`, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
}

/** Does a picked item match the accepted MIME types / extensions? */
export function accepts(item: DriveItem, accept?: string[]): boolean {
  if (!item.file) return false;
  if (!accept?.length) return true;
  const mime = item.file.mimeType?.toLowerCase() ?? '';
  const name = item.name.toLowerCase();
  return accept.some((a) => {
    const x = a.toLowerCase();
    if (x.startsWith('.')) return name.endsWith(x);
    if (x.endsWith('/*')) return mime.startsWith(x.slice(0, -1));
    if (x === mime) return true;
    // Graph sometimes reports CSV as text/plain or application/vnd.ms-excel; fall back to extension.
    const ext = EXT_BY_MIME[x];
    return ext ? ext.some((e) => name.endsWith(e)) : false;
  });
}

const EXT_BY_MIME: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'text/csv': ['.csv'],
  'text/plain': ['.txt'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls', '.csv'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'message/rfc822': ['.eml'],
  'application/vnd.ms-outlook': ['.msg'],
};
