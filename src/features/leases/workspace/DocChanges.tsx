// "Changes" view of an amendment / addendum: each lease term the document sets, next to the value it had before
// (merged from the earlier documents of the family, the same way the API builds current_terms), with page links
// into both documents and a note when a later document changed the term again.
import { useState } from 'react';
import { Badge, Button } from '../../../components/ui.tsx';
import { useT } from '../../../i18n/index.tsx';
import { useAuth } from '../../../auth/useAuth.ts';
import { documentName, fieldLabel, formatFieldValue } from '../labels.ts';
import { ABSTRACT_FIELDS, type LeaseDetail, type LeaseDocument } from '../types.ts';

type Status = 'changed' | 'added' | 'same';

interface Row {
  key: string;
  status: Status;
  value: unknown;
  page: number | null;
  before: { value: unknown; doc: LeaseDocument; page: number | null } | null;
  laterDoc: LeaseDocument | null;
}

const isSet = (v: unknown) => v !== null && v !== undefined && v !== '';
const norm = (v: unknown) => String(v).trim().toLowerCase().replace(/\s+/g, ' ');

export default function DocChanges({ detail, doc, onOpen }: {
  detail: LeaseDetail;
  doc: LeaseDocument;
  /** Open a document of the family at a page (switches to the PDF view). */
  onOpen: (docId: string, page: number | null) => void;
}) {
  const t = useT();
  const { currency } = useAuth();
  const [showSame, setShowSame] = useState(false);

  const index = detail.documents.indexOf(doc);
  const earlier = detail.documents.slice(0, Math.max(0, index)).filter((d) => d.doc_type !== 'other');
  const docsById = new Map(detail.documents.map((d) => [d.id, d]));

  const rows: Row[] = [];
  for (const field of ABSTRACT_FIELDS) {
    if (field.key === 'changes_made') continue;
    const value = doc.abstract?.[field.key];
    if (!isSet(value)) continue;
    let before: Row['before'] = null;
    for (const d of earlier) {
      const v = d.abstract?.[field.key];
      if (isSet(v)) before = { value: v, doc: d, page: d.abstract?.pages?.[field.key] ?? null };
    }
    const current = detail.lease.current_terms?.[field.key];
    rows.push({
      key: field.key,
      status: !before ? 'added' : norm(before.value) === norm(value) ? 'same' : 'changed',
      value,
      page: doc.abstract?.pages?.[field.key] ?? null,
      before,
      laterDoc: current && current.source_document_id !== doc.id ? docsById.get(current.source_document_id) ?? null : null,
    });
  }

  const same = rows.filter((r) => r.status === 'same');
  const shown = showSame ? rows : rows.filter((r) => r.status !== 'same');
  const fmt = (key: string, v: unknown) => formatFieldValue(key, v, currency);
  const pageLink = (d: LeaseDocument, page: number | null, label: string) =>
    page ? <button type="button" className="lw-link small" onClick={() => onOpen(d.id, page)}>{label} · {t('leases.notes.page', { page })}</button>
      : <span className="muted small">{label}</span>;

  return (
    <div className="lw-changes">
      <p className="muted small" style={{ margin: 0 }}>
        {t('leases.changes.comparedWith', { docs: earlier.map((d) => documentName(t, d)).join(', ') })}
      </p>
      {doc.changes_made && (
        <div className="lw-doc-summary">
          <strong className="small">{t('leases.changes.summary')}</strong>
          <div>{doc.changes_made}</div>
        </div>
      )}

      {!rows.length ? (
        <p className="muted">{t('leases.changes.none')}</p>
      ) : (
        <div className="table-wrap">
          <table className="table lw-changes-table">
            <thead>
              <tr>
                <th>{t('leases.changes.term')}</th>
                <th>{t('leases.changes.before')}</th>
                <th>{t('leases.changes.this')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} className={`lw-change-${r.status}`}>
                  <td>
                    <div className="lw-change-term">
                      <strong>{fieldLabel(t, r.key)}</strong>
                      <Badge tone={r.status === 'changed' ? 'warning' : r.status === 'added' ? 'info' : 'neutral'}>{t(`leases.changes.${r.status}`)}</Badge>
                    </div>
                  </td>
                  <td>
                    {r.before ? (
                      <div className="lw-change-cell">
                        <span className={r.status === 'changed' ? 'lw-change-old' : undefined}>{fmt(r.key, r.before.value)}</span>
                        {pageLink(r.before.doc, r.before.page, documentName(t, r.before.doc))}
                      </div>
                    ) : <span className="muted">{t('leases.changes.notSet')}</span>}
                  </td>
                  <td>
                    <div className="lw-change-cell">
                      <span className={r.status !== 'same' ? 'lw-change-new' : undefined}>{fmt(r.key, r.value)}</span>
                      {pageLink(doc, r.page, t('leases.changes.thisShort'))}
                      {r.laterDoc && (
                        <span className="small lw-change-later">
                          {t('leases.changes.later')}{' '}
                          <button type="button" className="lw-link" onClick={() => onOpen(r.laterDoc!.id, r.laterDoc!.abstract?.pages?.[r.key] ?? null)}>{documentName(t, r.laterDoc)}</button>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {same.length > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setShowSame((v) => !v)}>
          {showSame ? t('leases.changes.hideSame') : t('leases.changes.showSame', { count: same.length })}
        </Button>
      )}
    </div>
  );
}
