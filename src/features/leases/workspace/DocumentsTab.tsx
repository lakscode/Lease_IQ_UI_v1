// Documents workspace for one lease: a searchable list of the lease documents (main lease, amendments, …) and
// the supporting documents (attachments), with the selected one shown alongside. Lease documents open in a
// PDF viewer (signed URL in an iframe, #page=N) or page-text view; supporting documents show a preview, their
// details and the AI review.
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Input, Select, Spinner } from '../../../components/ui.tsx';
import { cx } from '../../../components/ui-utils.ts';
import { useToast } from '../../../components/feedback.ts';
import { useT } from '../../../i18n/index.tsx';
import { useAuth } from '../../../auth/useAuth.ts';
import { get } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';
import { formatDate } from '../../../lib/format.ts';
import { DocTypeBadge } from '../shared.tsx';
import { documentName } from '../labels.ts';
import { openSignedUrl } from '../open-signed-url.ts';
import type { LeaseDetail, LeaseDocument } from '../types.ts';
import { fileLabel, useAttachments, type Attachment } from './attachments.ts';
import { AttachmentView, UploadModal } from './AttachmentView.tsx';

function LeaseDocView({ leaseId, doc, page, onPage }: { leaseId: string; doc: LeaseDocument; page: number | null; onPage: (page: number) => void }) {
  const t = useT();
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [urlAt, setUrlAt] = useState(0);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [view, setView] = useState<'pdf' | 'text'>(doc.has_pdf ? 'pdf' : 'text');

  useEffect(() => {
    setUrl(null);
    setUrlError(null);
    setView(doc.has_pdf ? 'pdf' : 'text');
    if (!doc.has_pdf) return;
    let cancelled = false;
    get<{ url: string }>(`/leases/${leaseId}/documents/${doc.id}/pdf`)
      .then((r) => {
        if (cancelled) return;
        setUrl(r.url);
        setUrlAt(Date.now());
      })
      .catch((err: Error) => !cancelled && setUrlError(err.message));
    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.has_pdf, leaseId]);

  const pages = useAsync(
    (signal) => get<{ pages: { page_number: number; text: string }[] }>(`/leases/${leaseId}/documents/${doc.id}/pages`, undefined, signal),
    [doc.id, leaseId],
  );

  const pageCount = pages.data?.pages.length ?? doc.page_count ?? 0;
  const current = Math.min(Math.max(1, page ?? 1), Math.max(1, pageCount));
  const pageText = pages.data?.pages.find((p) => p.page_number === current)?.text;

  return (
    <Card
      className="lw-docs-main"
      title={<span className="lw-docs-title">{documentName(t, doc)}</span>}
      actions={
        <div className="row lw-docs-toolbar">
          <div className="lw-seg" role="group">
            <button type="button" className={cx(view === 'pdf' && 'lw-seg-active')} onClick={() => setView('pdf')} disabled={!doc.has_pdf}>{t('leases.docs.pdf')}</button>
            <button type="button" className={cx(view === 'text' && 'lw-seg-active')} onClick={() => setView('text')}>{t('leases.docs.text')}</button>
          </div>
          {pageCount > 0 && (
            <div className="lw-pager">
              <Button size="sm" variant="ghost" disabled={current <= 1} onClick={() => onPage(current - 1)} aria-label={t('leases.docs.prev')}>‹</Button>
              <Select value={current} onChange={(e) => onPage(Number(e.target.value))} aria-label={t('leases.docs.page')}>
                {Array.from({ length: pageCount }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{t('leases.docs.pageOf', { page: i + 1, total: pageCount })}</option>
                ))}
              </Select>
              <Button size="sm" variant="ghost" disabled={current >= pageCount} onClick={() => onPage(current + 1)} aria-label={t('leases.docs.next')}>›</Button>
            </div>
          )}
          {doc.has_pdf && (
            // A real link to the already-signed URL (opened synchronously, so popup blockers allow it). Falls back to
            // signing a fresh URL when the iframe's URL isn't loaded yet or is close to its 15-minute expiry.
            <a
              className="btn btn-secondary btn-sm"
              href={url ? `${url}#page=${current}` : '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (url && Date.now() - urlAt < 10 * 60_000) return;
                e.preventDefault();
                void openSignedUrl(() => get(`/leases/${leaseId}/documents/${doc.id}/pdf`), (m) => toast(m, 'danger'), current);
              }}
            >
              {t('leases.docs.newTab')}
            </a>
          )}
        </div>
      }
    >
      <div className="lw-doc-meta">
        <DocTypeBadge type={doc.doc_type} />
        <span>{doc.effective_date ? formatDate(doc.effective_date) : t('leases.overview.undated')}</span>
        {doc.page_count ? <span>{t('leases.files.pages', { count: doc.page_count })}</span> : null}
        {doc.file_name && <span className="lw-doc-file" title={doc.file_name}>{doc.file_name}</span>}
      </div>
      {doc.summary && <p className="lw-doc-summary">{doc.summary}</p>}

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
          {pages.data && pageCount > 0 && <pre className="lw-text">{pageText?.trim() ? pageText : t('leases.docs.emptyPage')}</pre>}
        </div>
      )}
    </Card>
  );
}

