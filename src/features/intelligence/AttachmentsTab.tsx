// Supporting documents for one lease: upload (signed URL), list, edit, download, delete and AI review.
import { useEffect, useRef, useState } from 'react';
import { get, patch, post, del } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Spinner, Textarea } from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatBytes, formatDate, formatDateTime, formatMoney } from '../../lib/format.ts';
import { supabase } from '../../lib/supabase.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { AiNotConfigured, JobStatusBadge, SeverityBadge } from './shared.tsx';
import { errorText, isAiNotConfigured } from './helpers.ts';

const CATEGORIES = ['exhibit', 'insurance', 'estoppel', 'snda', 'financial_statement', 'correspondence', 'notice', 'invoice', 'other'] as const;
const EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md', 'eml', 'msg'];
const ACCEPT = EXTENSIONS.map((e) => `.${e}`).join(',');

interface Review {
  summary: string;
  key_date: string | null;
  amount: number | null;
  fields: Record<string, string>;
  action_items: { text: string; due_date: string | null }[];
  issues: { text: string; severity: string }[];
  suggested_category: string;
  reviewed_at?: string;
}

interface Attachment {
  id: string;
  lease_id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  category: string | null;
  doc_date: string | null;
  notes: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error: string | null;
  ai_review: Review | null;
  created_at: string;
}

interface UploadUrl { attachment_id: string; bucket: string; path: string; token: string }

