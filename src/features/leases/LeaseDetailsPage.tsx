// Lease workspace: abstract, alerts, clauses, documents (incl. supporting documents), signatures, record,
// system record, opportunities, rent audit, CAM and activity. Deep links: ?tab=&doc=&page= (and &att= for a
// supporting document)
import { useCallback, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button, Card, ErrorState, LeaseStatusBadge, PageHeader, Spinner, Tabs } from '../../components/ui.tsx';
import { useToast } from '../../components/feedback.ts';
import { EmailDialog } from '../../components/EmailDialog.tsx';
import { useT } from '../../i18n/index.tsx';
import { get, getBlob, post, saveBlob } from '../../api/client.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { formatDate } from '../../lib/format.ts';
import SaveToCloudMenu from '../cloud/SaveToCloudMenu.tsx';
import SystemRecordTab from '../analytics/SystemRecordTab.tsx';
import OpportunitiesTab from '../intelligence/OpportunitiesTab.tsx';
import RentAuditTab from '../intelligence/RentAuditTab.tsx';
import CamTab from '../intelligence/CamTab.tsx';
import AbstractTab from './workspace/AbstractTab.tsx';
import ClausesTab from './workspace/ClausesTab.tsx';
import DocumentsTab from './workspace/DocumentsTab.tsx';
import TasksCard from './workspace/TasksCard.tsx';
import { RecordTab, SignaturesTab } from './workspace/RecordTabs.tsx';
import ActivityTab from './workspace/ActivityTab.tsx';
import ReviewTab from './workspace/ReviewTab.tsx';
import UploadZone from './UploadZone.tsx';
import { AlertList } from './shared.tsx';
import { errorText } from './labels.ts';
import type { LeaseDetail } from './types.ts';
import { useAuth } from '../../auth/useAuth.ts';
import './leases.css';

// Supporting documents (attachments) live inside the Documents tab; ?tab=attachments still resolves there.
const TABS = ['abstract', 'review', 'alerts', 'rentAudit', 'cam', 'opportunities', 'clauses', 'documents', 'signatures', 'record', 'system', 'activity'] as const;
type TabKey = (typeof TABS)[number];

