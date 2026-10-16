// Document checklist at the top of the Documents tab: the documents a lease file usually needs, ticked off from
// the lease documents and the supporting documents. Missing supporting documents can be uploaded straight away
// with the category preset. Guarantor financials are only expected when the lease names a guarantor.
import { useState } from 'react';
import { Button } from '../../../components/ui.tsx';
import { cx } from '../../../components/ui-utils.ts';
import { useT } from '../../../i18n/index.tsx';
import type { LeaseDetail } from '../types.ts';
import { daysUntil, expiryOf, type Attachment } from './attachments.ts';

type State = 'ok' | 'missing' | 'expired';

interface Item {
  key: string;
  state: State;
  /** Upload category for a missing supporting document; null for lease documents (added via "Add amendment"). */
  category: string | null;
  open?: () => void;
}

export default function DocChecklist({ detail, attachments, onUpload, onOpenDoc, onOpenAttachment }: {
  detail: LeaseDetail;
  attachments: Attachment[] | null;
  onUpload?: (category: string) => void;
  onOpenDoc: (docId: string) => void;
  onOpenAttachment: (attId: string) => void;
}) {
  const t = useT();
  const docs = detail.documents;
  const atts = attachments ?? [];

  const leaseDoc = (key: string, type: string): Item => {
    const found = docs.find((d) => d.doc_type === type);
    return { key, state: found ? 'ok' : 'missing', category: null, open: found ? () => onOpenDoc(found.id) : undefined };
  };
  const supporting = (key: string, category: string, checkExpiry = false): Item => {
    const found = atts.filter((a) => a.category === category);
    if (!found.length) return { key, state: 'missing', category };
    // Prefer one that is still valid; otherwise the latest.
    const valid = checkExpiry ? found.find((a) => { const e = expiryOf(a); return !e || daysUntil(e) >= 0; }) : found[0];
    const pick = valid ?? found[0];
    return { key, state: valid ? 'ok' : 'expired', category, open: () => onOpenAttachment(pick.id) };
  };

  const items: Item[] = [
    leaseDoc('main_lease', 'main_lease'),
    leaseDoc('commencement_letter', 'commencement_letter'),
    supporting('insurance', 'insurance', true),
    supporting('snda', 'snda'),
    supporting('estoppel', 'estoppel'),
  ];
  if (detail.lease.current_terms?.guarantor) items.push(supporting('financial_statement', 'financial_statement'));

  const done = items.filter((i) => i.state === 'ok').length;
  const [open, setOpen] = useState(done < items.length);

  if (!attachments) return null;

  return (
    <section className="lw-check">
      <button type="button" className="lw-check-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{t('leases.check.title')}</span>
        <span className={cx('lw-check-progress', done === items.length && 'lw-check-complete')}>{t('leases.check.progress', { done, total: items.length })}</span>
        <span aria-hidden="true" className="lw-check-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="lw-check-list">
          {items.map((i) => (
            <li key={i.key} className={`lw-check-${i.state}`}>
              <span className="lw-check-icon" aria-hidden="true">{i.state === 'ok' ? '✓' : i.state === 'expired' ? '!' : '○'}</span>
              {i.open ? (
                <button type="button" className="lw-link lw-check-label" onClick={i.open}>{t(`leases.check.${i.key}`)}</button>
              ) : (
                <span className="lw-check-label">{t(`leases.check.${i.key}`)}</span>
              )}
              {i.state !== 'ok' && (
                i.category && onUpload ? (
                  <Button size="sm" variant="ghost" onClick={() => onUpload(i.category!)}>
                    {i.state === 'expired' ? t('leases.check.replace') : t('leases.check.upload')}
                  </Button>
                ) : (
                  <span className="lw-check-state" title={i.category ? undefined : t('leases.check.leaseDocHint', { button: t('leases.upload.addAmendment') })}>
                    {t(i.state === 'expired' ? 'leases.check.expired' : 'leases.check.missing')}
                  </span>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
