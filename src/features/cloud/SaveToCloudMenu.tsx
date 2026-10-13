// "Save to Google Drive / OneDrive / SharePoint" menu. Renders nothing when no provider is configured.
//   Google Drive: multipart upload to My Drive (drive.file scope)
//   OneDrive:     PUT /me/drive/root:/Lease IQ/<name>:/content
//   SharePoint:   choose site → library → folder, then upload there
import { useEffect, useRef, useState } from 'react';
import { Button, useToast } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { googleConfigured, microsoftConfigured } from '../../lib/config.ts';
import { GraphBrowser } from './GraphBrowser.tsx';
import { uploadToGoogleDrive } from './google.ts';
import { uploadToFolder, uploadToOneDrive } from './microsoft.ts';
import './cloud.css';

export interface SaveToCloudProps {
  /** Produces the file to save (called when the user picks a destination). */
  getFile: () => Promise<{ blob: Blob; name: string }>;
  /** Called after a successful save (e.g. to log it). */
  onSaved?: (destination: 'google_drive' | 'onedrive' | 'sharepoint', name: string) => void;
}

export default function SaveToCloudMenu({ getFile, onSaved }: SaveToCloudProps) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharePoint, setSharePoint] = useState(false);
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

  const save = async (dest: 'google_drive' | 'onedrive') => {
    setOpen(false);
    setBusy(true);
    try {
      const { blob, name } = await getFile();
      if (dest === 'google_drive') await uploadToGoogleDrive(blob, name);
      else await uploadToOneDrive(blob, name);
      toast(t(dest === 'google_drive' ? 'cloud.savedGoogle' : 'cloud.savedOneDrive', { name }));
      onSaved?.(dest, name);
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
              await uploadToFolder(token, drive, folderId, name, blob);
              toast(t('cloud.savedSharePoint', { name, folder: label }));
              onSaved?.('sharepoint', name);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
