// Fund Administration → NAV: net asset value history per fund. The latest NAV drives RVPI/TVPI and investors'
// NAV shares.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { del, get } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatMoney } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { FundFilter, ValuationFormModal } from './shared.tsx';
import type { Fund, ValuationRow } from './types.ts';
import './fund.css';

export default function ValuationsPage() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit, currency } = useAuth();
  const [params, setParams] = useSearchParams();
  const fundId = params.get('fund') ?? '';
  const list = useAsync((signal) => get<ValuationRow[]>('/fund/valuations', { fund_id: fundId }, signal), [fundId]);
  const funds = useAsync((signal) => get<Fund[]>('/fund/funds', undefined, signal), []);
  const [creating, setCreating] = useState(false);

  const setFund = (id: string) => {
    const p = new URLSearchParams(params);
    if (id) p.set('fund', id);
    else p.delete('fund');
    setParams(p, { replace: true });
  };

  const rows = list.data ?? [];
  // Rows come newest first, so the first row of each fund is its current NAV.
  const latest = new Set<string>();
  const seen = new Set<string>();
  for (const v of rows) if (!seen.has(v.fund_id)) { seen.add(v.fund_id); latest.add(v.id); }
  const fundOptions = funds.data ?? [];

  const remove = async (v: ValuationRow) => {
    const ok = await confirm({ title: t('fund.nav.deleteTitle'), message: t('fund.nav.deleteMessage', { date: formatDate(v.as_of_date) }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await del(`/fund/valuations/${v.id}`);
      toast(t('fund.nav.deleted'));
      list.reload();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={t('nav.fund.nav')}
        subtitle={t('fund.nav.subtitle')}
        actions={canEdit && <Button variant="primary" onClick={() => setCreating(true)} disabled={!fundOptions.length}>{t('fund.nav.new')}</Button>}
      />

      <Card padded={false}>
        <div className="card-body fa-toolbar">
          <FundFilter funds={fundOptions} value={fundId} onChange={setFund} />
        </div>
        {list.loading && !list.data ? <div className="card-body"><Spinner /></div>
          : list.error ? <div className="card-body"><ErrorState error={list.error} onRetry={list.reload} /></div>
          : rows.length === 0 ? (
            <EmptyState icon="≋" title={fundId ? t('fund.common.noMatches') : t('fund.nav.emptyTitle')}>
              {!fundId && t('fund.nav.emptyBody')}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('fund.common.fund')}</th>
                    <th>{t('fund.nav.asOf')}</th>
                    <th className="num">{t('fund.nav.value')}</th>
                    <th>{t('fund.common.notes')}</th>
                    {canEdit && <th className="num">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.id}>
                      <td><Link to={`/fund/funds/${v.fund_id}`} className="fa-strong">{v.fund_name}</Link></td>
                      <td>{formatDate(v.as_of_date)} {latest.has(v.id) && <span className="badge badge-primary">{t('fund.nav.current')}</span>}</td>
                      <td className="num">{formatMoney(v.nav, currency)}</td>
                      <td className="fa-sub">{v.notes ?? ''}</td>
                      {canEdit && <td className="num"><Button size="sm" variant="ghost" onClick={() => remove(v)}>{t('common.delete')}</Button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <ValuationFormModal open={creating} fundId={fundId || undefined} funds={fundOptions} onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); list.reload(); }} />
    </div>
  );
}
