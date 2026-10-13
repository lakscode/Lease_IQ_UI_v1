// Lease overview: current terms "as amended" (with the source document of each term), status, document
// timeline with what each document changes, and alerts.
import { Link, useParams } from 'react-router';
import { Card, EmptyState, ErrorState, LeaseStatusBadge, PageHeader, Spinner, StatTile } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { get } from '../../api/client.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { daysUntil, formatDate, formatMoney, formatNumber } from '../../lib/format.ts';
import { AlertList, DocTypeBadge, documentName, fieldLabel, formatFieldValue, SignatureBadge } from './shared.tsx';
import { ABSTRACT_FIELDS, type LeaseDetail } from './types.ts';
import './leases.css';

export default function LeaseOverviewPage() {
  const t = useT();
  const { leaseId = '' } = useParams();
  const { currency } = useAuth();
  const { data, error, loading, reload } = useAsync((signal) => get<LeaseDetail>(`/leases/${leaseId}`, undefined, signal), [leaseId]);

  if (loading && !data) return <div className="page"><Spinner /></div>;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return null;

  const { lease, documents, alerts, notice_by } = data;
  const terms = lease.current_terms ?? {};
  const docById = new Map(documents.map((d) => [d.id, d]));
  const days = daysUntil(lease.expiration_date);
  const termFields = ABSTRACT_FIELDS.filter((f) => f.key !== 'changes_made' && terms[f.key]);

  return (
    <div className="page">
      <PageHeader
        back={<Link to="/leases">← {t('leases.title')}</Link>}
        title={<span className="row">{lease.tenant_name || t('leases.unnamed')} <LeaseStatusBadge status={lease.status} /></span>}
        subtitle={[lease.premises_address, lease.landlord_name && t('leases.overview.landlordIs', { name: lease.landlord_name })].filter(Boolean).join(' · ')}
        actions={
          <>
            <Link className="btn btn-secondary" to={`/assistant?leaseId=${lease.id}`}>{t('leases.overview.ask')}</Link>
            <Link className="btn btn-primary" to={`/leases/${lease.id}/details`}>{t('leases.overview.openDetails')}</Link>
          </>
        }
      />

      <div className="tiles">
        <StatTile label={t('leases.field.expiration_date')} value={formatDate(lease.expiration_date)}
          hint={days !== null ? (days < 0 ? t('leases.overview.expiredAgo', { days: -days }) : t('leases.list.inDays', { days })) : undefined}
          tone={lease.status === 'expired' ? 'danger' : lease.status === 'expiring' ? 'warning' : 'neutral'} />
        <StatTile label={t('leases.field.base_rent_monthly')} value={formatMoney(lease.base_rent_monthly, currency)} />
        <StatTile label={t('leases.field.rentable_area')} value={lease.rentable_area != null ? formatNumber(lease.rentable_area) : '—'} />
        <StatTile label={t('leases.overview.noticeBy')} value={formatDate(notice_by)} tone={notice_by && (daysUntil(notice_by) ?? 1) < 0 ? 'danger' : 'neutral'} />
      </div>

      <div className="lw-overview-grid">
        <Card title={t('leases.overview.currentTerms')} padded={false}>
          {termFields.length === 0 ? (
            <EmptyState icon="📝" title={t('leases.overview.noTerms')} />
          ) : (
            <div className="table-wrap">
              <table className="table lw-terms">
                <thead>
                  <tr><th>{t('leases.overview.term')}</th><th>{t('leases.overview.value')}</th><th>{t('leases.overview.source')}</th></tr>
                </thead>
                <tbody>
                  {termFields.map((f) => {
                    const term = terms[f.key];
                    const src = docById.get(term.source_document_id);
                    return (
                      <tr key={f.key}>
                        <td className="muted lw-nowrap">{fieldLabel(t, f.key)}</td>
                        <td className="lw-pre">{formatFieldValue(f.key, term.value, currency)}</td>
                        <td>
                          <Link to={`/leases/${lease.id}/details?tab=abstract&doc=${term.source_document_id}`} className="small">
                            {src ? documentName(t, src) : term.source_title || t(`leases.docType.${term.source_doc_type}`)}
                          </Link>
                          {term.source_doc_type !== 'main_lease' && <div className="cell-sub">{t(`leases.docType.${term.source_doc_type}`)}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title={t('leases.overview.alerts')}>
            <AlertList alerts={alerts} />
          </Card>
          <Card title={t('leases.overview.timeline')}>
            {documents.length === 0 ? (
              <p className="muted">{t('leases.overview.noDocuments')}</p>
            ) : (
              <ol className="lw-timeline">
                {documents.map((d) => (
                  <li key={d.id}>
                    <span className="lw-timeline-dot" aria-hidden="true" />
                    <div className="lw-timeline-body">
                      <div className="row">
                        <DocTypeBadge type={d.doc_type} />
                        <span className="muted small">{d.effective_date ? formatDate(d.effective_date) : t('leases.overview.undated')}</span>
                        <SignatureBadge signature={d.signature} />
                      </div>
                      <Link to={`/leases/${lease.id}/details?tab=abstract&doc=${d.id}`} className="cell-title">{documentName(t, d)}</Link>
                      <p className="small lw-pre">
                        {d.doc_type === 'main_lease' ? (d.summary || t('leases.overview.mainLeaseSets')) : (d.changes_made || d.summary || '—')}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
