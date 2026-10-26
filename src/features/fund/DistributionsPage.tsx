// Fund Administration → Distributions: every distribution across funds; record one (split pro rata by commitment).
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { get } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Button, Card, EmptyState, ErrorState, PageHeader, Spinner, StatTile } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatMoney } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { DistributionFormModal, DistributionModal, FundFilter } from './shared.tsx';
import { DISTRIBUTION_TYPES, type DistributionRow, type Fund } from './types.ts';
import './fund.css';

export default function DistributionsPage() {
  const t = useT();
  const { canEdit, currency } = useAuth();
  const [params, setParams] = useSearchParams();
  const fundId = params.get('fund') ?? '';
  const list = useAsync((signal) => get<DistributionRow[]>('/fund/distributions', { fund_id: fundId }, signal), [fundId]);
  const funds = useAsync((signal) => get<Fund[]>('/fund/funds', undefined, signal), []);
  const [creating, setCreating] = useState(false);
  const [distributionId, setDistributionId] = useState<string | null>(null);
  const money = (v: number) => formatMoney(v, currency);

  const setFund = (id: string) => {
    const p = new URLSearchParams(params);
    if (id) p.set('fund', id);
    else p.delete('fund');
    setParams(p, { replace: true });
  };

  const rows = list.data ?? [];
  const byType = (type: string) => rows.filter((d) => d.distribution_type === type).reduce((s, d) => s + d.amount, 0);
  const fundOptions = funds.data ?? [];

  return (
    <div className="page">
      <PageHeader
        title={t('nav.fund.distributions')}
        subtitle={t('fund.distributions.subtitle')}
        actions={canEdit && <Button variant="primary" onClick={() => setCreating(true)} disabled={!fundOptions.length}>{t('fund.distributions.new')}</Button>}
      />

      <div className="tiles">
        <StatTile label={t('fund.distributions.total')} value={money(rows.reduce((s, d) => s + d.amount, 0))} hint={t('fund.distributions.count', { n: rows.length })} tone="primary" />
        {DISTRIBUTION_TYPES.filter((type) => byType(type) > 0).map((type) => (
          <StatTile key={type} label={t(`fund.distType.${type}`)} value={money(byType(type))} />
        ))}
      </div>

      <Card padded={false}>
        <div className="card-body fa-toolbar">
          <FundFilter funds={fundOptions} value={fundId} onChange={setFund} />
        </div>
        {list.loading && !list.data ? <div className="card-body"><Spinner /></div>
          : list.error ? <div className="card-body"><ErrorState error={list.error} onRetry={list.reload} /></div>
          : rows.length === 0 ? (
            <EmptyState icon="⇡" title={fundId ? t('fund.common.noMatches') : t('fund.distributions.emptyTitle')}>
              {!fundId && t('fund.distributions.emptyBody')}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('fund.distributions.distribution')}</th>
                    <th>{t('fund.distributions.date')}</th>
                    <th>{t('fund.distributions.type')}</th>
                    <th className="num">{t('fund.metrics.investors')}</th>
                    <th className="num">{t('fund.distributions.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id} className="clickable" onClick={() => setDistributionId(d.id)}>
                      <td><div className="fa-strong">{d.fund_name}</div><div className="fa-sub">#{d.distribution_number}</div></td>
                      <td>{formatDate(d.distribution_date)}</td>
                      <td>{t(`fund.distType.${d.distribution_type}`)}</td>
                      <td className="num">{d.investors}</td>
                      <td className="num">{money(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <DistributionFormModal open={creating} fundId={fundId || undefined} funds={fundOptions} onClose={() => setCreating(false)}
        onSaved={(id) => { setCreating(false); list.reload(); setDistributionId(id); }} />
      <DistributionModal distributionId={distributionId} onClose={() => setDistributionId(null)} onChanged={list.reload} />
    </div>
  );
}
