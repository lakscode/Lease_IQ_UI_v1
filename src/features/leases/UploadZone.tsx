// Drag-and-drop / file chooser / cloud picker upload of lease PDFs. Each file goes straight to storage with a
// signed upload URL, then is registered with POST /api/files (which starts processing).
import { useRef, useState, type DragEvent } from 'react';
import { Button } from '../../components/ui.tsx';
import { cx } from '../../components/ui-utils.ts';
import { useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { useAuth } from '../../auth/useAuth.ts';
import { post } from '../../api/client.ts';
import { supabase } from '../../lib/supabase.ts';
import { formatBytes } from '../../lib/format.ts';
import CloudPickerButtons from '../cloud/CloudPickerButtons.tsx';

type Source = 'computer' | 'google_drive' | 'onedrive' | 'sharepoint';

interface UploadItem {
  key: string;
  name: string;
  size: number;
  state: 'uploading' | 'done' | 'error';
  error?: string;
}

export default function UploadZone({ targetLeaseId, onUploaded, compact }: {
  targetLeaseId?: string | null;
  onUploaded?: () => void;
  compact?: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const { config } = useAuth();
  const maxMb = config?.maxUploadMb ?? 50;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);

  const update = (key: string, patch: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function uploadOne(file: File, source: Source, key: string) {
    try {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error(t('leases.upload.onlyPdf'));
      if (file.size > maxMb * 1024 * 1024) throw new Error(t('leases.upload.tooLarge', { mb: maxMb }));
      const name = /\.pdf$/i.test(file.name) ? file.name : `${file.name}.pdf`;
      const signed = await post<{ file_id: string; path: string; token: string }>('/files/upload-url', { file_name: name, size: file.size });
      const { error } = await supabase.storage.from('leases').uploadToSignedUrl(signed.path, signed.token, file, { contentType: 'application/pdf' });
      if (error) throw new Error(error.message);
      await post('/files', {
        file_id: signed.file_id, path: signed.path, file_name: name, size: file.size, source,
        ...(targetLeaseId ? { target_lease_id: targetLeaseId } : {}),
      });
      update(key, { state: 'done' });
      onUploaded?.();
    } catch (err) {
      update(key, { state: 'error', error: (err as Error).message });
    }
  }

  async function handleFiles(files: File[], source: Source = 'computer') {
    if (!files.length) return;
    const added = files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, size: f.size, state: 'uploading' as const }));
    setItems((list) => [...added, ...list].slice(0, 20));
    // Upload a few at a time.
    const queue = files.map((f, i) => ({ f, key: added[i].key }));
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await uploadOne(next.f, source, next.key);
    });
    await Promise.all(workers);
    toast(t('leases.upload.started', { count: files.length }), 'success');
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="lw-upload">
      <div
        className={cx('lw-dropzone', dragging && 'lw-dropzone-active', compact && 'lw-dropzone-compact')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      >
        <div className="lw-dropzone-icon" aria-hidden="true">⬆</div>
        <strong>{targetLeaseId ? t('leases.upload.amendmentTitle') : t('leases.upload.title')}</strong>
        <span className="muted small">{t('leases.upload.hint', { mb: maxMb })}</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      <div className="row lw-upload-actions">
        <Button size="sm" onClick={() => inputRef.current?.click()}>{t('leases.upload.choose')}</Button>
        <CloudPickerButtons accept={['application/pdf']} multiple onPicked={(files, source) => handleFiles(files, source)} />
      </div>
      {items.length > 0 && (
        <ul className="lw-upload-list">
          {items.map((i) => (
            <li key={i.key}>
              <span className="lw-upload-name">{i.name}</span>
              <span className="muted small">{formatBytes(i.size)}</span>
              {i.state === 'uploading' && <span className="muted small"><span className="spinner spinner-inline" aria-hidden="true" /> {t('leases.upload.uploading')}</span>}
              {i.state === 'done' && <span className="lw-ok small">✓ {t('leases.upload.queued')}</span>}
              {i.state === 'error' && <span className="lw-err small">{i.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
