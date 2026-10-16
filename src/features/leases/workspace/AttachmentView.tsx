// Supporting-document pane of the Documents tab (preview, details, AI review, actions) and its upload/edit dialogs.
import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, Spinner, Textarea } from '../../../components/ui.tsx';
import { useConfirm, useToast } from '../../../components/feedback.ts';
import { useT } from '../../../i18n/index.tsx';
import { useAuth } from '../../../auth/useAuth.ts';
import { formatBytes, formatDate, formatDateTime, formatMoney } from '../../../lib/format.ts';
import { AiNotConfigured, JobStatusBadge, SeverityBadge } from '../../intelligence/shared.tsx';
import { errorText, isAiNotConfigured } from '../../intelligence/helpers.ts';
import { openSignedUrl } from '../open-signed-url.ts';
import { ACCEPT, CATEGORIES, EXTENSIONS, downloadUrl, fileExt, inlineUrl, previewKind, type Attachment, type AttachmentMeta, type AttachmentsApi } from './attachments.ts';

const EMPTY_META: AttachmentMeta = { category: '', doc_date: '', notes: '' };

function MetaFields({ value, onChange, autoOption }: { value: AttachmentMeta; onChange: (v: AttachmentMeta) => void; autoOption?: boolean }) {
  const t = useT();
  return (
    <>
      <Field label={t('intel.att.category')}>
        <Select value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value })}>
          <option value="">{autoOption ? t('intel.att.categoryAuto') : '—'}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`intel.attCat.${c}`)}</option>)}
        </Select>
      </Field>
      <Field label={t('intel.att.docDate')}>
        <Input type="date" value={value.doc_date} onChange={(e) => onChange({ ...value, doc_date: e.target.value })} />
      </Field>
      <Field label={t('common.notes')} full>
        <Textarea rows={2} value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </Field>
    </>
  );
}

