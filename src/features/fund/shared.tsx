// Fund administration components shared by the pages: create/edit dialogs, call and distribution details, badges.
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { del, get, patch, post } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Alert, Badge, Button, ErrorState, Field, Input, Modal, Select, Spinner, Textarea } from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatMoney, todayIso } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { CALL_STATUS_TONE, FUND_STATUS_TONE, numOrNull, numText } from './labels.ts';
import {
  CALL_PURPOSES, DISTRIBUTION_TYPES, FUND_STATUSES, INVESTOR_TYPES,
  type CallStatus, type CapitalCallDetail, type Commitment, type DistributionDetail, type Fund, type FundStatus,
  type Investor, type InvestorType,
} from './types.ts';

export function CallStatusBadge({ status }: { status: CallStatus }) {
  const t = useT();
  return <Badge tone={CALL_STATUS_TONE[status]}>{t(`fund.callStatus.${status}`)}</Badge>;
}

export function FundStatusBadge({ status }: { status: FundStatus }) {
  const t = useT();
  return <Badge tone={FUND_STATUS_TONE[status]}>{t(`fund.status.${status}`)}</Badge>;
}

/** Fund filter for list pages ('' = all funds). */
export function FundFilter({ funds, value, onChange }: { funds: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  const t = useT();
  return (
    <label className="fa-filter">
      <span className="sr-only">{t('fund.common.fund')}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('fund.common.allFunds')}</option>
        {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </Select>
    </label>
  );
}

/** Modal with a form: submit button, error alert and saving state. `onSubmit` throws to show an error. */
function FormModal({ open, title, onClose, onSubmit, submitLabel, children, wide }: {
  open: boolean; title: ReactNode; onClose: () => void; onSubmit: () => Promise<void>; submitLabel?: string; children: ReactNode; wide?: boolean;
}) {
  const t = useT();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) setError(null); }, [open]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const formId = useId();
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      wide={wide}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" form={formId} loading={saving}>{submitLabel ?? t('common.save')}</Button>
        </>
      }
    >
      <form id={formId} className="form" onSubmit={submit}>
        {error && <Alert tone="danger">{error}</Alert>}
        {children}
      </form>
    </Modal>
  );
}

// ---- Fund ------------------------------------------------------------------------------------

