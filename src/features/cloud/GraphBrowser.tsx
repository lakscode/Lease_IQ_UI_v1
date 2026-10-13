// Microsoft Graph file browser modal: OneDrive folders, or SharePoint site → document library → folders.
// mode "pick" returns downloaded files; mode "folder" returns the chosen destination folder.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, EmptyState, Input, Modal, Spinner } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatBytes, formatDateTime } from '../../lib/format.ts';
import {
  READ_SCOPES, SHAREPOINT_WRITE_SCOPES, accepts, downloadItem, getGraphToken, listChildren, listLibraries, searchSites,
  type Drive, type DriveItem, type DriveRef, type Site,
} from './microsoft.ts';
import './cloud.css';

export type GraphSource = 'onedrive' | 'sharepoint';

export function GraphBrowser({ open, onClose, source, mode, accept, multiple, onPicked, onFolder }: {
  open: boolean;
  onClose: () => void;
  source: GraphSource;
  mode: 'pick' | 'folder';
  accept?: string[];
  multiple?: boolean;
  onPicked?: (files: File[]) => void;
  onFolder?: (token: string, drive: DriveRef, folderId: string | null, label: string) => Promise<void>;
}) {
  const t = useT();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'sites' | 'libraries' | 'browse'>(source === 'sharepoint' ? 'sites' : 'browse');
  const [query, setQuery] = useState('');
  const [sites, setSites] = useState<Site[] | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [libraries, setLibraries] = useState<Drive[] | null>(null);
  const [drive, setDrive] = useState<DriveRef>({ driveId: null, label: 'OneDrive' });
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<DriveItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      const msg = (err as Error).message;
      if (msg !== 'cancelled') setError(msg);
      else onCloseRef.current();
    } finally {
      setBusy(false);
    }
  }, []);

  // Sign in when opened, then load the first view.
  useEffect(() => {
    if (!open) return;
    setStep(source === 'sharepoint' ? 'sites' : 'browse');
    setPath([]);
    setSelected(new Set());
    setItems(null);
    setSites(null);
    setSite(null);
    setLibraries(null);
    setDrive({ driveId: null, label: 'OneDrive' });
    run(async () => {
      const tk = await getGraphToken(mode === 'folder' && source === 'sharepoint' ? SHAREPOINT_WRITE_SCOPES : READ_SCOPES);
      setToken(tk);
      if (source === 'sharepoint') setSites(await searchSites(tk, ''));
      else setItems(await listChildren(tk, { driveId: null, label: 'OneDrive' }, null));
    });
  }, [open, source, mode, run]);

  const folderId = path.length ? path[path.length - 1].id : null;

  const openFolder = (item: { id: string; name: string } | null, index?: number) =>
    run(async () => {
      if (!token) return;
      const nextPath = item === null ? (index === undefined ? [] : path.slice(0, index + 1)) : [...path, item];
      setItems(null);
      setSelected(new Set());
      setItems(await listChildren(token, drive, nextPath.length ? nextPath[nextPath.length - 1].id : null));
      setPath(nextPath);
    });

  const chooseSite = (s: Site) =>
    run(async () => {
      if (!token) return;
      setSite(s);
      setLibraries(await listLibraries(token, s.id));
      setStep('libraries');
    });

  const chooseLibrary = (d: Drive) =>
    run(async () => {
      if (!token) return;
      const ref = { driveId: d.id, label: `${site?.displayName ?? ''} › ${d.name}` };
      setDrive(ref);
      setPath([]);
      setItems(await listChildren(token, ref, null));
      setStep('browse');
    });

  const toggle = (item: DriveItem) => {
    setSelected((cur) => {
      const next = new Set(multiple ? cur : []);
      if (cur.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const confirm = () =>
    run(async () => {
      if (!token) return;
      if (mode === 'pick') {
        const chosen = (items ?? []).filter((i) => selected.has(i.id));
        const files = await Promise.all(chosen.map((i) => downloadItem(token, drive, i)));
        onPicked?.(files);
        onClose();
      } else {
        const label = [drive.label, ...path.map((p) => p.name)].join(' › ');
        await onFolder?.(token, drive, folderId, label);
        onClose();
      }
    });

  const title = mode === 'pick'
    ? t(source === 'sharepoint' ? 'cloud.pickFromSharePoint' : 'cloud.pickFromOneDrive')
    : t('cloud.chooseFolder');

  const visible = (items ?? []).filter((i) => i.folder || (mode === 'pick' && accepts(i, accept)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={title}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {step === 'browse' && (
            <Button variant="primary" loading={busy && Boolean(items)} disabled={busy || (mode === 'pick' && selected.size === 0)} onClick={confirm}>
              {mode === 'pick' ? t('cloud.addSelected', { n: selected.size }) : t('cloud.saveHere')}
            </Button>
          )}
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="danger">{error}</Alert>}

        {step === 'sites' && (
          <>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  if (token) setSites(await searchSites(token, query));
                });
              }}
            >
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('cloud.searchSites')} style={{ flex: 1 }} />
              <Button type="submit">{t('common.search')}</Button>
            </form>
            {!sites ? <Spinner /> : sites.length === 0 ? <EmptyState icon="🔎" title={t('cloud.noSites')} /> : (
              <ul className="cl-list">
                {sites.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="cl-item" onClick={() => chooseSite(s)} disabled={busy}>
                      <span aria-hidden="true">🏢</span>
                      <span className="cl-name">{s.displayName}<span className="cl-sub">{s.webUrl}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {step === 'libraries' && (
          <>
            <div className="cl-crumbs">
              <button type="button" onClick={() => setStep('sites')}>{t('cloud.sites')}</button>
              <span>›</span>
              <strong>{site?.displayName}</strong>
            </div>
            {!libraries ? <Spinner /> : libraries.length === 0 ? <EmptyState icon="📚" title={t('cloud.noLibraries')} /> : (
              <ul className="cl-list">
                {libraries.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="cl-item" onClick={() => chooseLibrary(d)} disabled={busy}>
                      <span aria-hidden="true">📚</span>
                      <span className="cl-name">{d.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {step === 'browse' && (
          <>
            <div className="cl-crumbs">
              {source === 'sharepoint' && (
                <>
                  <button type="button" onClick={() => setStep('libraries')}>{site?.displayName}</button>
                  <span>›</span>
                </>
              )}
              <button type="button" onClick={() => openFolder(null)}>{source === 'sharepoint' ? drive.label.split(' › ').pop() : 'OneDrive'}</button>
              {path.map((p, i) => (
                <span key={p.id} className="row" style={{ gap: 6 }}>
                  <span>›</span>
                  <button type="button" onClick={() => openFolder(null, i)}>{p.name}</button>
                </span>
              ))}
            </div>
            {!items ? <Spinner /> : visible.length === 0 ? <EmptyState icon="📂" title={t('cloud.emptyFolder')} /> : (
              <ul className="cl-list">
                {visible.map((i) =>
                  i.folder ? (
                    <li key={i.id}>
                      <button type="button" className="cl-item" onClick={() => openFolder({ id: i.id, name: i.name })} disabled={busy}>
                        <span aria-hidden="true">📁</span>
                        <span className="cl-name">{i.name}<span className="cl-sub">{t('cloud.items', { n: i.folder.childCount })}</span></span>
                      </button>
                    </li>
                  ) : (
                    <li key={i.id}>
                      <label className="cl-item">
                        <input type={multiple ? 'checkbox' : 'radio'} name="cl-pick" checked={selected.has(i.id)} onChange={() => toggle(i)} />
                        <span className="cl-name">{i.name}<span className="cl-sub">{formatBytes(i.size)} · {formatDateTime(i.lastModifiedDateTime)}</span></span>
                      </label>
                    </li>
                  ),
                )}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