function ReviewView({ review, att, canEdit, onApply }: { review: Review; att: Attachment; canEdit: boolean; onApply: () => void }) {
  const t = useT();
  const { currency } = useAuth();
  const fields = Object.entries(review.fields ?? {});
  return (
    <div className="intel-review">
      <p style={{ margin: 0 }}>{review.summary}</p>
      <div className="intel-muted-row">
        {review.key_date && <span>{t('intel.att.keyDate')}: <strong>{formatDate(review.key_date)}</strong></span>}
        {review.amount !== null && <span>{t('intel.att.amount')}: <strong>{formatMoney(review.amount, currency, 2)}</strong></span>}
        <span>
          {t('intel.att.suggested')}: <strong>{t(`intel.attCat.${review.suggested_category}`)}</strong>
          {canEdit && review.suggested_category !== att.category && (
            <> <Button size="sm" variant="ghost" onClick={onApply}>{t('intel.att.apply')}</Button></>
          )}
        </span>
      </div>
      {fields.length > 0 && (
        <dl className="dl">
          {fields.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      {review.action_items?.length > 0 && (
        <div>
          <strong className="small">{t('intel.att.actions')}</strong>
          <ul>{review.action_items.map((a, i) => <li key={i}>{a.text}{a.due_date && <span className="muted"> — {t('intel.opp.due')} {formatDate(a.due_date)}</span>}</li>)}</ul>
        </div>
      )}
      {review.issues?.length > 0 && (
        <div>
          <strong className="small">{t('intel.att.issues')}</strong>
          <ul>{review.issues.map((x, i) => <li key={i}><SeverityBadge severity={x.severity} /> {x.text}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export default function AttachmentsTab({ leaseId }: { leaseId: string }) {
  const t = useT();
  const { canEdit, config } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useAsync((signal) => get<Attachment[]>(`/leases/${leaseId}/attachments`, undefined, signal), [leaseId]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ category: '', doc_date: '', notes: '' });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Attachment | null>(null);
  const [editForm, setEditForm] = useState({ category: '', doc_date: '', notes: '' });
  const [aiError, setAiError] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const maxMb = config?.maxUploadMb ?? 50;
  const aiOn = config?.ai !== false;

  // Poll while reviews run.
  const busy = (list.data ?? []).some((a) => a.status === 'processing' || (aiOn && a.status === 'queued'));
  const { reload } = list;
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(reload, 5000);
    return () => window.clearInterval(id);
  }, [busy, reload]);

  const replace = (row: Attachment) => list.setData((l) => (l ?? []).map((x) => (x.id === row.id ? row : x)));

  const upload = async () => {
    if (!file) return;
    setUploadError(null);
    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
    if (!EXTENSIONS.includes(ext)) return setUploadError(t('intel.att.badType'));
    if (file.size > maxMb * 1024 * 1024) return setUploadError(t('intel.att.tooLarge', { mb: maxMb }));
    setUploading(true);
    try {
      const target = await post<UploadUrl>(`/leases/${leaseId}/attachments/upload-url`, { file_name: file.name, file_size: file.size, mime_type: file.type || null });
      const { error } = await supabase.storage.from(target.bucket).uploadToSignedUrl(target.path, target.token, file, { contentType: file.type || 'application/octet-stream' });
      if (error) throw new Error(error.message);
      const row = await post<Attachment>(`/leases/${leaseId}/attachments`, {
        attachment_id: target.attachment_id, path: target.path, file_name: file.name, mime_type: file.type || null, file_size: file.size,
        category: form.category || null, doc_date: form.doc_date || null, notes: form.notes || null,
      });
      list.setData((l) => [row, ...(l ?? [])]);
      setFile(null);
      setForm({ category: '', doc_date: '', notes: '' });
      if (fileRef.current) fileRef.current.value = '';
      toast(t('intel.att.uploaded'));
    } catch (err) {
      setUploadError(errorText(t, err));
    } finally {
      setUploading(false);
    }
  };

  const download = async (a: Attachment, inline = false) => {
    try {
      const { url } = await get<{ url: string }>(`/attachments/${a.id}/download`, inline ? { inline: 1 } : undefined);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const remove = async (a: Attachment) => {
    if (!(await confirm({ title: t('intel.att.deleteTitle'), message: t('intel.att.deleteBody', { name: a.file_name }), confirmLabel: t('common.delete'), danger: true }))) return;
    try {
      await del(`/attachments/${a.id}`);
      list.setData((l) => (l ?? []).filter((x) => x.id !== a.id));
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const review = async (a: Attachment) => {
    setAiError(false);
    try {
      replace(await post<Attachment>(`/attachments/${a.id}/review`));
    } catch (err) {
      if (isAiNotConfigured(err)) setAiError(true);
      else toast(errorText(t, err), 'danger');
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      replace(await patch<Attachment>(`/attachments/${editing.id}`, { category: editForm.category || null, doc_date: editForm.doc_date || null, notes: editForm.notes || null }));
      setEditing(null);
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const applyCategory = async (a: Attachment) => {
    try {
      replace(await patch<Attachment>(`/attachments/${a.id}`, { category: a.ai_review?.suggested_category }));
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const statusFor = (a: Attachment) => (a.status === 'queued' && !aiOn ? <Badge>{t('intel.att.notReviewed')}</Badge> : <JobStatusBadge status={a.status} />);

  return (
    <div className="intel-stack">
      {canEdit && (
        <Card title={t('intel.att.uploadTitle')}>
          <form className="form" onSubmit={(e) => { e.preventDefault(); void upload(); }}>
            <div className="form-grid">
              <Field label={t('intel.att.file')} hint={t('intel.att.fileHint', { mb: maxMb })} full>
                <input ref={fileRef} type="file" className="input" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>
              <Field label={t('intel.att.category')}>
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="">{t('intel.att.categoryAuto')}</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{t(`intel.attCat.${c}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('intel.att.docDate')}>
                <Input type="date" value={form.doc_date} onChange={(e) => setForm({ ...form, doc_date: e.target.value })} />
              </Field>
              <Field label={t('common.notes')} full>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>
            {uploadError && <div className="field-error" role="alert">{uploadError}</div>}
            {!aiOn && <p className="muted small" style={{ margin: 0 }}>{t('intel.att.noAiNote')}</p>}
            <div className="form-actions">
              <Button type="submit" variant="primary" loading={uploading} disabled={!file}>{t('common.upload')}</Button>
            </div>
          </form>
        </Card>
      )}

      {aiError && <AiNotConfigured />}

      <Card title={t('intel.att.title')} padded={false}>
        {list.loading && !list.data ? <div className="card-body"><Spinner /></div>
          : list.error ? <div className="card-body"><ErrorState error={list.error} onRetry={list.reload} /></div>
            : !list.data?.length ? <EmptyState icon="📎" title={t('intel.att.emptyTitle')}>{t('intel.att.emptyBody')}</EmptyState>
              : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('intel.att.file')}</th>
                        <th>{t('intel.att.category')}</th>
                        <th>{t('intel.att.docDate')}</th>
                        <th>{t('intel.att.review')}</th>
                        <th className="num">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.data.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <div className="intel-att">
                              <span className="intel-att-name">{a.file_name}</span>
                              <span className="cell-sub">{formatBytes(a.file_size)} · {formatDateTime(a.created_at)}</span>
                              {a.notes && <span className="cell-sub">{a.notes}</span>}
                              {a.status === 'failed' && a.error && <span className="field-error">{a.error}</span>}
                              {a.ai_review && open[a.id] && <ReviewView review={a.ai_review} att={a} canEdit={canEdit} onApply={() => void applyCategory(a)} />}
                            </div>
                          </td>
                          <td>{a.category ? <Badge tone="info">{t(`intel.attCat.${a.category}`)}</Badge> : <span className="muted">—</span>}</td>
                          <td>{formatDate(a.doc_date)}</td>
                          <td>
                            <div className="stack" style={{ gap: 4, alignItems: 'flex-start' }}>
                              {statusFor(a)}
                              {a.ai_review && (
                                <Button size="sm" variant="ghost" onClick={() => setOpen({ ...open, [a.id]: !open[a.id] })}>
                                  {open[a.id] ? t('intel.att.hideReview') : t('intel.att.showReview')}
                                </Button>
                              )}
                            </div>
                          </td>
                          <td className="num">
                            <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                              <Button size="sm" variant="ghost" onClick={() => void download(a, true)}>{t('intel.att.open')}</Button>
                              <Button size="sm" variant="ghost" onClick={() => void download(a)}>{t('common.download')}</Button>
                              {canEdit && (
                                <>
                                  {aiOn && a.status !== 'processing' && (
                                    <Button size="sm" variant="ghost" onClick={() => void review(a)}>{a.ai_review ? t('intel.att.rereview') : t('intel.att.runReview')}</Button>
                                  )}
                                  <Button size="sm" variant="ghost" onClick={() => { setEditing(a); setEditForm({ category: a.category ?? '', doc_date: a.doc_date ?? '', notes: a.notes ?? '' }); }}>{t('common.edit')}</Button>
                                  <Button size="sm" variant="ghost" onClick={() => void remove(a)}>{t('common.delete')}</Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
      </Card>

      <Modal
        open={Boolean(editing)}
        title={t('intel.att.editTitle')}
        onClose={() => setEditing(null)}
        footer={<><Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={() => void saveEdit()}>{t('common.save')}</Button></>}
      >
        <div className="form">
          <Field label={t('intel.att.category')}>
            <Select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
              <option value="">—</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(`intel.attCat.${c}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('intel.att.docDate')}>
            <Input type="date" value={editForm.doc_date} onChange={(e) => setEditForm({ ...editForm, doc_date: e.target.value })} />
          </Field>
          <Field label={t('common.notes')}>
            <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
