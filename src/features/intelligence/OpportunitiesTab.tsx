// Opportunities for one lease: AI review against 20 revenue/risk categories (embedded in the lease workspace).
import { useEffect, useMemo, useState } from 'react';
import { get, post } from '../../api/client.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Spinner, StatTile, useToast } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import {
  AiNotConfigured, JobStatusBadge, PageLink, PriorityBadge, errorText, isAiNotConfigured, type LeaseDocumentOption,
} from './shared.tsx';

export interface Opportunity {
  id: string;
  lease_id: string;
  category: string;
  kind: 'revenue' | 'risk';
  status: 'action' | 'watch' | 'none' | 'needs_data';
  priority: 'high' | 'medium' | 'low' | null;
  summary: string | null;
  due_date: string | null;
  amount: number | null;
  citations: { document_id: string; page: number | null; quote: string }[] | null;
}

interface InsightsResponse {
  status: 'none' | 'processing' | 'completed' | 'failed';
  error: string | null;
  generated_at: string | null;
  opportunities: Opportunity[];
}

const STATUS_TONE = { action: 'danger', watch: 'warning', needs_data: 'info', none: 'neutral' } as const;

export default function OpportunitiesTab({ leaseId }: { leaseId: string }) {
  const t = useT();
  const { canEdit, currency, config } = useAuth();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [showNone, setShowNone] = useState(false);
  const insights = useAsync((signal) => get<InsightsResponse>(`/leases/${leaseId}/insights`, undefined, signal), [leaseId]);
  const docs = useAsync(
    (signal) => get<{ documents: LeaseDocumentOption[] }>(`/leases/${leaseId}`, undefined, signal).then((d) => d.documents).catch(() => [] as LeaseDocumentOption[]),
    [leaseId],
  );
  const status = insights.data?.status ?? 'none';

  // Poll while the review runs.
  const { reload } = insights;
  useEffect(() => {
    if (status !== 'processing') return;
    const id = window.setInterval(reload, 4000);
    return () => window.clearInterval(id);
  }, [status, reload]);

  const generate = async () => {
    setStarting(true);
    setAiError(false);
    try {
      await post(`/leases/${leaseId}/insights`);
      insights.setData((d) => (d ? { ...d, status: 'processing', error: null } : d));
    } catch (err) {
      if (isAiNotConfigured(err)) setAiError(true);
      else toast(errorText(t, err), 'danger');
    } finally {
      setStarting(false);
    }
  };

  const docTitle = useMemo(() => {
    const map = new Map((docs.data ?? []).map((d) => [d.id, d.title ?? t(`intel.docType.${d.doc_type}`)]));
    return (id: string) => map.get(id) ?? t('intel.opp.document');
  }, [docs.data, t]);

  if (insights.loading && !insights.data) return <Spinner />;
  if (insights.error) return <ErrorState error={insights.error} onRetry={insights.reload} />;
  const data = insights.data as InsightsResponse;
  const opps = data.opportunities;
  const visible = opps.filter((o) => showNone || o.status !== 'none');
  const open = opps.filter((o) => o.status === 'action' || o.status === 'watch');
  const revenueAmount = open.filter((o) => o.kind === 'revenue').reduce((a, o) => a + (Number(o.amount) || 0), 0);

  const actions = canEdit && (
    <Button variant={opps.length ? 'secondary' : 'primary'} loading={starting} disabled={status === 'processing' || config?.ai === false} onClick={() => void generate()}>
      {opps.length ? t('intel.opp.regenerate') : t('intel.opp.generate')}
    </Button>
  );

  const group = (kind: 'revenue' | 'risk') => {
    const rows = visible.filter((o) => o.kind === kind);
    return (
      <Card title={t(`intel.opp.${kind}`)}>
        {!rows.length ? <p className="muted small">{t('intel.opp.noneInGroup')}</p> : (
          <div className="intel-opps">
            {rows.map((o) => (
              <article key={o.id} className={`intel-opp status-${o.status}`}>
                <div className="intel-opp-head">
                  <span className="intel-opp-title">{t(`intel.cat.${o.category}`)}</span>
                  <span className="row">
                    <Badge tone={STATUS_TONE[o.status]}>{t(`intel.oppStatus.${o.status}`)}</Badge>
                    <PriorityBadge priority={o.priority} />
                  </span>
                </div>
                {o.summary && <p className="intel-opp-summary">{o.summary}</p>}
                <div className="intel-muted-row">
                  {o.due_date && <span>{t('intel.opp.due')}: <strong>{formatDate(o.due_date)}</strong></span>}
                  {o.amount !== null && <span>{t('intel.opp.amount')}: <strong>{formatMoney(o.amount, currency)}</strong></span>}
                </div>
                {!!o.citations?.length && (
                  <div className="intel-chips">
                    {o.citations.map((c, i) => (
                      <PageLink key={i} leaseId={leaseId} documentId={c.document_id} page={c.page}
                        label={c.page ? t('intel.opp.citePage', { doc: docTitle(c.document_id), page: c.page }) : docTitle(c.document_id)} quote={c.quote} />
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="intel-stack">
      <div className="row-between">
        <div className="row">
          <JobStatusBadge status={status} />
          {data.generated_at && <span className="muted small">{t('intel.opp.generatedAt', { date: formatDateTime(data.generated_at) })}</span>}
          {status === 'processing' && <span className="muted small">{t('intel.opp.processing')}</span>}
        </div>
        <div className="row">
          {opps.some((o) => o.status === 'none') && (
            <label className="checkbox small"><input type="checkbox" checked={showNone} onChange={(e) => setShowNone(e.target.checked)} /> {t('intel.opp.showNone')}</label>
          )}
          {actions}
        </div>
      </div>
      {(aiError || (config?.ai === false && canEdit && !opps.length)) && <AiNotConfigured />}
      {status === 'failed' && <Alert tone="danger" title={t('intel.opp.failed')}>{data.error}</Alert>}
      {!opps.length ? (
        status === 'processing' ? <Spinner label={t('intel.opp.processing')} /> : (
          <EmptyState icon="💡" title={t('intel.opp.emptyTitle')}>{canEdit ? t('intel.opp.emptyBody') : t('intel.opp.emptyViewer')}</EmptyState>
        )
      ) : (
        <>
          <div className="tiles">
            <StatTile label={t('intel.oppStatus.action')} value={opps.filter((o) => o.status === 'action').length} tone="danger" />
            <StatTile label={t('intel.oppStatus.watch')} value={opps.filter((o) => o.status === 'watch').length} tone="warning" />
            <StatTile label={t('intel.opp.revenueOpen')} value={formatMoney(revenueAmount, currency)} hint={t('intel.opp.revenueOpenHint')} tone="success" />
            <StatTile label={t('intel.opp.highRisks')} value={open.filter((o) => o.kind === 'risk' && o.priority === 'high').length} />
          </div>
          <div className="grid-2">
            {group('revenue')}
            {group('risk')}
          </div>
        </>
      )}
    </div>
  );
}
