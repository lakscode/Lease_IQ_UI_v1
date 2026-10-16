// "In this document" strip above the PDF: the abstract terms and clauses found on the current page (click one to
// read the value or clause text), and a jump list of everything extracted from the document, by page.
import { useMemo, useState } from 'react';
import { Select } from '../../../components/ui.tsx';
import { cx } from '../../../components/ui-utils.ts';
import { useT } from '../../../i18n/index.tsx';
import { useAuth } from '../../../auth/useAuth.ts';
import { get } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';
import { fieldLabel, formatFieldValue } from '../labels.ts';
import type { ClauseItem, LeaseDocument } from '../types.ts';

interface IndexItem { id: string; kind: 'term' | 'clause'; label: string; page: number; detail: string }

export default function DocIndex({ leaseId, doc, page, onPage }: { leaseId: string; doc: LeaseDocument; page: number; onPage: (page: number) => void }) {
  const t = useT();
  const { currency } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const clauses = useAsync((signal) => get<{ clause_type: string; clauses: ClauseItem[] }[]>(`/leases/${leaseId}/clauses`, undefined, signal), [leaseId]);

  const items = useMemo<IndexItem[]>(() => {
    const out: IndexItem[] = [];
    for (const [key, p] of Object.entries(doc.abstract?.pages ?? {})) {
      const value = doc.abstract?.[key];
      if (typeof p !== 'number' || value === null || value === undefined || value === '') continue;
      out.push({ id: `term:${key}`, kind: 'term', label: fieldLabel(t, key), page: p, detail: formatFieldValue(key, value, currency) });
    }
    for (const group of clauses.data ?? []) {
      for (const c of group.clauses) {
        if (c.document_id !== doc.id || !c.page || c.dismissed) continue;
        out.push({ id: `clause:${c.id}`, kind: 'clause', label: c.clause_type, page: c.page, detail: c.text ?? '' });
      }
    }
    return out.sort((a, b) => a.page - b.page || a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
  }, [doc, clauses.data, t, currency]);

  if (!items.length) return null;
  const here = items.filter((i) => i.page === page);
  const open = here.find((i) => i.id === openId);

  return (
    <div className="lw-docindex">
      <div className="lw-docindex-row">
        <span className="lw-docindex-label">{t('leases.index.onPage', { page })}</span>
        <div className="lw-docindex-chips">
          {here.length ? here.map((i) => (
            <button
              key={i.id}
              type="button"
              className={cx('lw-chip', i.kind === 'clause' ? 'lw-chip-clause' : 'lw-chip-term', i.id === openId && 'lw-chip-on')}
              aria-expanded={i.id === openId}
              onClick={() => setOpenId(i.id === openId ? null : i.id)}
            >
              {i.label}
            </button>
          )) : <span className="muted small">{t('leases.index.none')}</span>}
        </div>
        <Select
          className="lw-docindex-jump"
          value=""
          aria-label={t('leases.index.jump')}
          onChange={(e) => {
            const item = items.find((i) => i.id === e.target.value);
            if (!item) return;
            onPage(item.page);
            setOpenId(item.id);
          }}
        >
          <option value="">{t('leases.index.jump')}</option>
          <optgroup label={t('leases.index.terms')}>
            {items.filter((i) => i.kind === 'term').map((i) => <option key={i.id} value={i.id}>{i.label} — {t('leases.notes.page', { page: i.page })}</option>)}
          </optgroup>
          <optgroup label={t('leases.index.clauses')}>
            {items.filter((i) => i.kind === 'clause').map((i) => <option key={i.id} value={i.id}>{i.label} — {t('leases.notes.page', { page: i.page })}</option>)}
          </optgroup>
        </Select>
      </div>
      {open && (
        <div className={cx('lw-docindex-detail', open.kind === 'clause' && 'lw-docindex-detail-clause')}>
          <strong>{open.label}</strong>
          <p>{open.detail || '—'}</p>
        </div>
      )}
    </div>
  );
}