function AttachmentStatus({ att, aiOn }: { att: Attachment; aiOn: boolean }) {
  const t = useT();
  if (att.status === 'processing' || (aiOn && att.status === 'queued')) return <span className="spinner spinner-inline" title={t('leases.docs.reviewRunning')} />;
  if (att.status === 'failed') return <span className="lw-dot lw-dot-danger" title={t('intel.job.failed')} />;
  const issues = att.ai_review?.issues?.length ?? 0;
  return issues ? <Badge tone="warning" title={t('intel.att.issues')}>{issues}</Badge> : null;
}

export default function DocumentsTab({ detail, docId, attId, page, onSelect, onSelectAttachment }: {
  detail: LeaseDetail;
  docId: string | null;
  attId: string | null;
  page: number | null;
  onSelect: (docId: string, page?: number | null) => void;
  onSelectAttachment: (attId: string | null) => void;
}) {
  const t = useT();
  const { canEdit, config } = useAuth();
  const aiOn = config?.ai !== false;
  const leaseId = detail.lease.id;
  const atts = useAttachments(leaseId, aiOn);
  const [query, setQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);

  const doc = detail.documents.find((d) => d.id === docId) ?? detail.documents[0];
  const att = attId ? atts.data?.find((a) => a.id === attId) : undefined;

  const q = query.trim().toLowerCase();
  const leaseDocs = detail.documents.filter((d) => !q || [documentName(t, d), d.file_name, d.doc_type].some((s) => s?.toLowerCase().includes(q)));
  const supporting = (atts.data ?? []).filter((a) => !q || [a.file_name, a.notes, a.category && t(`intel.attCat.${a.category}`)].some((s) => s && s.toLowerCase().includes(q)));

  return (
    <div className="lw-docs">
      <aside className="lw-docs-side">
        <Input type="search" placeholder={t('leases.docs.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('leases.docs.search')} />

        <section className="lw-docs-group">
          <div className="lw-docs-group-head">
            <span>{t('leases.docs.leaseDocs')}</span>
            <span className="lw-docs-count">{detail.documents.length}</span>
          </div>
          {!leaseDocs.length && <p className="muted small lw-docs-none">{detail.documents.length ? t('leases.docs.noMatches') : t('leases.overview.noDocuments')}</p>}
          {leaseDocs.map((d) => (
            <button key={d.id} type="button" className={cx('lw-docs-item', !attId && d.id === doc?.id && 'lw-docs-item-active')} onClick={() => onSelect(d.id, null)}>
              <span className={cx('lw-file-tile', d.doc_type === 'main_lease' && 'lw-file-tile-primary')} aria-hidden="true">{d.has_pdf ? 'PDF' : 'TXT'}</span>
              <span className="lw-docs-item-body">
                <span className="lw-docs-item-title">{documentName(t, d)}</span>
                <span className="lw-docs-item-meta">
                  <DocTypeBadge type={d.doc_type} />
                  <span>{d.effective_date ? formatDate(d.effective_date) : t('leases.overview.undated')}</span>
                  {d.page_count ? <span>· {t('leases.files.pages', { count: d.page_count })}</span> : null}
                </span>
              </span>
            </button>
          ))}
        </section>

        <section className="lw-docs-group">
          <div className="lw-docs-group-head">
            <span>{t('intel.att.title')}</span>
            <span className="lw-docs-count">{atts.data?.length ?? '–'}</span>
            {canEdit && <Button size="sm" variant="ghost" className="lw-docs-add" onClick={() => setUploadOpen(true)}>+ {t('leases.docs.add')}</Button>}
          </div>
          {atts.loading && !atts.data && <Spinner />}
          {atts.error && <ErrorState error={atts.error} onRetry={atts.reload} />}
          {atts.data && !atts.data.length && <p className="muted small lw-docs-none">{t('intel.att.emptyBody')}</p>}
          {atts.data && atts.data.length > 0 && !supporting.length && <p className="muted small lw-docs-none">{t('leases.docs.noMatches')}</p>}
          {supporting.map((a) => (
            <button key={a.id} type="button" className={cx('lw-docs-item', a.id === attId && 'lw-docs-item-active')} onClick={() => onSelectAttachment(a.id)}>
              <span className="lw-file-tile lw-file-tile-muted" aria-hidden="true">{fileLabel(a.file_name)}</span>
              <span className="lw-docs-item-body">
                <span className="lw-docs-item-title">{a.file_name}</span>
                <span className="lw-docs-item-meta">
                  {a.category && <Badge tone="info">{t(`intel.attCat.${a.category}`)}</Badge>}
                  <span>{formatDate(a.doc_date ?? a.created_at)}</span>
                </span>
              </span>
              <AttachmentStatus att={a} aiOn={aiOn} />
            </button>
          ))}
        </section>
      </aside>

      <div className="lw-docs-pane">
        {attId ? (
          att ? <AttachmentView key={att.id} att={att} api={atts} onDeleted={() => onSelectAttachment(null)} />
            : atts.loading ? <Spinner />
              : <EmptyState icon="📎" title={t('leases.docs.notFound')} action={<Button onClick={() => onSelectAttachment(null)}>{t('leases.docs.backToLease')}</Button>} />
        ) : doc ? (
          <LeaseDocView key={doc.id} leaseId={leaseId} doc={doc} page={page} onPage={(pg) => onSelect(doc.id, pg)} />
        ) : (
          <EmptyState icon="📄" title={t('leases.overview.noDocuments')} />
        )}
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} api={atts} onUploaded={(a) => onSelectAttachment(a.id)} />
    </div>
  );
}
