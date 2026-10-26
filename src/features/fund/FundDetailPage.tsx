// Fund Administration → a fund: key figures, investors' capital accounts, commitments, activity (capital calls,
// distributions, NAV) and the properties (leases) it holds.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { del, get, getBlob, post, saveBlob } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import {
  Button, Card, EmptyState, ErrorState, Field, LeaseStatusBadge, Modal, PageHeader, Select, Spinner, StatTile, Tabs,
} from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatMoney, formatNumber, formatPercent } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { formatMultiple } from './labels.ts';
import {
  CallStatusBadge, CapitalCallFormModal, CapitalCallModal, CommitmentFormModal, DistributionFormModal, DistributionModal,
  FundFormModal, FundStatusBadge, ValuationFormModal,
} from './shared.tsx';
import type { Commitment, FundDetail, Investor } from './types.ts';
import './fund.css';

type Tab = 'accounts' | 'commitments' | 'activity' | 'properties';
type Dialog = 'edit' | 'commitment' | 'call' | 'distribution' | 'nav' | 'lease' | null;

export default function FundDetailPage() {
  const t = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit, currency } = useAuth();
  const { fundId = '' } = useParams();
  const detail = useAsync((signal) => get<FundDetail>(`/fund/funds/${fundId}`, undefined, signal), [fundId]);
  const [tab, setTab] = useState<Tab>('accounts');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editing, setEditing] = useState<Commitment | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [distributionId, setDistributionId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const data = detail.data;
  const money = (v: number | null) => (v === null ? '—' : formatMoney(v, currency));
  const pctText = (v: number | null) => (v === null ? '—' : formatPercent(v / 100, 2));
  const close = () => { setDialog(null); setEditing(null); };
  const saved = () => { close(); detail.reload(); };

  const act = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      toast(message);
      detail.reload();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  if (detail.loading && !data) return <div className="page"><Spinner /></div>;
  if (detail.error || !data) {
    return (
      <div className="page">
        <PageHeader title={t('nav.fund.funds')} back={<Link to="/fund/funds">← {t('nav.fund.funds')}</Link>} />
        <ErrorState error={detail.error ?? t('fund.funds.notFound')} onRetry={detail.reload} />
      </div>
    );
  }

  const { fund, metrics } = data;

  const deleteFund = async () => {
    const ok = await confirm({ title: t('fund.funds.deleteTitle'), message: t('fund.funds.deleteMessage', { name: fund.name }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await del(`/fund/funds/${fund.id}`);
      toast(t('fund.funds.deleted'));
      navigate('/fund/funds');
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await getBlob(`/fund/funds/${fund.id}/capital-accounts.csv`);
      saveBlob(blob, filename ?? 'capital-accounts.csv');
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setExporting(false);
    }
  };

  const fundList = [{ id: fund.id, name: fund.name }];

  return (
    <div className="page">
      <PageHeader
        back={<Link to="/fund/funds">← {t('nav.fund.funds')}</Link>}
        title={<span className="fa-title">{fund.name} <FundStatusBadge status={fund.status} /></span>}
        subtitle={[fund.strategy, fund.vintage_year && t('fund.funds.vintageN', { year: fund.vintage_year })].filter(Boolean).join(' · ') || undefined}
        actions={canEdit && (
          <>
            <Button variant="ghost" onClick={deleteFund}>{t('common.delete')}</Button>
            <Button onClick={() => setDialog('edit')}>{t('common.edit')}</Button>
            <Button onClick={() => setDialog('nav')}>{t('fund.nav.new')}</Button>
            <Button onClick={() => setDialog('distribution')}>{t('fund.distributions.new')}</Button>
            <Button variant="primary" onClick={() => setDialog('call')}>{t('fund.calls.new')}</Button>
          </>
        )}
      />

      <div className="tiles">
        <StatTile label={t('fund.metrics.commitments')} value={money(metrics.commitments)}
          hint={fund.target_size ? t('fund.funds.ofTarget', { pct: formatPercent(metrics.commitments / fund.target_size, 0) }) : undefined} />
        <StatTile label={t('fund.metrics.paidIn')} value={money(metrics.paid_in)}
          hint={metrics.called_pct === null ? undefined : t('fund.funds.calledHint', { pct: formatPercent(metrics.called_pct / 100, 1) })} />
        <StatTile label={t('fund.metrics.uncalled')} value={money(metrics.uncalled)} />
        <StatTile label={t('fund.metrics.distributed')} value={money(metrics.distributed)} hint={`${t('fund.metrics.dpi')} ${formatMultiple(metrics.dpi)}`} />
        <StatTile label={t('fund.metrics.nav')} value={money(metrics.nav)} hint={metrics.nav_date ? t('fund.nav.asOfDate', { date: formatDate(metrics.nav_date) }) : t('fund.nav.none')} />
        <StatTile label={t('fund.metrics.tvpi')} value={formatMultiple(metrics.tvpi)} hint={`${t('fund.metrics.rvpi')} ${formatMultiple(metrics.rvpi)}`} tone="primary" />
        {metrics.receivable > 0 && <StatTile label={t('fund.metrics.receivable')} value={money(metrics.receivable)} tone="warning" />}
      </div>

      <Card title={t('fund.funds.terms')}>
        <dl className="fa-facts">
          <div><dt>{t('fund.funds.inception')}</dt><dd>{formatDate(fund.inception_date)}</dd></div>
          <div><dt>{t('fund.funds.targetSize')}</dt><dd>{money(fund.target_size)}</dd></div>
          <div><dt>{t('fund.funds.mgmtFee')}</dt><dd>{pctText(fund.management_fee_pct)}</dd></div>
          <div><dt>{t('fund.funds.carry')}</dt><dd>{pctText(fund.carry_pct)}</dd></div>
          <div><dt>{t('fund.funds.hurdle')}</dt><dd>{pctText(fund.hurdle_pct)}</dd></div>
        </dl>
        {fund.notes && <p className="fa-notes">{fund.notes}</p>}
      </Card>

      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        items={[
          { key: 'accounts', label: t('fund.tabs.accounts'), count: data.accounts.length },
          { key: 'commitments', label: t('fund.tabs.commitments'), count: data.commitments.length },
          { key: 'activity', label: t('fund.tabs.activity'), count: data.calls.length + data.distributions.length + data.valuations.length },
          { key: 'properties', label: t('fund.tabs.properties'), count: data.leases.length },
        ]}
      />

      {tab === 'accounts' && (
        <Card padded={false} title={t('fund.tabs.accounts')} actions={data.accounts.length > 0 && <Button size="sm" onClick={exportCsv} loading={exporting}>{t('common.exportCsv')}</Button>}>
          {data.accounts.length === 0 ? (
            <EmptyState icon="♟" title={t('fund.accounts.emptyTitle')}>{t('fund.accounts.emptyBody')}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('fund.common.investor')}</th>
                    <th className="num">{t('fund.metrics.commitments')}</th>
                    <th className="num">{t('fund.accounts.ownership')}</th>
                    <th className="num">{t('fund.metrics.called')}</th>
                    <th className="num">{t('fund.metrics.paidIn')}</th>
                    <th className="num">{t('fund.metrics.uncalled')}</th>
                    <th className="num">{t('fund.metrics.distributed')}</th>
                    <th className="num">{t('fund.accounts.navShare')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((a) => (
                    <tr key={a.investor_id}>
                      <td><div className="fa-strong">{a.investor_name}</div><div className="fa-sub">{t(`fund.investorType.${a.investor_type}`)}</div></td>
                      <td className="num">{money(a.commitment)}</td>
                      <td className="num">{formatPercent(a.ownership_pct / 100, 2)}</td>
                      <td className="num">{money(a.called)}</td>
                      <td className="num">
                        {money(a.paid_in)}
                        {a.receivable > 0 && <div className="fa-sub fa-warn">{t('fund.accounts.due', { amount: money(a.receivable) })}</div>}
                      </td>
                      <td className="num">{money(a.uncalled)}</td>
                      <td className="num">{money(a.distributed)}</td>
                      <td className="num">{money(a.nav_share)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="fa-total">
                    <td>{t('fund.common.total')}</td>
                    <td className="num">{money(metrics.commitments)}</td>
                    <td className="num">{formatPercent(1, 0)}</td>
                    <td className="num">{money(metrics.called)}</td>
                    <td className="num">{money(metrics.paid_in)}</td>
                    <td className="num">{money(metrics.uncalled)}</td>
                    <td className="num">{money(metrics.distributed)}</td>
                    <td className="num">{money(metrics.nav)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="muted fa-pad fa-footnote">{t('fund.accounts.footnote')}</p>
        </Card>
      )}

      {tab === 'commitments' && (
        <Card padded={false} title={t('fund.tabs.commitments')} actions={canEdit && <Button size="sm" variant="primary" onClick={() => setDialog('commitment')}>{t('fund.commitments.new')}</Button>}>
          {data.commitments.length === 0 ? (
            <EmptyState icon="♟" title={t('fund.commitments.emptyTitle')}>{t('fund.commitments.emptyBody')}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('fund.common.investor')}</th>
                    <th>{t('fund.commitments.date')}</th>
                    <th className="num">{t('fund.commitments.amount')}</th>
                    {canEdit && <th className="num">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.commitments.map((c) => (
                    <tr key={c.id}>
                      <td className="fa-strong">{c.investor_name}</td>
                      <td>{formatDate(c.commitment_date)}</td>
                      <td className="num">{money(c.amount)}</td>
                      {canEdit && (
                        <td className="num">
                          <div className="fa-actions">
                            <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setDialog('commitment'); }}>{t('common.edit')}</Button>
                            <Button size="sm" variant="ghost" onClick={async () => {
                              const ok = await confirm({ title: t('fund.commitments.removeTitle'), message: t('fund.commitments.removeMessage', { name: c.investor_name }), confirmLabel: t('common.remove'), danger: true });
                              if (ok) await act(() => del(`/fund/commitments/${c.id}`), t('fund.commitments.removed'));
                            }}>{t('common.remove')}</Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'activity' && (
        <div className="stack fa-stack">
          <Card padded={false} title={t('nav.fund.capitalCalls')}>
            {data.calls.length === 0 ? <p className="muted fa-pad">{t('fund.calls.none')}</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th><th>{t('fund.calls.callDate')}</th><th>{t('fund.calls.dueDate')}</th><th>{t('fund.calls.purpose')}</th>
                      <th className="num">{t('fund.calls.amount')}</th><th className="num">{t('fund.calls.paid')}</th><th>{t('fund.common.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.calls.map((c) => (
                      <tr key={c.id} className="clickable" onClick={() => setCallId(c.id)}>
                        <td>{c.call_number}</td><td>{formatDate(c.call_date)}</td><td>{formatDate(c.due_date)}</td>
                        <td>{t(`fund.purpose.${c.purpose}`)}</td>
                        <td className="num">{money(c.amount)}</td><td className="num">{money(c.paid)}</td>
                        <td><CallStatusBadge status={c.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card padded={false} title={t('nav.fund.distributions')}>
            {data.distributions.length === 0 ? <p className="muted fa-pad">{t('fund.distributions.none')}</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>#</th><th>{t('fund.distributions.date')}</th><th>{t('fund.distributions.type')}</th><th className="num">{t('fund.distributions.amount')}</th></tr></thead>
                  <tbody>
                    {data.distributions.map((d) => (
                      <tr key={d.id} className="clickable" onClick={() => setDistributionId(d.id)}>
                        <td>{d.distribution_number}</td><td>{formatDate(d.distribution_date)}</td>
                        <td>{t(`fund.distType.${d.distribution_type}`)}</td><td className="num">{money(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card padded={false} title={t('fund.nav.history')}>
            {data.valuations.length === 0 ? <p className="muted fa-pad">{t('fund.nav.none')}</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('fund.nav.asOf')}</th><th className="num">{t('fund.nav.value')}</th><th>{t('fund.common.notes')}</th>{canEdit && <th className="num">{t('common.actions')}</th>}</tr></thead>
                  <tbody>
                    {data.valuations.map((v) => (
                      <tr key={v.id}>
                        <td>{formatDate(v.as_of_date)}</td><td className="num">{money(v.nav)}</td><td className="fa-sub">{v.notes ?? ''}</td>
                        {canEdit && (
                          <td className="num">
                            <Button size="sm" variant="ghost" onClick={async () => {
                              const ok = await confirm({ title: t('fund.nav.deleteTitle'), message: t('fund.nav.deleteMessage', { date: formatDate(v.as_of_date) }), confirmLabel: t('common.delete'), danger: true });
                              if (ok) await act(() => del(`/fund/valuations/${v.id}`), t('fund.nav.deleted'));
                            }}>{t('common.delete')}</Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'properties' && (
        <Card padded={false} title={t('fund.tabs.properties')} actions={canEdit && <Button size="sm" variant="primary" onClick={() => setDialog('lease')}>{t('fund.properties.add')}</Button>}>
          {data.leases.length === 0 ? (
            <EmptyState icon="▤" title={t('fund.properties.emptyTitle')}>{t('fund.properties.emptyBody')}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('fund.properties.tenant')}</th>
                    <th>{t('fund.properties.address')}</th>
                    <th className="num">{t('fund.properties.area')}</th>
                    <th className="num">{t('fund.properties.annualRent')}</th>
                    <th>{t('fund.properties.expires')}</th>
                    <th>{t('fund.common.status')}</th>
                    {canEdit && <th className="num">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.leases.map((l) => (
                    <tr key={l.id} className="clickable" onClick={() => navigate(`/leases/${l.id}`)}>
                      <td className="fa-strong">{l.tenant_name ?? '—'}</td>
                      <td>{l.premises_address ?? '—'}</td>
                      <td className="num">{formatNumber(l.rentable_area)}</td>
                      <td className="num">{l.base_rent_monthly === null ? '—' : money(l.base_rent_monthly * 12)}</td>
                      <td>{formatDate(l.expiration_date)}</td>
                      <td><LeaseStatusBadge status={l.status} /></td>
                      {canEdit && (
                        <td className="num" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => act(() => del(`/fund/funds/${fund.id}/leases/${l.id}`), t('fund.properties.removed'))}>
                            {t('common.remove')}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="fa-total">
                    <td colSpan={2}>{t('fund.common.total')}</td>
                    <td className="num">{formatNumber(data.leases.reduce((s, l) => s + (l.rentable_area ?? 0), 0))}</td>
                    <td className="num">{money(data.leases.reduce((s, l) => s + (l.base_rent_monthly ?? 0) * 12, 0))}</td>
                    <td colSpan={canEdit ? 3 : 2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}

      <FundFormModal open={dialog === 'edit'} fund={fund} onClose={close} onSaved={saved} />
      <CommitmentDialog open={dialog === 'commitment'} fundId={fund.id} commitment={editing} taken={data.commitments.map((c) => c.investor_id)} onClose={close} onSaved={saved} />
      <CapitalCallFormModal open={dialog === 'call'} fundId={fund.id} funds={fundList} onClose={close} onSaved={(id) => { saved(); setCallId(id); }} />
      <DistributionFormModal open={dialog === 'distribution'} fundId={fund.id} funds={fundList} onClose={close} onSaved={(id) => { saved(); setDistributionId(id); }} />
      <ValuationFormModal open={dialog === 'nav'} fundId={fund.id} funds={fundList} onClose={close} onSaved={saved} />
      <AddLeaseDialog open={dialog === 'lease'} fundId={fund.id} held={data.leases.map((l) => l.id)} onClose={close} onSaved={saved} />
      <CapitalCallModal callId={callId} onClose={() => setCallId(null)} onChanged={detail.reload} />
      <DistributionModal distributionId={distributionId} onClose={() => setDistributionId(null)} onChanged={detail.reload} />
    </div>
  );
}

/** Commitment form with the org's investors (those not yet in this fund) loaded when it opens. */
function CommitmentDialog({ open, fundId, commitment, taken, onClose, onSaved }: {
  open: boolean; fundId: string; commitment: Commitment | null; taken: string[]; onClose: () => void; onSaved: () => void;
}) {
  const investors = useAsync((signal) => (open && !commitment ? get<Investor[]>('/fund/investors', undefined, signal) : Promise.resolve([])), [open, commitment]);
  const available = (investors.data ?? []).filter((i) => !taken.includes(i.id));
  return <CommitmentFormModal open={open} commitment={commitment} fundId={fundId} investors={available} onClose={onClose} onSaved={onSaved} />;
}

interface LeaseOption { id: string; tenant_name: string | null; premises_address: string | null }

function AddLeaseDialog({ open, fundId, held, onClose, onSaved }: { open: boolean; fundId: string; held: string[]; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const leases = useAsync((signal) => (open ? get<LeaseOption[]>('/leases', undefined, signal) : Promise.resolve([])), [open]);
  const [leaseId, setLeaseId] = useState('');
  const [saving, setSaving] = useState(false);
  const options = (leases.data ?? []).filter((l) => !held.includes(l.id));

  const save = async () => {
    setSaving(true);
    try {
      await post(`/fund/funds/${fundId}/leases`, { lease_id: leaseId });
      toast(t('fund.properties.added'));
      setLeaseId('');
      onSaved();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('fund.properties.add')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={!leaseId} loading={saving}>{t('common.add')}</Button>
        </>
      }
    >
      {leases.loading ? <Spinner /> : leases.error ? <ErrorState error={leases.error} onRetry={leases.reload} /> : (
        <div className="form">
          <p className="muted">{t('fund.properties.addHint')}</p>
          <Field label={t('fund.properties.lease')}>
            <Select value={leaseId} onChange={(e) => setLeaseId(e.target.value)}>
              <option value="">{options.length ? t('fund.common.choose') : t('fund.properties.noLeases')}</option>
              {options.map((l) => (
                <option key={l.id} value={l.id}>{[l.tenant_name ?? '—', l.premises_address].filter(Boolean).join(' — ')}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </Modal>
  );
}
