// Fund Administration → Capital Calls: every call across funds, filtered by fund and status; issue a call and
// record investors' payments (in the call's dialog).
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { get } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Button, Card, EmptyState, ErrorState, PageHeader, Select, Spinner, StatTile } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatMoney } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { CallStatusBadge, CapitalCallFormModal, CapitalCallModal, FundFilter } from './shared.tsx';
import type { CapitalCallRow, Fund } from './types.ts';
import './fund.css';

const STATUS_FILTERS = ['unpaid', 'overdue', 'partial', 'open', 'paid'] as const;

export default function CapitalCallsPage() {
  const t = useT();
  const { canEdit, currency } = useAuth();
  const [params, setParams] = useSearchParams();
  const fundId = params.get('fund') ?? '';
  const status = params.get('status') ?? '';
  const calls = useAsync((signal) => get<CapitalCallRow[]>('/fund/capital-calls', { fund_id: fundId, status }, signal), [fundId, status]);
  const funds = useAsync((signal) => get<Fund[]>('/fund/funds', undefined, signal), []);
  const [creating, setCreating] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const money = (v: number) => formatMoney(v, currency);

  const setFilter = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    setParams(p, { replace: true });
  };

  const rows = calls.data ?? [];
  const called = rows.reduce((s, c) => s + c.amount, 0);
  const paid = rows.reduce((s, c) => s + c.paid, 0);
  const overdue = rows.filter((c) => c.status === 'overdue').length;
  const fundOptions = funds.data ?? [];

  return (
    <div className="page">
      <PageHeader
        title={t('nav.fund.capitalCalls')}
        subtitle={t('fund.calls.subtitle')}
        actions={canEdit && <Button variant="primary" onClick={() => setCreating(true)} disabled={!fundOptions.length}>{t('fund.calls.new')}</Button>}
      />

      <div className="tiles">
        <StatTile label={t('fund.calls.totalCalled')} value={money(called)} hint={t('fund.calls.count', { n: rows.length })} />
        <StatTile label={t('fund.calls.totalPaid')} value={money(paid)} />
        <StatTile label={t('fund.calls.outstanding')} value={money(Math.round((called - paid) * 100) / 100)} tone={called - paid > 0.005 ? 'warning' : 'neutral'} />
        <StatTile label={t('fund.callStatus.overdue')} value={overdue} tone={overdue ? 'danger' : 'neutral'} onClick={() => setFilter('status', 'overdue')} />
      </div>

      <Card padded={false}>
        <div className="card-body fa-toolbar">
          <FundFilter funds={fundOptions} value={fundId} onChange={(id) => setFilter('fund', id)} />
          <label className="fa-filter">
            <span className="sr-only">{t('fund.common.status')}</span>
            <Select value={status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">{t('fund.common.allStatuses')}</option>
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{t(s === 'unpaid' ? 'fund.calls.unpaid' : `fund.callStatus.${s}`)}</option>)}
            </Select>
          </label>
        </div>
        {calls.loading && !calls.data ? <div className="card-body"><Spinner /></div>
          : calls.error ? <div className="card-body"><ErrorState error={calls.error} onRetry={calls.reload} /></div>
          : rows.length === 0 ? (
            <EmptyState icon="⇣" title={fundId || status ? t('fund.common.noMatches') : t('fund.calls.emptyTitle')}>
              {!fundId && !status && t('fund.calls.emptyBody')}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('fund.calls.call')}</th>
                    <th>{t('fund.calls.callDate')}</th>
                    <th>{t('fund.calls.dueDate')}</th>
                    <th>{t('fund.calls.purpose')}</th>
                    <th className="num">{t('fund.metrics.investors')}</th>
                    <th className="num">{t('fund.calls.amount')}</th>
                    <th className="num">{t('fund.calls.paid')}</th>
                    <th>{t('fund.common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => setCallId(c.id)}>
                      <td><div className="fa-strong">{c.fund_name}</div><div className="fa-sub">#{c.call_number}</div></td>
                      <td>{formatDate(c.call_date)}</td>
                      <td>{formatDate(c.due_date)}</td>
                      <td>{t(`fund.purpose.${c.purpose}`)}</td>
                      <td className="num">{c.investors}</td>
                      <td className="num">{money(c.amount)}</td>
                      <td className="num">{money(c.paid)}</td>
                      <td><CallStatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <CapitalCallFormModal open={creating} fundId={fundId || undefined} funds={fundOptions} onClose={() => setCreating(false)}
        onSaved={(id) => { setCreating(false); calls.reload(); setCallId(id); }} />
      <CapitalCallModal callId={callId} onClose={() => setCallId(null)} onChanged={calls.reload} />
    </div>
  );
}
