// "Save to Google Drive / OneDrive / SharePoint" menu. Renders nothing when no provider is configured.
//   Google Drive: multipart upload to My Drive (drive.file scope)
//   OneDrive:     PUT /me/drive/root:/Lease IQ/<name>:/content
//   SharePoint:   choose site → library → folder, then upload there
// After saving, the file opens in a new tab and a dialog shows its link (Copy / Open) — the dialog also covers
// browsers that block the automatic tab because the upload took too long after the click.
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Modal, useToast } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { googleConfigured, microsoftConfigured } from '../../lib/config.ts';
import { GraphBrowser } from './GraphBrowser.tsx';
import { uploadToGoogleDrive } from './google.ts';
import { uploadToFolder, uploadToOneDrive } from './microsoft.ts';
import './cloud.css';

export interface SaveToCloudProps {
  /** Produces the file to save (called when the user picks a destination). */
  getFile: () => Promise<{ blob: Blob; name: string }>;
  /** Called after a successful save (e.g. to log it). `url` is the file's web link when the provider returns one. */
  onSaved?: (destination: Destination, name: string, url: string | null) => void;
}

type Destination = 'google_drive' | 'onedrive' | 'sharepoint';

interface SavedFile { destination: Destination; name: string; place: string; url: string | null }

/** Open the saved file in a new tab. Returns false when the browser blocked it. */
function openInNewTab(url: string): boolean {
  const w = window.open(url, '_blank');
  if (!w) return false;
  w.opener = null;
  return true;
}

export default function SaveToCloudMenu({ getFile, onSaved }: SaveToCloudProps) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharePoint, setSharePoint] = useState(false);
  const [saved, setSaved] = useState<SavedFile | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!googleConfigured && !microsoftConfigured) return null;

  const report = (err: unknown) => {
    const msg = (err as Error).message;
    if (msg !== 'cancelled') toast(t('cloud.error', { message: msg }), 'danger');
  };

  const done = (file: SavedFile) => {
    if (file.url) openInNewTab(file.url);
    setSaved(file);
    onSaved?.(file.destination, file.name, file.url);
  };

  const save = async (dest: 'google_drive' | 'onedrive') => {
    setOpen(false);
    setBusy(true);
    try {
      const { blob, name } = await getFile();
      if (dest === 'google_drive') {
        const url = await uploadToGoogleDrive(blob, name);
        done({ destination: dest, name, place: t('cloud.googleDrive'), url });
      } else {
        const item = await uploadToOneDrive(blob, name);
        // Graph renames on conflict, so show the name it actually saved under.
        done({ destination: dest, name: item.name || name, place: `${t('cloud.oneDrive')} › Lease IQ`, url: item.webUrl ?? null });
      }
    } catch (err) {
      report(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cl-menu-wrap" ref={ref}>
      <Button size="sm" onClick={() => setOpen((o) => !o)} loading={busy} aria-haspopup="menu" aria-expanded={open}>
        ☁ {t('cloud.saveTo')} ▾
      </Button>
      {open && (
        <div className="menu cl-menu" role="menu">
          {googleConfigured && (
            <button type="button" role="menuitem" className="menu-item" onClick={() => save('google_drive')}>
              <span className="cl-logo cl-logo-google" aria-hidden="true" />{t('cloud.googleDrive')}
            </button>
          )}
          {microsoftConfigured && (
            <>
              <button type="button" role="menuitem" className="menu-item" onClick={() => save('onedrive')}>
                <span className="cl-logo cl-logo-onedrive" aria-hidden="true" />{t('cloud.oneDrive')}
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); setSharePoint(true); }}>
                <span className="cl-logo cl-logo-sharepoint" aria-hidden="true" />{t('cloud.sharePoint')}…
              </button>
            </>
          )}
        </div>
      )}
      {sharePoint && (
        <GraphBrowser
          open
          source="sharepoint"
          mode="folder"
          onClose={() => setSharePoint(false)}
          onFolder={async (token, drive, folderId, label) => {
            setBusy(true);
            try {
              const { blob, name } = await getFile();
              const item = await uploadToFolder(token, drive, folderId, name, blob);
              done({ destination: 'sharepoint', name: item.name || name, place: label, url: item.webUrl ?? null });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {saved && <SavedDialog file={saved} onClose={() => setSaved(null)} />}
    </div>
  );
}

function SavedDialog({ file, onClose }: { file: SavedFile; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.url ?? '');
      toast(t('cloud.linkCopied'), 'success');
    } catch {
      toast(t('cloud.copyFailed'), 'warning');
    }
  };
  return (
    <Modal
      open
      title={t('cloud.savedTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          {file.url && <Button variant="primary" onClick={() => openInNewTab(file.url!)}>{t('cloud.openFile')} ↗</Button>}
        </>
      }
    >
      <div className="form">
        <p>{t('cloud.savedBody', { name: file.name, place: file.place })}</p>
        {file.url ? (
          <div className="cl-link-row">
            <Input readOnly value={file.url} aria-label={t('cloud.link')} onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={copy}>{t('cloud.copyLink')}</Button>
          </div>
        ) : (
          <p className="muted small">{t('cloud.noLink')}</p>
        )}
      </div>
    </Modal>
  );
}