export function FundFormModal({ open, fund, onClose, onSaved }: { open: boolean; fund?: Fund | null; onClose: () => void; onSaved: (fund: Fund) => void }) {
  const t = useT();
  const toast = useToast();
  const [form, setForm] = useState(() => fundForm(fund));
  useEffect(() => { if (open) setForm(fundForm(fund)); }, [open, fund]);
  const set = (key: keyof ReturnType<typeof fundForm>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    const body = {
      name: form.name, strategy: form.strategy, status: form.status, inception_date: form.inception_date || null,
      vintage_year: numOrNull(form.vintage_year), target_size: numOrNull(form.target_size),
      management_fee_pct: numOrNull(form.management_fee_pct), carry_pct: numOrNull(form.carry_pct), hurdle_pct: numOrNull(form.hurdle_pct),
      notes: form.notes,
    };
    const saved = fund ? await patch<Fund>(`/fund/funds/${fund.id}`, body) : await post<Fund>('/fund/funds', body);
    toast(t(fund ? 'fund.funds.updated' : 'fund.funds.created'));
    onSaved(saved);
  };

  return (
    <FormModal open={open} title={t(fund ? 'fund.funds.edit' : 'fund.funds.new')} onClose={onClose} onSubmit={save} wide>
      <div className="form-grid">
        <Field label={t('fund.funds.name')} full><Input value={form.name} onChange={set('name')} required maxLength={200} autoFocus /></Field>
        <Field label={t('fund.funds.strategy')} hint={t('fund.funds.strategyHint')}><Input value={form.strategy} onChange={set('strategy')} maxLength={100} /></Field>
        <Field label={t('fund.funds.status')}>
          <Select value={form.status} onChange={set('status')}>
            {FUND_STATUSES.map((s) => <option key={s} value={s}>{t(`fund.status.${s}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('fund.funds.vintage')}><Input type="number" min={1900} max={2200} step={1} value={form.vintage_year} onChange={set('vintage_year')} /></Field>
        <Field label={t('fund.funds.inception')}><Input type="date" value={form.inception_date} onChange={set('inception_date')} /></Field>
        <Field label={t('fund.funds.targetSize')}><Input type="number" min={0} step="0.01" value={form.target_size} onChange={set('target_size')} /></Field>
        <Field label={t('fund.funds.mgmtFee')}><Input type="number" min={0} max={100} step="0.001" value={form.management_fee_pct} onChange={set('management_fee_pct')} /></Field>
        <Field label={t('fund.funds.carry')}><Input type="number" min={0} max={100} step="0.001" value={form.carry_pct} onChange={set('carry_pct')} /></Field>
        <Field label={t('fund.funds.hurdle')}><Input type="number" min={0} max={100} step="0.001" value={form.hurdle_pct} onChange={set('hurdle_pct')} /></Field>
        <Field label={t('fund.common.notes')} full><Textarea rows={3} value={form.notes} onChange={set('notes')} maxLength={5000} /></Field>
      </div>
    </FormModal>
  );
}

function fundForm(fund?: Fund | null) {
  return {
    name: fund?.name ?? '', strategy: fund?.strategy ?? '', status: (fund?.status ?? 'active') as string,
    vintage_year: numText(fund?.vintage_year), inception_date: fund?.inception_date ?? '', target_size: numText(fund?.target_size),
    management_fee_pct: numText(fund?.management_fee_pct), carry_pct: numText(fund?.carry_pct), hurdle_pct: numText(fund?.hurdle_pct),
    notes: fund?.notes ?? '',
  };
}

// ---- Investor --------------------------------------------------------------------------------

export function InvestorFormModal({ open, investor, onClose, onSaved }: {
  open: boolean; investor?: Investor | null; onClose: () => void; onSaved: (investor: Investor) => void;
}) {
  const t = useT();
  const toast = useToast();
  const blank = () => ({
    name: investor?.name ?? '', investor_type: (investor?.investor_type ?? 'institution') as InvestorType,
    contact_name: investor?.contact_name ?? '', email: investor?.email ?? '', phone: investor?.phone ?? '', notes: investor?.notes ?? '',
  });
  const [form, setForm] = useState(blank);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setForm(blank()); }, [open, investor]);
  const set = (key: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    const saved = investor ? await patch<Investor>(`/fund/investors/${investor.id}`, form) : await post<Investor>('/fund/investors', form);
    toast(t(investor ? 'fund.investors.updated' : 'fund.investors.created'));
    onSaved(saved);
  };

  return (
    <FormModal open={open} title={t(investor ? 'fund.investors.edit' : 'fund.investors.new')} onClose={onClose} onSubmit={save}>
      <div className="form-grid">
        <Field label={t('fund.investors.name')} full><Input value={form.name} onChange={set('name')} required maxLength={200} autoFocus /></Field>
        <Field label={t('fund.investors.type')}>
          <Select value={form.investor_type} onChange={set('investor_type')}>
            {INVESTOR_TYPES.map((x) => <option key={x} value={x}>{t(`fund.investorType.${x}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('fund.investors.contact')}><Input value={form.contact_name} onChange={set('contact_name')} maxLength={200} /></Field>
        <Field label={t('common.email')}><Input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label={t('fund.investors.phone')}><Input type="tel" value={form.phone} onChange={set('phone')} maxLength={50} /></Field>
        <Field label={t('fund.common.notes')} full><Textarea rows={3} value={form.notes} onChange={set('notes')} maxLength={5000} /></Field>
      </div>
    </FormModal>
  );
}

// ---- Commitment ------------------------------------------------------------------------------

/** New commitment (pick fund and/or investor unless fixed) or edit of an existing one's amount and date. */
export function CommitmentFormModal({ open, commitment, fundId, investorId, funds, investors, onClose, onSaved }: {
  open: boolean; commitment?: Commitment | null; fundId?: string; investorId?: string;
  funds?: { id: string; name: string }[]; investors?: { id: string; name: string }[];
  onClose: () => void; onSaved: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const blank = () => ({
    fund_id: commitment?.fund_id ?? fundId ?? '', investor_id: commitment?.investor_id ?? investorId ?? '',
    amount: numText(commitment?.amount), commitment_date: commitment?.commitment_date ?? todayIso(),
  });
  const [form, setForm] = useState(blank);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setForm(blank()); }, [open, commitment, fundId, investorId]);
  const set = (key: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    const amount = Number(form.amount);
    if (commitment) await patch(`/fund/commitments/${commitment.id}`, { amount, commitment_date: form.commitment_date || null });
    else await post('/fund/commitments', { ...form, amount, commitment_date: form.commitment_date || null });
    toast(t('fund.commitments.saved'));
    onSaved();
  };

  return (
    <FormModal open={open} title={t(commitment ? 'fund.commitments.edit' : 'fund.commitments.new')} onClose={onClose} onSubmit={save}>
      <div className="form-grid">
        {!commitment && !fundId && (
          <Field label={t('fund.common.fund')} full>
            <Select value={form.fund_id} onChange={set('fund_id')} required>
              <option value="">{t('fund.common.choose')}</option>
              {(funds ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
        )}
        {!commitment && !investorId && (
          <Field label={t('fund.common.investor')} full>
            <Select value={form.investor_id} onChange={set('investor_id')} required>
              <option value="">{t('fund.common.choose')}</option>
              {(investors ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('fund.commitments.amount')}><Input type="number" min={0.01} step="0.01" value={form.amount} onChange={set('amount')} required autoFocus /></Field>
        <Field label={t('fund.commitments.date')}><Input type="date" value={form.commitment_date} onChange={set('commitment_date')} /></Field>
      </div>
    </FormModal>
  );
}

// ---- Capital call / distribution / NAV ---------------------------------------------------------

export function CapitalCallFormModal({ open, fundId, funds, onClose, onSaved }: {
  open: boolean; fundId?: string; funds: { id: string; name: string }[]; onClose: () => void; onSaved: (id: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const blank = () => ({ fund_id: fundId ?? '', call_date: todayIso(), due_date: '', amount: '', purpose: 'investment', notes: '' });
  const [form, setForm] = useState(blank);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setForm(blank()); }, [open, fundId]);
  const set = (key: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    const call = await post<{ id: string }>('/fund/capital-calls', { ...form, amount: Number(form.amount), due_date: form.due_date || null });
    toast(t('fund.calls.created'));
    onSaved(call.id);
  };

  return (
    <FormModal open={open} title={t('fund.calls.new')} onClose={onClose} onSubmit={save} submitLabel={t('fund.calls.issue')}>
      <p className="muted">{t('fund.calls.proRataHint')}</p>
      <div className="form-grid">
        <Field label={t('fund.common.fund')} full>
          <Select value={form.fund_id} onChange={set('fund_id')} required disabled={Boolean(fundId)}>
            <option value="">{t('fund.common.choose')}</option>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
        <Field label={t('fund.calls.amount')}><Input type="number" min={0.01} step="0.01" value={form.amount} onChange={set('amount')} required /></Field>
        <Field label={t('fund.calls.purpose')}>
          <Select value={form.purpose} onChange={set('purpose')}>
            {CALL_PURPOSES.map((p) => <option key={p} value={p}>{t(`fund.purpose.${p}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('fund.calls.callDate')}><Input type="date" value={form.call_date} onChange={set('call_date')} required /></Field>
        <Field label={t('fund.calls.dueDate')}><Input type="date" value={form.due_date} min={form.call_date} onChange={set('due_date')} /></Field>
        <Field label={t('fund.common.notes')} full><Textarea rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} /></Field>
      </div>
    </FormModal>
  );
}

export function DistributionFormModal({ open, fundId, funds, onClose, onSaved }: {
  open: boolean; fundId?: string; funds: { id: string; name: string }[]; onClose: () => void; onSaved: (id: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const blank = () => ({ fund_id: fundId ?? '', distribution_date: todayIso(), amount: '', distribution_type: 'income', notes: '' });
  const [form, setForm] = useState(blank);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setForm(blank()); }, [open, fundId]);
  const set = (key: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    const dist = await post<{ id: string }>('/fund/distributions', { ...form, amount: Number(form.amount) });
    toast(t('fund.distributions.created'));
    onSaved(dist.id);
  };

  return (
    <FormModal open={open} title={t('fund.distributions.new')} onClose={onClose} onSubmit={save} submitLabel={t('fund.distributions.record')}>
      <p className="muted">{t('fund.distributions.proRataHint')}</p>
      <div className="form-grid">
        <Field label={t('fund.common.fund')} full>
          <Select value={form.fund_id} onChange={set('fund_id')} required disabled={Boolean(fundId)}>
            <option value="">{t('fund.common.choose')}</option>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
        <Field label={t('fund.distributions.amount')}><Input type="number" min={0.01} step="0.01" value={form.amount} onChange={set('amount')} required /></Field>
        <Field label={t('fund.distributions.type')}>
          <Select value={form.distribution_type} onChange={set('distribution_type')}>
            {DISTRIBUTION_TYPES.map((d) => <option key={d} value={d}>{t(`fund.distType.${d}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('fund.distributions.date')}><Input type="date" value={form.distribution_date} onChange={set('distribution_date')} required /></Field>
        <Field label={t('fund.common.notes')} full><Textarea rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} /></Field>
      </div>
    </FormModal>
  );
}

export function ValuationFormModal({ open, fundId, funds, onClose, onSaved }: {
  open: boolean; fundId?: string; funds: { id: string; name: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const blank = () => ({ fund_id: fundId ?? '', as_of_date: todayIso(), nav: '', notes: '' });
  const [form, setForm] = useState(blank);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setForm(blank()); }, [open, fundId]);
  const set = (key: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    await post('/fund/valuations', { ...form, nav: Number(form.nav) });
    toast(t('fund.nav.saved'));
    onSaved();
  };

  return (
    <FormModal open={open} title={t('fund.nav.new')} onClose={onClose} onSubmit={save}>
      <p className="muted">{t('fund.nav.replaceHint')}</p>
      <div className="form-grid">
        <Field label={t('fund.common.fund')} full>
          <Select value={form.fund_id} onChange={set('fund_id')} required disabled={Boolean(fundId)}>
            <option value="">{t('fund.common.choose')}</option>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
        <Field label={t('fund.nav.asOf')}><Input type="date" value={form.as_of_date} onChange={set('as_of_date')} required /></Field>
        <Field label={t('fund.nav.value')}><Input type="number" min={0} step="0.01" value={form.nav} onChange={set('nav')} required autoFocus /></Field>
        <Field label={t('fund.common.notes')} full><Textarea rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} /></Field>
      </div>
    </FormModal>
  );
}

// ---- Details ---------------------------------------------------------------------------------

/** A capital call's per-investor allocations; editors record payments here. */
export function CapitalCallModal({ callId, onClose, onChanged }: { callId: string | null; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit, currency } = useAuth();
  const detail = useAsync((signal) => (callId ? get<CapitalCallDetail>(`/fund/capital-calls/${callId}`, undefined, signal) : Promise.resolve(null)), [callId]);
  const [busy, setBusy] = useState<string | null>(null);
  const call = detail.data;

  const run = async (key: string, action: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await action();
      toast(message);
      detail.reload();
      onChanged();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!call) return;
    const ok = await confirm({ title: t('fund.calls.deleteTitle'), message: t('fund.calls.deleteMessage', { n: call.call_number }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    await run('delete', () => del(`/fund/capital-calls/${call.id}`), t('fund.calls.deleted'));
    onClose();
  };

  return (
    <Modal
      open={Boolean(callId)}
      wide
      title={call ? t('fund.calls.title', { n: call.call_number, fund: call.fund_name }) : t('fund.calls.callTitle')}
      onClose={onClose}
      footer={call && canEdit && (
        <>
          <Button variant="danger" onClick={remove} loading={busy === 'delete'}>{t('common.delete')}</Button>
          {call.status !== 'paid' && (
            <Button variant="primary" loading={busy === 'all'}
              onClick={() => run('all', () => post(`/fund/capital-calls/${call.id}/mark-paid`, { paid_date: todayIso() }), t('fund.calls.allPaid'))}>
              {t('fund.calls.markAllPaid')}
            </Button>
          )}
        </>
      )}
    >
      {detail.loading && !call ? <Spinner /> : detail.error ? <ErrorState error={detail.error} onRetry={detail.reload} /> : call && (
        <div className="stack">
          <dl className="fa-facts">
            <div><dt>{t('fund.calls.amount')}</dt><dd>{formatMoney(call.amount, currency, 2)}</dd></div>
            <div><dt>{t('fund.calls.paid')}</dt><dd>{formatMoney(call.paid, currency, 2)}</dd></div>
            <div><dt>{t('fund.calls.callDate')}</dt><dd>{formatDate(call.call_date)}</dd></div>
            <div><dt>{t('fund.calls.dueDate')}</dt><dd>{formatDate(call.due_date)}</dd></div>
            <div><dt>{t('fund.calls.purpose')}</dt><dd>{t(`fund.purpose.${call.purpose}`)}</dd></div>
            <div><dt>{t('fund.common.status')}</dt><dd><CallStatusBadge status={call.status} /></dd></div>
          </dl>
          {call.notes && <p className="fa-notes">{call.notes}</p>}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('fund.common.investor')}</th>
                  <th className="num">{t('fund.calls.called')}</th>
                  <th className="num">{t('fund.calls.paid')}</th>
                  <th className="num">{t('fund.calls.outstanding')}</th>
                  <th>{t('fund.calls.paidDate')}</th>
                  {canEdit && <th className="num">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {call.allocations.map((a) => (
                  <tr key={a.id}>
                    <td className="fa-strong">{a.investor_name}</td>
                    <td className="num">{formatMoney(a.amount, currency, 2)}</td>
                    <td className="num">{formatMoney(a.paid_amount, currency, 2)}</td>
                    <td className="num">{a.outstanding > 0 ? formatMoney(a.outstanding, currency, 2) : '—'}</td>
                    <td>{formatDate(a.paid_date)}</td>
                    {canEdit && (
                      <td className="num">
                        {a.outstanding > 0 ? (
                          <Button size="sm" loading={busy === a.id}
                            onClick={() => run(a.id, () => patch(`/fund/capital-calls/${call.id}/allocations/${a.id}`, { paid_amount: a.amount, paid_date: todayIso() }), t('fund.calls.paymentRecorded'))}>
                            {t('fund.calls.markPaid')}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" loading={busy === a.id}
                            onClick={() => run(a.id, () => patch(`/fund/capital-calls/${call.id}/allocations/${a.id}`, { paid_amount: 0 }), t('fund.calls.paymentCleared'))}>
                            {t('fund.calls.markUnpaid')}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function DistributionModal({ distributionId, onClose, onChanged }: { distributionId: string | null; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit, currency } = useAuth();
  const detail = useAsync(
    (signal) => (distributionId ? get<DistributionDetail>(`/fund/distributions/${distributionId}`, undefined, signal) : Promise.resolve(null)),
    [distributionId],
  );
  const [deleting, setDeleting] = useState(false);
  const dist = detail.data;

  const remove = async () => {
    if (!dist) return;
    const ok = await confirm({ title: t('fund.distributions.deleteTitle'), message: t('fund.distributions.deleteMessage', { n: dist.distribution_number }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    setDeleting(true);
    try {
      await del(`/fund/distributions/${dist.id}`);
      toast(t('fund.distributions.deleted'));
      onChanged();
      onClose();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open={Boolean(distributionId)}
      title={dist ? t('fund.distributions.title', { n: dist.distribution_number, fund: dist.fund_name }) : t('fund.distributions.distTitle')}
      onClose={onClose}
      footer={dist && canEdit && <Button variant="danger" onClick={remove} loading={deleting}>{t('common.delete')}</Button>}
    >
      {detail.loading && !dist ? <Spinner /> : detail.error ? <ErrorState error={detail.error} onRetry={detail.reload} /> : dist && (
        <div className="stack">
          <dl className="fa-facts">
            <div><dt>{t('fund.distributions.amount')}</dt><dd>{formatMoney(dist.amount, currency, 2)}</dd></div>
            <div><dt>{t('fund.distributions.date')}</dt><dd>{formatDate(dist.distribution_date)}</dd></div>
            <div><dt>{t('fund.distributions.type')}</dt><dd>{t(`fund.distType.${dist.distribution_type}`)}</dd></div>
          </dl>
          {dist.notes && <p className="fa-notes">{dist.notes}</p>}
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('fund.common.investor')}</th><th className="num">{t('fund.distributions.amount')}</th></tr></thead>
              <tbody>
                {dist.allocations.map((a) => (
                  <tr key={a.id}><td className="fa-strong">{a.investor_name}</td><td className="num">{formatMoney(a.amount, currency, 2)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
