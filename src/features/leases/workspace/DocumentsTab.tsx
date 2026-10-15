// PDF viewer (signed URL in an iframe, #page=N) and page text viewer for one document of the lease.
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Select, Spinner } from '../../../components/ui.tsx';
import { cx } from '../../../components/ui-utils.ts';
import { useToast } from '../../../components/feedback.ts';
import { useT } from '../../../i18n/index.tsx';
import { get } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';
import { formatDate } from '../../../lib/format.ts';
import { DocTypeBadge } from '../shared.tsx';
import { documentName } from '../labels.ts';
import { openSignedUrl } from '../open-signed-url.ts';
import type { LeaseDetail } from '../types.ts';

export default function DocumentsTab({ detail, docId, page, onSelect }: {
  detail: LeaseDetail;
  docId: string | null;
  page: number | null;
  onSelect: (docId: string, page?: number | null) => void;
}) {
  const t = useT();
  const toast = useToast();
  const doc = detail.documents.find((d) => d.id === docId) ?? detail.documents[0];
  const leaseId = detail.lease.id;
  const [url, setUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [view, setView] = useState<'pdf' | 'text'>(doc?.has_pdf ? 'pdf' : 'text');

  useEffect(() => {
    setUrl(null);
    setUrlError(null);
    setView(doc?.has_pdf ? 'pdf' : 'text');
    if (!doc?.has_pdf) return;
    let cancelled = false;
    get<{ url: string }>(`/leases/${leaseId}/documents/${doc.id}/pdf`)
      .then((r) => !cancelled && setUrl(r.url))
      .catch((err: Error) => !cancelled && setUrlError(err.message));
    return () => {
      cancelled = true;
    };
  }, [doc?.id, doc?.has_pdf, leaseId]);

  const pages = useAsync(
    (signal) => (doc ? get<{ pages: { page_number: number; text: string }[] }>(`/leases/${leaseId}/documents/${doc.id}/pages`, undefined, signal) : Promise.resolve({ pages: [] })),
    [doc?.id, leaseId],
  );

  if (!doc) return <p className="muted">{t('leases.overview.noDocuments')}</p>;
  const pageCount = pages.data?.pages.length ?? doc.page_count ?? 0;
  const current = Math.min(Math.max(1, page ?? 1), Math.max(1, pageCount));
  const pageText = pages.data?.pages.find((p) => p.page_number === current)?.text;

  return (
    <div className="lw-docs">
      <aside className="lw-docs-list">
        {detail.documents.map((d) => (
          <button key={d.id} type="button" className={cx('lw-docs-item', d.id === doc.id && 'lw-docs-item-active')} onClick={() => onSelect(d.id, null)}>
            <DocTypeBadge type={d.doc_type} />
            <span className="cell-title">{documentName(t, d)}</span>
            <span className="cell-sub">
              {d.effective_date ? formatDate(d.effective_date) : t('leases.overview.undated')}
              {d.page_count ? ` · ${t('leases.files.pages', { count: d.page_count })}` : ''}
            </span>
          </button>
        ))}
      </aside>

      <Card
        className="lw-docs-main"
        title={documentName(t, doc)}
        actions={
          <div className="row">
            <div className="lw-seg" role="group">
              <button type="button" className={cx(view === 'pdf' && 'lw-seg-active')} onClick={() => setView('pdf')} disabled={!doc.has_pdf}>{t('leases.docs.pdf')}</button>
              <button type="button" className={cx(view === 'text' && 'lw-seg-active')} onClick={() => setView('text')}>{t('leases.docs.text')}</button>
            </div>
            {pageCount > 0 && (
              <Select value={current} onChange={(e) => onSelect(doc.id, Number(e.target.value))} aria-label={t('leases.docs.page')}>
                {Array.from({ length: pageCount }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{t('leases.docs.pageOf', { page: i + 1, total: pageCount })}</option>
                ))}
              </Select>
            )}
            {doc.has_pdf && (
              <Button size="sm" onClick={() => openSignedUrl(() => get(`/leases/${leaseId}/documents/${doc.id}/pdf`), (m) => toast(m, 'danger'))}>{t('leases.docs.newTab')}</Button>
            )}
          </div>
        }
      >
        {!doc.has_pdf && <Alert tone="info">{t('leases.docs.noPdf')}</Alert>}
        {view === 'pdf' && doc.has_pdf && (
          <>
            {urlError && <Alert tone="danger">{urlError}</Alert>}
            {!url && !urlError && <Spinner />}
            {url && <iframe key={`${url}-${current}`} className="lw-pdf" src={`${url}#page=${current}`} title={documentName(t, doc)} />}
          </>
        )}
        {view === 'text' && (
          <div className="lw-pagetext">
            {pages.loading && !pages.data && <Spinner />}
            {pages.data && pageCount === 0 && <p className="muted">{t('leases.docs.noText')}</p>}
            {pages.data && pageCount > 0 && (
              <>
                <div className="row-between">
                  <Button size="sm" disabled={current <= 1} onClick={() => onSelect(doc.id, current - 1)}>← {t('leases.docs.prev')}</Button>
                  <span className="muted small">{t('leases.docs.pageOf', { page: current, total: pageCount })}</span>
                  <Button size="sm" disabled={current >= pageCount} onClick={() => onSelect(doc.id, current + 1)}>{t('leases.docs.next')} →</Button>
                </div>
                <pre className="lw-text">{pageText?.trim() ? pageText : t('leases.docs.emptyPage')}</pre>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
