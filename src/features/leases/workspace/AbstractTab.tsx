// Abstract panels for one document of the lease family (switch between main lease and amendments),
// with inline editing for editors and the change history.
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, Input, Spinner, Textarea, cx, useToast } from '../../../components/ui.tsx';
import { useT } from '../../../i18n/index.tsx';
import { useAuth } from '../../../auth/AuthProvider.tsx';
import { get, patch } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';
import { formatDate, formatDateTime } from '../../../lib/format.ts';
import { DocTypeBadge, documentName, errorText, fieldLabel, formatFieldValue, SignatureBadge } from '../shared.tsx';
import { ABSTRACT_FIELDS, FIELD_GROUPS, type EditEntry, type LeaseDetail, type LeaseDocument } from '../types.ts';

function FieldRow({ doc, fieldKey, leaseId, onSaved }: { doc: LeaseDocument; fieldKey: string; leaseId: string; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const { canEdit, currency } = useAuth();
  const field = ABSTRACT_FIELDS.find((f) => f.key === fieldKey)!;
  const value = doc.abstract?.[fieldKey];
  const page = doc.abstract?.pages?.[fieldKey];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft(value === null || value === undefined ? '' : String(value));
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      await patch(`/leases/${leaseId}/documents/${doc.id}/abstract`, { field: fieldKey, value: draft.trim() === '' ? null : draft });
      setEditing(false);
      toast(t('leases.abstract.saved'), 'success');
      onSaved();
    } catch (err) {
      toast(errorText(t, err), 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cx('lw-field', editing && 'lw-field-editing')}>
      <dt>{fieldLabel(t, fieldKey)}</dt>
      <dd>
        {editing ? (
          <div className="lw-field-edit">
            {field.kind === 'longtext' ? (
              <Textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            ) : (
              <Input
                type={field.kind === 'date' ? 'date' : field.kind === 'number' || field.kind === 'money' ? 'number' : 'text'}
                step="any"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save();
                  if (e.key === 'Escape') setEditing(false);
                }}
                autoFocus
              />
            )}
            <div className="row">
              <Button size="sm" variant="primary" loading={saving} onClick={save}>{t('common.save')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        ) : (
          <div className="lw-field-value">
            <span className={cx('lw-pre', (value === null || value === undefined) && 'muted')}>{formatFieldValue(fieldKey, value, currency)}</span>
            {page != null && (
              <Link className="lw-page-link small" to={`?tab=documents&doc=${doc.id}&page=${page}`}>{t('leases.abstract.page', { page })}</Link>
            )}
            {canEdit && (
              <button type="button" className="icon-btn lw-edit-btn" onClick={start} aria-label={`${t('common.edit')} ${fieldLabel(t, fieldKey)}`} title={t('common.edit')}>✎</button>
            )}
          </div>
        )}
      </dd>
    </div>
  );
}


export function EditHistory({ leaseId, version }: { leaseId: string; version: number }) {
  const t = useT();
  const { currency } = useAuth();
  const { data, loading } = useAsync((signal) => get<EditEntry[]>(`/leases/${leaseId}/edits`, undefined, signal), [leaseId, version]);
  if (loading && !data) return <Spinner />;
  if (!data?.length) return <p className="muted">{t('leases.abstract.noEdits')}</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t('common.date')}</th><th>{t('leases.abstract.document')}</th><th>{t('leases.abstract.field')}</th>
            <th>{t('leases.abstract.oldValue')}</th><th>{t('leases.abstract.newValue')}</th><th>{t('leases.abstract.by')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((e) => (
            <tr key={e.id}>
              <td className="lw-nowrap small">{formatDateTime(e.edited_at)}</td>
              <td className="small">{e.document_title || t(`leases.docType.${e.doc_type ?? 'other'}`)}</td>
              <td className="small">{fieldLabel(t, e.field)}</td>
              <td className="small lw-pre lw-old">{formatFieldValue(e.field, e.old_value, currency)}</td>
              <td className="small lw-pre">{formatFieldValue(e.field, e.new_value, currency)}</td>
              <td className="small">{e.edited_by ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AbstractTab({ detail, docId, onDocChange, onChanged, version }: {
  detail: LeaseDetail;
  docId: string | null;
  onDocChange: (id: string) => void;
  onChanged: () => void;
  version: number;
}) {
  const t = useT();
  const docs = detail.documents;
  const doc = docs.find((d) => d.id === docId) ?? docs[0];
  if (!doc) return <p className="muted">{t('leases.overview.noDocuments')}</p>;
  const isMain = doc.doc_type === 'main_lease';
  const others = docs.filter((d) => d.id !== doc.id);

  return (
    <div className="stack">
      <div className="lw-doc-switch" role="tablist" aria-label={t('leases.abstract.switch')}>
        {docs.map((d) => (
          <button key={d.id} type="button" role="tab" aria-selected={d.id === doc.id} className={cx('lw-doc-chip', d.id === doc.id && 'lw-doc-chip-active')} onClick={() => onDocChange(d.id)}>
            <DocTypeBadge type={d.doc_type} />
            <span>{documentName(t, d)}</span>
            {d.effective_date && <span className="muted small">{formatDate(d.effective_date)}</span>}
          </button>
        ))}
      </div>

      <Card>
        <div className="row-between">
          <div>
            <div className="cell-title">{documentName(t, doc)}</div>
            <div className="cell-sub">
              {t(`leases.docType.${doc.doc_type}`)}
              {doc.effective_date ? ` · ${t('leases.abstract.effective', { date: formatDate(doc.effective_date) })}` : ''}
              {doc.page_count ? ` · ${t('leases.files.pages', { count: doc.page_count })}` : ''}
              {doc.file_name ? ` · ${doc.file_name}` : ''}
            </div>
          </div>
          <SignatureBadge signature={doc.signature} />
        </div>
        {doc.summary && <p className="lw-summary lw-pre">{doc.summary}</p>}
        {!isMain && <p className="muted small">{t('leases.abstract.amendmentNote')}</p>}
      </Card>

      <div className="lw-panels">
        {FIELD_GROUPS.filter((g) => g !== 'other' || !isMain).map((group) => (
          <Card key={group} title={t(`leases.group.${group}`)}>
            <dl className="lw-fields">
              {ABSTRACT_FIELDS.filter((f) => f.group === group).map((f) => (
                <FieldRow key={`${doc.id}-${f.key}`} doc={doc} fieldKey={f.key} leaseId={detail.lease.id} onSaved={onChanged} />
              ))}
            </dl>
          </Card>
        ))}
        <Card title={t('leases.group.related')}>
          {others.length === 0 ? (
            <p className="muted">{t('leases.abstract.noRelated')}</p>
          ) : (
            <ul className="lw-related">
              {others.map((d) => (
                <li key={d.id}>
                  <DocTypeBadge type={d.doc_type} />
                  <button type="button" className="lw-linkbtn" onClick={() => onDocChange(d.id)}>{documentName(t, d)}</button>
                  {d.effective_date && <span className="muted small">{formatDate(d.effective_date)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={t('leases.abstract.history')}>
        <EditHistory leaseId={detail.lease.id} version={version} />
      </Card>
    </div>
  );
}
