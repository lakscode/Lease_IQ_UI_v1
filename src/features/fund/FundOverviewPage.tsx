// Fund Administration → Overview: totals across all funds, each fund's performance, open capital calls and
// recent distributions.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { get } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Button, Card, EmptyState, ErrorState, PageHeader, Spinner, StatTile } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatMoney, formatPercent } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { formatMultiple } from './labels.ts';
import { CallStatusBadge, CapitalCallModal, DistributionModal, FundStatusBadge } from './shared.tsx';
import type { FundOverview } from './types.ts';
import './fund.css';

export default function FundOverviewPage() {
  const t = useT();
  const navigate = useNavigate();
  const { canEdit, currency } = useAuth();
  const overview = useAsync((signal) => get<FundOverview>('/fund/overview', undefined, signal), []);
  const [callId, setCallId] = useState<string | null>(null);
  const [distributionId, setDistributionId] = useState<string | null>(null);
  const data = overview.data;
  const money = (v: number | null) => (v === null ? '—' : formatMoney(v, currency));

  return (
    <div className="page">
      <PageHeader title={t('fund.overview.title')} subtitle={t('fund.overview.subtitle')} />

      {overview.loading && !data ? <Spinner /> : overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : data && (
        data.funds.length === 0 ? (
          <Card>
            <EmptyState
              icon="◈"
              title={t('fund.overview.emptyTitle')}
              action={canEdit && <Button variant="primary" onClick={() => navigate('/fund/funds?new=1')}>{t('fund.funds.new')}</Button>}
            >
              {t('fund.overview.emptyBody')}
            </EmptyState>
          </Card>
        ) : (
          <>
            <div className="tiles">
              <StatTile label={t('fund.metrics.commitments')} value={money(data.totals.commitments)}
                hint={t('fund.overview.fundsInvestors', { funds: data.totals.funds, investors: data.totals.investors })} />
              <StatTile label={t('fund.metrics.paidIn')} value={money(data.totals.paid_in)}
                hint={t('fund.overview.uncalled', { amount: money(data.totals.uncalled) })} />
              <StatTile label={t('fund.metrics.distributed')} value={money(data.totals.distributed)} hint={`${t('fund.metrics.dpi')} ${formatMultiple(data.totals.dpi)}`} />
              <StatTile label={t('fund.metrics.nav')} value={money(data.totals.nav)} hint={`${t('fund.metrics.tvpi')} ${formatMultiple(data.totals.tvpi)}`} tone="primary" />
              <StatTile label={t('fund.metrics.receivable')} value={money(data.totals.receivable)}
                tone={data.totals.receivable > 0 ? 'warning' : 'neutral'} onClick={() => navigate('/fund/capital-calls?status=unpaid')} />
            </div>

            <Card title={t('nav.fund.funds')} padded={false} actions={<Link to="/fund/funds">{t('fund.overview.manageFunds')}</Link>}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('fund.common.fund')}</th>
                      <th>{t('fund.common.status')}</th>
                      <th className="num">{t('fund.metrics.commitments')}</th>
                      <th className="num">{t('fund.metrics.calledPct')}</th>
                      <th className="num">{t('fund.metrics.paidIn')}</th>
                      <th className="num">{t('fund.metrics.distributed')}</th>
                      <th className="num">{t('fund.metrics.nav')}</th>
                      <th className="num">{t('fund.metrics.tvpi')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.funds.map((f) => (
                      <tr key={f.id} className="clickable" onClick={() => navigate(`/fund/funds/${f.id}`)}>
                        <td>
                          <div className="fa-strong">{f.name}</div>
                          {(f.strategy || f.vintage_year) && <div className="fa-sub">{[f.strategy, f.vintage_year].filter(Boolean).join(' · ')}</div>}
                        </td>
                        <td><FundStatusBadge status={f.status} /></td>
                        <td className="num">{money(f.metrics.commitments)}</td>
                        <td className="num">{f.metrics.called_pct === null ? '—' : formatPercent(f.metrics.called_pct / 100, 1)}</td>
                        <td className="num">{money(f.metrics.paid_in)}</td>
                        <td className="num">{money(f.metrics.distributed)}</td>
                        <td className="num">{money(f.metrics.nav)}</td>
                        <td className="num">{formatMultiple(f.metrics.tvpi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid-2">
              <Card title={t('fund.overview.openCalls')} padded={false} actions={<Link to="/fund/capital-calls">{t('fund.overview.allCalls')}</Link>}>
                {data.open_calls.length === 0 ? <p className="muted fa-pad">{t('fund.overview.noOpenCalls')}</p> : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('fund.calls.call')}</th>
                          <th>{t('fund.calls.dueDate')}</th>
                          <th className="num">{t('fund.calls.outstanding')}</th>
                          <th>{t('fund.common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.open_calls.map((c) => (
                          <tr key={c.id} className="clickable" onClick={() => setCallId(c.id)}>
                            <td><div className="fa-strong">{c.fund_name}</div><div className="fa-sub">#{c.call_number}</div></td>
                            <td>{formatDate(c.due_date)}</td>
                            <td className="num">{money(Math.round((c.amount - c.paid) * 100) / 100)}</td>
                            <td><CallStatusBadge status={c.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
              <Card title={t('fund.overview.recentDistributions')} padded={false} actions={<Link to="/fund/distributions">{t('fund.overview.allDistributions')}</Link>}>
                {data.recent_distributions.length === 0 ? <p className="muted fa-pad">{t('fund.overview.noDistributions')}</p> : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('fund.common.fund')}</th>
                          <th>{t('fund.distributions.date')}</th>
                          <th>{t('fund.distributions.type')}</th>
                          <th className="num">{t('fund.distributions.amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent_distributions.map((d) => (
                          <tr key={d.id} className="clickable" onClick={() => setDistributionId(d.id)}>
                            <td><div className="fa-strong">{d.fund_name}</div><div className="fa-sub">#{d.distribution_number}</div></td>
                            <td>{formatDate(d.distribution_date)}</td>
                            <td>{t(`fund.distType.${d.distribution_type}`)}</td>
                            <td className="num">{money(d.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          </>
        )
      )}

      <CapitalCallModal callId={callId} onClose={() => setCallId(null)} onChanged={overview.reload} />
      <DistributionModal distributionId={distributionId} onClose={() => setDistributionId(null)} onChanged={overview.reload} />
    </div>
  );
}
