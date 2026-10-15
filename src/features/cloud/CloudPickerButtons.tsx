// "Pick from Google Drive / OneDrive / SharePoint" buttons. Each provider's button only renders when it is
// configured (VITE_GOOGLE_* / VITE_MS_CLIENT_ID); with neither configured the component renders nothing.
import { useState } from 'react';
import { Button } from '../../components/ui.tsx';
import { useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { googleConfigured, microsoftConfigured } from '../../lib/config.ts';
import { GraphBrowser, type GraphSource } from './GraphBrowser.tsx';
import { pickGoogleFiles } from './google.ts';
import './cloud.css';

export interface CloudPickerProps {
  /** Called with the picked files, already downloaded as File objects. */
  onPicked: (files: File[], source: 'google_drive' | 'onedrive' | 'sharepoint') => void;
  accept?: string[];          // MIME types, e.g. ['application/pdf']
  multiple?: boolean;
  disabled?: boolean;
}

export default function CloudPickerButtons({ onPicked, accept, multiple, disabled }: CloudPickerProps) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [graph, setGraph] = useState<GraphSource | null>(null);

  if (!googleConfigured && !microsoftConfigured) return null;

  const pickGoogle = async () => {
    setBusy(true);
    try {
      const files = await pickGoogleFiles({ mimeTypes: accept, multiple });
      if (files.length) onPicked(files, 'google_drive');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg !== 'cancelled') toast(t('cloud.error', { message: msg }), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cl-buttons">
      {googleConfigured && (
        <Button size="sm" onClick={pickGoogle} loading={busy} disabled={disabled}>
          <span className="cl-logo cl-logo-google" aria-hidden="true" />{t('cloud.googleDrive')}
        </Button>
      )}
      {microsoftConfigured && (
        <>
          <Button size="sm" onClick={() => setGraph('onedrive')} disabled={disabled}>
            <span className="cl-logo cl-logo-onedrive" aria-hidden="true" />{t('cloud.oneDrive')}
          </Button>
          <Button size="sm" onClick={() => setGraph('sharepoint')} disabled={disabled}>
            <span className="cl-logo cl-logo-sharepoint" aria-hidden="true" />{t('cloud.sharePoint')}
          </Button>
          {graph && (
            <GraphBrowser
              open
              source={graph}
              mode="pick"
              accept={accept}
              multiple={multiple}
              onClose={() => setGraph(null)}
              onPicked={(files) => files.length && onPicked(files, graph)}
            />
          )}
        </>
      )}
    </div>
  );
}
