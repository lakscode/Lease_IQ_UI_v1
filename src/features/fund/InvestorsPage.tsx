// Fund Administration → Investors: the LP directory with each investor's commitments across funds.
import { useState } from 'react';
import { Link } from 'react-router';
import { del, get } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Select, Spinner } from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatMoney } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { CommitmentFormModal, InvestorFormModal } from './shared.tsx';
import { INVESTOR_TYPES, type Commitment, type Fund, type InvestorRow } from './types.ts';
import './fund.css';

export default function InvestorsPage() {
  const t = useT();
  const { canEdit, currency } = useAuth();
  const investors = useAsync((signal) => get<InvestorRow[]>('/fund/investors', undefined, signal), []);
  const funds = useAsync((signal) => get<Fund[]>('/fund/funds', undefined, signal), []);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const money = (v: number) => formatMoney(v, currency);

  const q = search.trim().toLowerCase();
  const rows = (investors.data ?? []).filter((i) =>
    (!type || i.investor_type === type)
    && (!q || `${i.name} ${i.contact_name ?? ''} ${i.email ?? ''}`.toLowerCase().includes(q)));
  const open = investors.data?.find((i) => i.id === openId) ?? null;

  return (
    <div className="page">
      <PageHeader
        title={t('nav.fund.investors')}
        subtitle={t('fund.investors.subtitle')}
        actions={canEdit && <Button variant="primary" onClick={() => setCreating(true)}>{t('fund.investors.new')}</Button>}
      />

      <Card padded={false}>
        {investors.loading && !investors.data ? <div className="card-body"><Spinner /></div>
          : investors.error ? <div className="card-body"><ErrorState error={investors.error} onRetry={investors.reload} /></div>
          : !investors.data?.length ? (
            <EmptyState icon="♟" title={t('fund.investors.emptyTitle')}
              action={canEdit && <Button variant="primary" onClick={() => setCreating(true)}>{t('fund.investors.new')}</Button>}>
              {t('fund.investors.emptyBody')}
            </EmptyState>
          ) : (
            <>
              <div className="card-body fa-toolbar">
                <Input type="search" placeholder={t('fund.investors.search')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('common.search')} />
                <label className="fa-filter">
                  <span className="sr-only">{t('fund.investors.type')}</span>
                  <Select value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="">{t('fund.investors.allTypes')}</option>
                    {INVESTOR_TYPES.map((x) => <option key={x} value={x}>{t(`fund.investorType.${x}`)}</option>)}
                  </Select>
                </label>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('fund.common.investor')}</th>
                      <th>{t('fund.investors.type')}</th>
                      <th>{t('fund.investors.contact')}</th>
                      <th className="num">{t('nav.fund.funds')}</th>
                      <th className="num">{t('fund.metrics.commitments')}</th>
                      <th className="num">{t('fund.metrics.paidIn')}</th>
                      <th className="num">{t('fund.metrics.distributed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => (
                      <tr key={i.id} className="clickable" onClick={() => setOpenId(i.id)}>
                        <td className="fa-strong">{i.name}</td>
                        <td>{t(`fund.investorType.${i.investor_type}`)}</td>
                        <td>{i.contact_name ?? '—'}{i.email && <div className="fa-sub">{i.email}</div>}</td>
                        <td className="num">{i.commitments.length}</td>
                        <td className="num">{money(i.total_commitment)}</td>
                        <td className="num">
                          {money(i.paid_in)}
                          {i.receivable > 0 && <div className="fa-sub fa-warn">{t('fund.accounts.due', { amount: money(i.receivable) })}</div>}
                        </td>
                        <td className="num">{money(i.distributed)}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={7} className="muted">{t('fund.common.noMatches')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
      </Card>

      <InvestorFormModal open={creating} onClose={() => setCreating(false)} onSaved={(inv) => { setCreating(false); investors.reload(); setOpenId(inv.id); }} />
      <InvestorModal key={openId ?? ''} investor={open} funds={funds.data ?? []} onClose={() => setOpenId(null)} onChanged={investors.reload} />
    </div>
  );
}

function InvestorModal({ investor, funds, onClose, onChanged }: {
  investor: InvestorRow | null; funds: Fund[]; onClose: () => void; onChanged: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit, currency } = useAuth();
  const [editing, setEditing] = useState(false);
  const [commitment, setCommitment] = useState<Commitment | 'new' | null>(null);
  if (!investor) return null;

  const remove = async () => {
    const ok = await confirm({ title: t('fund.investors.deleteTitle'), message: t('fund.investors.deleteMessage', { name: investor.name }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await del(`/fund/investors/${investor.id}`);
      toast(t('fund.investors.deleted'));
      onChanged();
      onClose();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  const removeCommitment = async (c: InvestorRow['commitments'][number]) => {
    const ok = await confirm({ title: t('fund.commitments.removeTitle'), message: t('fund.commitments.removeFundMessage', { fund: c.fund_name }), confirmLabel: t('common.remove'), danger: true });
    if (!ok) return;
    try {
      await del(`/fund/commitments/${c.id}`);
      toast(t('fund.commitments.removed'));
      onChanged();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  const committed = new Set(investor.commitments.map((c) => c.fund_id));

  return (
    <>
      <Modal
        open={!editing && !commitment}
        wide
        title={investor.name}
        onClose={onClose}
        footer={canEdit && (
          <>
            <Button variant="danger" onClick={remove}>{t('common.delete')}</Button>
            <Button onClick={() => setEditing(true)}>{t('common.edit')}</Button>
            <Button variant="primary" onClick={() => setCommitment('new')} disabled={committed.size >= funds.length}>{t('fund.commitments.new')}</Button>
          </>
        )}
      >
        <div className="stack">
          <dl className="fa-facts">
            <div><dt>{t('fund.investors.type')}</dt><dd>{t(`fund.investorType.${investor.investor_type}`)}</dd></div>
            <div><dt>{t('fund.investors.contact')}</dt><dd>{investor.contact_name ?? '—'}</dd></div>
            <div><dt>{t('common.email')}</dt><dd>{investor.email ? <a href={`mailto:${investor.email}`}>{investor.email}</a> : '—'}</dd></div>
            <div><dt>{t('fund.investors.phone')}</dt><dd>{investor.phone ?? '—'}</dd></div>
          </dl>
          {investor.notes && <p className="fa-notes">{investor.notes}</p>}
          <h3 className="fa-h3">{t('fund.tabs.commitments')}</h3>
          {investor.commitments.length === 0 ? <p className="muted">{t('fund.investors.noCommitments')}</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('fund.common.fund')}</th><th>{t('fund.commitments.date')}</th><th className="num">{t('fund.commitments.amount')}</th>
                    {canEdit && <th className="num">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {investor.commitments.map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/fund/funds/${c.fund_id}`} className="fa-strong">{c.fund_name}</Link></td>
                      <td>{formatDate(c.commitment_date)}</td>
                      <td className="num">{formatMoney(c.amount, currency)}</td>
                      {canEdit && (
                        <td className="num">
                          <div className="fa-actions">
                            <Button size="sm" variant="ghost" onClick={() => setCommitment(c)}>{t('common.edit')}</Button>
                            <Button size="sm" variant="ghost" onClick={() => removeCommitment(c)}>{t('common.remove')}</Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
      <InvestorFormModal open={editing} investor={investor} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />
      <CommitmentFormModal
        open={Boolean(commitment)}
        commitment={commitment === 'new' ? null : commitment}
        investorId={investor.id}
        funds={funds.filter((f) => !committed.has(f.id))}
        onClose={() => setCommitment(null)}
        onSaved={() => { setCommitment(null); onChanged(); }}
      />
    </>
  );
}