function ReportActions({ leaseId, tenant }: { leaseId: string; tenant: string | null }) {
  const t = useT();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const fetchReport = useCallback(async () => {
    const { blob, filename } = await getBlob(`/leases/${leaseId}/report.pdf`);
    return { blob, name: filename ?? 'Lease-abstract.pdf' };
  }, [leaseId]);

  const download = async () => {
    setDownloading(true);
    try {
      const { blob, name } = await fetchReport();
      saveBlob(blob, name);
    } catch (err) {
      toast(errorText(t, err), 'danger');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Button onClick={download} loading={downloading}>{t('leases.report.download')}</Button>
      <SaveToCloudMenu
        getFile={fetchReport}
        onSaved={(destination, name, url) => {
          post(`/leases/${leaseId}/report/saved`, { destination, name, url }).catch(() => undefined);
        }}
      />
      <Button onClick={() => setEmailOpen(true)}>{t('leases.report.email')}</Button>
      <EmailDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title={t('leases.report.emailTitle')}
        description={t('leases.report.emailDescription', { tenant: tenant ?? t('leases.unnamed') })}
        onSend={async (to, message) => {
          try {
            await post(`/leases/${leaseId}/report/email`, { to, message });
            toast(t('leases.report.emailed', { count: to.length }), 'success');
          } catch (err) {
            throw new Error(errorText(t, err));
          }
        }}
      />
    </>
  );
}

export default function LeaseDetailsPage() {
  const t = useT();
  const { leaseId = '' } = useParams();
  const { canEdit } = useAuth();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tabParam = (rawTab === 'attachments' ? 'documents' : rawTab) as TabKey | null;
  const tab: TabKey = tabParam && (TABS as readonly string[]).includes(tabParam) ? tabParam : 'abstract';
  const docId = params.get('doc');
  const attId = params.get('att');
  const pageParam = Number(params.get('page'));
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : null;
  const [version, setVersion] = useState(0);
  const [amendOpen, setAmendOpen] = useState(false);

  const { data, error, loading, reload } = useAsync((signal) => get<LeaseDetail>(`/leases/${leaseId}`, undefined, signal), [leaseId]);
  const refresh = () => {
    reload();
    setVersion((v) => v + 1);
  };

  const navigate = (next: { tab?: TabKey; doc?: string | null; att?: string | null; page?: number | null }) => {
    const p = new URLSearchParams(params);
    const set = (k: string, v: string | null | undefined) => (v ? p.set(k, v) : p.delete(k));
    if (next.tab !== undefined) set('tab', next.tab === 'abstract' ? null : next.tab);
    if (next.doc !== undefined) set('doc', next.doc);
    if (next.att !== undefined) set('att', next.att);
    if (next.page !== undefined) set('page', next.page ? String(next.page) : null);
    setParams(p, { replace: next.tab === undefined });
  };

  if (loading && !data) return <div className="page"><Spinner /></div>;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return null;
  const { lease, alerts } = data;
  const urgent = alerts.filter((a) => a.severity === 'urgent').length;

  return (
    <div className="page lw-workspace">
      <PageHeader
        back={<Link to={`/leases/${lease.id}`}>← {t('leases.details.backOverview')}</Link>}
        title={<span className="row">{lease.tenant_name || t('leases.unnamed')} <LeaseStatusBadge status={lease.status} /></span>}
        subtitle={[lease.premises_address, lease.expiration_date && t('leases.details.expires', { date: formatDate(lease.expiration_date) })].filter(Boolean).join(' · ')}
        actions={
          <>
            <ReportActions leaseId={lease.id} tenant={lease.tenant_name} />
            <Link className="btn btn-secondary" to={`/assistant?leaseId=${lease.id}`}>{t('leases.overview.ask')}</Link>
            {canEdit && <Button variant="primary" onClick={() => setAmendOpen((v) => !v)}>{t('leases.upload.addAmendment')}</Button>}
          </>
        }
      />

      {amendOpen && canEdit && (
        <Card title={t('leases.upload.addAmendment')}>
          <UploadZone targetLeaseId={lease.id} compact onUploaded={() => undefined} />
          <p className="muted small">{t('leases.details.amendmentHint')}</p>
        </Card>
      )}

      <Tabs<TabKey>
        items={TABS.map((key) => ({
          key,
          label: t(`leases.tab.${key}`),
          ...(key === 'alerts' && alerts.length ? { count: alerts.length } : {}),
          ...(key === 'documents' ? { count: data.documents.length } : {}),
        }))}
        active={tab}
        onChange={(key) => navigate({ tab: key, page: null })}
      />
      {urgent > 0 && tab === 'abstract' && (
        <button type="button" className="lw-urgent-banner" onClick={() => navigate({ tab: 'alerts' })}>
          ⚠ {t('leases.details.urgentAlerts', { count: urgent })}
        </button>
      )}

      <div className="lw-tab-body">
        {tab === 'abstract' && <AbstractTab detail={data} docId={docId} onDocChange={(id) => navigate({ doc: id })} onChanged={refresh} version={version} />}
        {tab === 'review' && <ReviewTab detail={data} onChanged={refresh} />}
        {tab === 'alerts' && (
          <div className="stack" style={{ gap: 16 }}>
            <Card title={t('leases.tab.alerts')}><AlertList alerts={alerts} /></Card>
            <TasksCard leaseId={lease.id} onChanged={reload} onOpenAttachment={(id) => navigate({ tab: 'documents', att: id, page: null })} />
          </div>
        )}
        {tab === 'clauses' && <ClausesTab leaseId={lease.id} onChanged={() => setVersion((v) => v + 1)} />}
        {tab === 'opportunities' && <OpportunitiesTab leaseId={lease.id} />}
        {tab === 'rentAudit' && <RentAuditTab leaseId={lease.id} />}
        {tab === 'cam' && <CamTab leaseId={lease.id} />}
        {tab === 'documents' && (
          <DocumentsTab
            detail={data}
            docId={docId}
            attId={attId}
            page={page}
            onSelect={(id, pg) => navigate({ doc: id, att: null, page: pg ?? null })}
            onSelectAttachment={(id) => navigate({ att: id, page: null })}
            onChanged={reload}
          />
        )}
        {tab === 'signatures' && <SignaturesTab detail={data} onChanged={refresh} />}
        {tab === 'record' && <RecordTab detail={data} />}
        {tab === 'system' && <SystemRecordTab leaseId={lease.id} />}
        {tab === 'activity' && <ActivityTab leaseId={lease.id} version={version} />}
      </div>
    </div>
  );
}