export function UploadModal({ open, onClose, api, onUploaded }: { open: boolean; onClose: () => void; api: AttachmentsApi; onUploaded: (a: Attachment) => void }) {
  const t = useT();
  const toast = useToast();
  const { config } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState(EMPTY_META);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxMb = config?.maxUploadMb ?? 50;
  const aiOn = config?.ai !== false;

  const close = () => {
    if (uploading) return;
    setFile(null);
    setMeta(EMPTY_META);
    setError(null);
    onClose();
  };

  const pick = (f: File | null) => {
    setError(null);
    if (f && !EXTENSIONS.includes(fileExt(f.name))) return setError(t('intel.att.badType'));
    if (f && f.size > maxMb * 1024 * 1024) return setError(t('intel.att.tooLarge', { mb: maxMb }));
    setFile(f);
  };

  const submit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const row = await api.upload(file, meta);
      toast(t('intel.att.uploaded'));
      setUploading(false);
      setFile(null);
      setMeta(EMPTY_META);
      onClose();
      onUploaded(row);
    } catch (err) {
      setError(errorText(t, err));
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('intel.att.uploadTitle')}
      onClose={close}
      footer={<><Button onClick={close} disabled={uploading}>{t('common.cancel')}</Button><Button variant="primary" loading={uploading} disabled={!file} onClick={() => void submit()}>{t('common.upload')}</Button></>}
    >
      <div className="form">
        <button
          type="button"
          className={`lw-drop${dragging ? ' lw-drop-active' : ''}${file ? ' lw-drop-filled' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0] ?? null); }}
        >
          {file ? (
            <>
              <strong>{file.name}</strong>
              <span className="muted small">{formatBytes(file.size)} · {t('leases.docs.changeFile')}</span>
            </>
          ) : (
            <>
              <strong>{t('leases.docs.dropFile')}</strong>
              <span className="muted small">{t('intel.att.fileHint', { mb: maxMb })}</span>
            </>
          )}
        </button>
        <input ref={fileRef} type="file" hidden accept={ACCEPT} onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        <div className="form-grid">
          <MetaFields value={meta} onChange={setMeta} autoOption />
        </div>
        {error && <div className="field-error" role="alert">{error}</div>}
        {!aiOn && <p className="muted small" style={{ margin: 0 }}>{t('intel.att.noAiNote')}</p>}
      </div>
    </Modal>
  );
}

function EditModal({ att, onClose, api }: { att: Attachment | null; onClose: () => void; api: AttachmentsApi }) {
  const t = useT();
  const toast = useToast();
  const [meta, setMeta] = useState(EMPTY_META);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (att) setMeta({ category: att.category ?? '', doc_date: att.doc_date ?? '', notes: att.notes ?? '' });
  }, [att]);

  const save = async () => {
    if (!att) return;
    setSaving(true);
    try {
      await api.update(att.id, { category: meta.category || null, doc_date: meta.doc_date || null, notes: meta.notes || null });
      onClose();
    } catch (err) {
      toast(errorText(t, err), 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(att)}
      title={t('intel.att.editTitle')}
      onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={saving} onClick={() => void save()}>{t('common.save')}</Button></>}
    >
      <div className="form"><div className="form-grid"><MetaFields value={meta} onChange={setMeta} /></div></div>
    </Modal>
  );
}

function Preview({ att }: { att: Attachment }) {
  const t = useT();
  const kind = previewKind(att.file_name);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    setError(null);
    if (!kind) return;
    let cancelled = false;
    inlineUrl(att.id)
      .then((r) => !cancelled && setUrl(r.url))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [att.id, kind]);

  if (!kind) {
    return (
      <div className="lw-preview-empty">
        <span className="lw-file-tile lw-file-tile-lg" aria-hidden="true">{fileExt(att.file_name).toUpperCase() || 'FILE'}</span>
        <p className="muted">{t('leases.docs.noPreview')}</p>
      </div>
    );
  }
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!url) return <Spinner />;
  return kind === 'image'
    ? <div className="lw-preview-image"><img src={url} alt={att.file_name} /></div>
    : <iframe className="lw-pdf" src={url} title={att.file_name} />;
}

export function AttachmentView({ att, api, onDeleted }: { att: Attachment; api: AttachmentsApi; onDeleted: () => void }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit, config, currency } = useAuth();
  const [editing, setEditing] = useState<Attachment | null>(null);
  const [aiError, setAiError] = useState(false);
  const aiOn = config?.ai !== false;
  const review = att.ai_review;
  const fields = Object.entries(review?.fields ?? {});

  const fail = (err: unknown) => toast(errorText(t, err), 'danger');

  const download = async () => {
    try {
      // The signed URL carries Content-Disposition: attachment, so this downloads without leaving the page.
      window.location.href = (await downloadUrl(att.id)).url;
    } catch (err) {
      fail(err);
    }
  };

  const runReview = async () => {
    setAiError(false);
    try {
      await api.review(att.id);
    } catch (err) {
      if (isAiNotConfigured(err)) setAiError(true);
      else fail(err);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: t('intel.att.deleteTitle'), message: t('intel.att.deleteBody', { name: att.file_name }), confirmLabel: t('common.delete'), danger: true }))) return;
    try {
      await api.remove(att.id);
      onDeleted();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <Card
      className="lw-docs-main"
      title={<span className="lw-docs-title">{att.file_name}</span>}
      actions={
        <div className="row lw-docs-toolbar">
          {previewKind(att.file_name) && <Button size="sm" onClick={() => void openSignedUrl(() => inlineUrl(att.id), fail)}>{t('leases.docs.newTab')}</Button>}
          <Button size="sm" onClick={() => void download()}>{t('common.download')}</Button>
          {canEdit && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(att)}>{t('common.edit')}</Button>
              <Button size="sm" variant="ghost" onClick={() => void remove()}>{t('common.delete')}</Button>
            </>
          )}
        </div>
      }
    >
      <div className="lw-doc-meta">
        {att.category ? <Badge tone="info">{t(`intel.attCat.${att.category}`)}</Badge> : <Badge>{t('leases.docs.uncategorized')}</Badge>}
        {att.doc_date && <span>{formatDate(att.doc_date)}</span>}
        <span>{formatBytes(att.file_size)}</span>
        <span>{t('leases.docs.uploaded', { date: formatDateTime(att.created_at) })}</span>
      </div>
      {att.notes && <p className="lw-doc-summary">{att.notes}</p>}

      <div className="lw-att-view">
        <div className="lw-att-preview"><Preview att={att} /></div>

        <aside className="lw-att-side">
          <div className="row-between">
            <strong>{t('intel.att.review')}</strong>
            {att.status === 'queued' && !aiOn ? <Badge>{t('intel.att.notReviewed')}</Badge> : <JobStatusBadge status={att.status} />}
          </div>
          {aiError && <AiNotConfigured compact />}
          {att.status === 'failed' && att.error && <div className="field-error">{att.error}</div>}
          {(att.status === 'processing' || (aiOn && att.status === 'queued')) && !review && <p className="muted small">{t('leases.docs.reviewRunning')}</p>}
          {!review && att.status !== 'processing' && !(aiOn && att.status === 'queued') && <p className="muted small">{t('leases.docs.noReview')}</p>}

          {review && (
            <div className="lw-att-review">
              <p>{review.summary}</p>
              {(review.key_date || review.amount !== null) && (
                <dl className="lw-att-facts">
                  {review.key_date && <><dt>{t('intel.att.keyDate')}</dt><dd>{formatDate(review.key_date)}</dd></>}
                  {review.amount !== null && <><dt>{t('intel.att.amount')}</dt><dd>{formatMoney(review.amount, currency, 2)}</dd></>}
                </dl>
              )}
              {review.suggested_category && review.suggested_category !== att.category && (
                <div className="lw-att-suggest">
                  <span>{t('intel.att.suggested')}: <strong>{t(`intel.attCat.${review.suggested_category}`)}</strong></span>
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => void api.update(att.id, { category: review.suggested_category }).catch(fail)}>{t('intel.att.apply')}</Button>}
                </div>
              )}
              {review.issues?.length > 0 && (
                <div>
                  <strong className="small">{t('intel.att.issues')}</strong>
                  <ul>{review.issues.map((x, i) => <li key={i}><SeverityBadge severity={x.severity} /> {x.text}</li>)}</ul>
                </div>
              )}
              {review.action_items?.length > 0 && (
                <div>
                  <strong className="small">{t('intel.att.actions')}</strong>
                  <ul>{review.action_items.map((a, i) => <li key={i}>{a.text}{a.due_date && <span className="muted"> — {t('intel.opp.due')} {formatDate(a.due_date)}</span>}</li>)}</ul>
                </div>
              )}
              {fields.length > 0 && (
                <dl className="lw-att-facts">
                  {fields.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}
                </dl>
              )}
            </div>
          )}

          {canEdit && aiOn && att.status !== 'processing' && (
            <Button size="sm" onClick={() => void runReview()}>{review ? t('intel.att.rereview') : t('intel.att.runReview')}</Button>
          )}
        </aside>
      </div>

      <EditModal att={editing} onClose={() => setEditing(null)} api={api} />
    </Card>
  );
}
