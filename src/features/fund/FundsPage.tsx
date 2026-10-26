// Fund Administration → Funds: every fund with its key figures; create a fund here (?new=1 opens the form).
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { get } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Spinner } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatMoney, formatPercent } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { formatMultiple } from './labels.ts';
import { FundFormModal, FundStatusBadge } from './shared.tsx';
import type { FundWithMetrics } from './types.ts';
import './fund.css';

export default function FundsPage() {
  const t = useT();
  const navigate = useNavigate();
  const { canEdit, currency } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const funds = useAsync((signal) => get<FundWithMetrics[]>('/fund/funds', undefined, signal), []);
  const creating = canEdit && params.get('new') === '1';
  const setCreating = (open: boolean) => {
    const p = new URLSearchParams(params);
    if (open) p.set('new', '1');
    else p.delete('new');
    setParams(p, { replace: true });
  };

  const q = search.trim().toLowerCase();
  const rows = (funds.data ?? []).filter((f) => !q || `${f.name} ${f.strategy ?? ''}`.toLowerCase().includes(q));
  const money = (v: number | null) => (v === null ? '—' : formatMoney(v, currency));

  return (
    <div className="page">
      <PageHeader
        title={t('nav.fund.funds')}
        subtitle={t('fund.funds.subtitle')}
        actions={canEdit && <Button variant="primary" onClick={() => setCreating(true)}>{t('fund.funds.new')}</Button>}
      />

      <Card padded={false}>
        {funds.loading && !funds.data ? <div className="card-body"><Spinner /></div>
          : funds.error ? <div className="card-body"><ErrorState error={funds.error} onRetry={funds.reload} /></div>
          : !funds.data?.length ? (
            <EmptyState icon="▣" title={t('fund.funds.emptyTitle')}
              action={canEdit && <Button variant="primary" onClick={() => setCreating(true)}>{t('fund.funds.new')}</Button>}>
              {t('fund.funds.emptyBody')}
            </EmptyState>
          ) : (
            <>
              <div className="card-body fa-toolbar">
                <Input type="search" placeholder={t('fund.funds.search')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('common.search')} />
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('fund.common.fund')}</th>
                      <th>{t('fund.common.status')}</th>
                      <th className="num">{t('fund.funds.targetSize')}</th>
                      <th className="num">{t('fund.metrics.commitments')}</th>
                      <th className="num">{t('fund.metrics.calledPct')}</th>
                      <th className="num">{t('fund.metrics.investors')}</th>
                      <th className="num">{t('fund.metrics.properties')}</th>
                      <th className="num">{t('fund.metrics.nav')}</th>
                      <th className="num">{t('fund.metrics.tvpi')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((f) => (
                      <tr key={f.id} className="clickable" onClick={() => navigate(`/fund/funds/${f.id}`)}>
                        <td>
                          <div className="fa-strong">{f.name}</div>
                          {(f.strategy || f.vintage_year) && <div className="fa-sub">{[f.strategy, f.vintage_year].filter(Boolean).join(' · ')}</div>}
                        </td>
                        <td><FundStatusBadge status={f.status} /></td>
                        <td className="num">{money(f.target_size)}</td>
                        <td className="num">{money(f.metrics.commitments)}</td>
                        <td className="num">{f.metrics.called_pct === null ? '—' : formatPercent(f.metrics.called_pct / 100, 1)}</td>
                        <td className="num">{f.metrics.investors}</td>
                        <td className="num">{f.metrics.properties}</td>
                        <td className="num">{money(f.metrics.nav)}</td>
                        <td className="num">{formatMultiple(f.metrics.tvpi)}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={9} className="muted">{t('fund.common.noMatches')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
      </Card>

      <FundFormModal open={creating} onClose={() => setCreating(false)} onSaved={(fund) => navigate(`/fund/funds/${fund.id}`)} />
    </div>
  );
}
