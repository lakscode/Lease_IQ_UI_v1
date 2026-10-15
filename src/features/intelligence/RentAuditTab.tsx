// Rent audit for one lease: rent schedule, system billing check and a month-by-month audit saved by month range.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { del, get, patch, post } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Spinner, StatTile } from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { type RentPeriod } from './shared.tsx';
import { errorText, numStr, parseNum } from './helpers.ts';

interface Check { key: 'current_rent' | 'next_step_date' | 'next_step_rent'; lease: number | string | null; system: number | string | null; result: 'match' | 'mismatch' | 'check' }
interface AuditRow { month: string; lease_rent: number | null; billed_rent: number | null; difference: number | null; abated: boolean; billed_override: boolean }
interface Totals { lease: number; billed: number; under: number; over: number; net: number; months: number; unresolved: number }
interface SavedAudit { id: string; start_month: string; end_month: string; totals: Totals; created_at: string }

interface Overview {
  as_of: string;
  schedule: RentPeriod[];
  schedule_source: 'insights' | 'terms' | 'none';
  current_month_rent: number | null;
  next_step: { date: string; monthly_rent: number | null } | null;
  system: { record: Record<string, unknown>; import: { source: string; file_name: string | null; created_at: string } | null; monthly_base_rent: number | null } | null;
  checks: Check[];
  audits: SavedAudit[];
}

const RESULT_TONE = { match: 'success', mismatch: 'danger', check: 'warning' } as const;

function monthInput(iso: string) {
  return iso.slice(0, 7);
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

interface EditRow { start: string; end: string; monthly: string; abatement: string; note: string }

function ScheduleEditor({ open, schedule, onClose, onSave }: { open: boolean; schedule: RentPeriod[]; onClose: () => void; onSave: (rows: RentPeriod[]) => Promise<void> }) {
  const t = useT();
  const [rows, setRows] = useState<EditRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setError(null);
      setRows(schedule.map((p) => ({
        start: p.start, end: p.end ?? '', monthly: numStr(p.monthly_rent),
        abatement: p.abatement ? numStr(p.abatement_pct ?? 100) : '', note: p.note ?? '',
      })));
    }
  }, [open, schedule]);
  const set = (i: number, k: keyof EditRow, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = async () => {
    const out: RentPeriod[] = [];
    for (const r of rows) {
      if (!r.start) return setError(t('intel.rent.editStartRequired'));
      const monthly = parseNum(r.monthly);
      const pct = parseNum(r.abatement);
      out.push({
        start: r.start, end: r.end || null, monthly_rent: monthly, annual_rent: monthly === null ? null : monthly * 12, rent_psf: null,
        abatement: pct !== null && pct > 0, abatement_pct: pct !== null && pct > 0 ? Math.min(100, pct) : null, note: r.note || null,
      });
    }
    setSaving(true);
    try {
      await onSave(out);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} wide title={t('intel.rent.editSchedule')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={saving} onClick={() => void save()}>{t('common.save')}</Button></>}>
      <p className="muted small" style={{ marginTop: 0 }}>{t('intel.rent.editHint')}</p>
      <div className="table-wrap">
        <table className="table intel-sched-table">
          <thead><tr><th>{t('intel.rent.start')}</th><th>{t('intel.rent.end')}</th><th className="num">{t('intel.rent.monthly')}</th><th className="num">{t('intel.rent.abatementPct')}</th><th>{t('common.notes')}</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><Input type="date" value={r.start} aria-label={t('intel.rent.start')} onChange={(e) => set(i, 'start', e.target.value)} /></td>
                <td><Input type="date" value={r.end} aria-label={t('intel.rent.end')} onChange={(e) => set(i, 'end', e.target.value)} /></td>
                <td><Input inputMode="decimal" className="num" value={r.monthly} aria-label={t('intel.rent.monthly')} onChange={(e) => set(i, 'monthly', e.target.value)} /></td>
                <td><Input inputMode="decimal" className="num" value={r.abatement} placeholder="0" aria-label={t('intel.rent.abatementPct')} onChange={(e) => set(i, 'abatement', e.target.value)} /></td>
                <td><Input value={r.note} aria-label={t('common.notes')} onChange={(e) => set(i, 'note', e.target.value)} /></td>
                <td><button type="button" className="icon-btn" aria-label={t('common.remove')} onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <Button size="sm" onClick={() => {
          const last = rows[rows.length - 1];
          setRows([...rows, { start: last?.end ? new Date(Date.parse(last.end) + 86_400_000).toISOString().slice(0, 10) : '', end: '', monthly: last?.monthly ?? '', abatement: '', note: '' }]);
        }}>{t('intel.rent.addPeriod')}</Button>
      </div>
      {error && <div className="field-error" role="alert" style={{ marginTop: 8 }}>{error}</div>}
    </Modal>
  );
}

export default function RentAuditTab({ leaseId }: { leaseId: string }) {
  const t = useT();
  const { canEdit, currency } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const overview = useAsync((signal) => get<Overview>(`/leases/${leaseId}/rent-audit`, undefined, signal), [leaseId]);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [range, setRange] = useState({ start: shiftMonth(thisMonth, -11), end: thisMonth });
  const [billed, setBilled] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ rows: AuditRow[]; totals: Totals } | null>(null);
  const [savedView, setSavedView] = useState<SavedAudit | null>(null);
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = (v: number | null | undefined) => formatMoney(v, currency, 2);

  const compute = async (overrides = billed, r = range) => {
    setComputing(true);
    setError(null);
    try {
      const body = { start_month: r.start, end_month: r.end, billed: Object.fromEntries(Object.entries(overrides).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, parseNum(v)])) };
      const res = await post<{ rows: AuditRow[]; totals: Totals }>(`/leases/${leaseId}/rent-audit/compute`, body);
      setResult(res);
      setSavedView(null);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setComputing(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { start_month: range.start, end_month: range.end, billed: Object.fromEntries(Object.entries(billed).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, parseNum(v)])) };
      const saved = await post<SavedAudit & { rows: AuditRow[] }>(`/leases/${leaseId}/rent-audit`, body);
      setResult({ rows: saved.rows, totals: saved.totals });
      toast(t('intel.rent.saved'));
      overview.reload();
    } catch (err) {
      toast(errorText(t, err), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const openSaved = async (a: SavedAudit) => {
    try {
      const full = await get<SavedAudit & { rows: AuditRow[] }>(`/leases/${leaseId}/rent-audit/${a.id}`);
      const r = { start: monthInput(full.start_month), end: monthInput(full.end_month) };
      setRange(r);
      setBilled(Object.fromEntries(full.rows.filter((x) => x.billed_override).map((x) => [x.month.slice(0, 7), numStr(x.billed_rent)])));
      setResult({ rows: full.rows, totals: full.totals });
      setSavedView(full);
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const removeSaved = async (a: SavedAudit) => {
    if (!(await confirm({ title: t('intel.rent.deleteTitle'), message: t('intel.rent.deleteBody', { from: monthInput(a.start_month), to: monthInput(a.end_month) }), confirmLabel: t('common.delete'), danger: true }))) return;
    try {
      await del(`/leases/${leaseId}/rent-audit/${a.id}`);
      if (savedView?.id === a.id) setSavedView(null);
      overview.reload();
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const saveSchedule = async (rows: RentPeriod[]) => {
    await patch(`/leases/${leaseId}/insights`, { rent_schedule: rows });
    setEditOpen(false);
    overview.reload();
    setResult(null);
  };

  if (overview.loading && !overview.data) return <Spinner />;
  if (overview.error) return <ErrorState error={overview.error} onRetry={overview.reload} />;
  const o = overview.data as Overview;

  const checkValue = (c: Check, v: number | string | null) => (v === null ? '—' : c.key === 'next_step_date' ? formatDate(String(v)) : money(Number(v)));

  return (
    <div className="intel-stack">
      <Card
        title={t('intel.rent.schedule')}
        actions={canEdit && <Button size="sm" onClick={() => setEditOpen(true)}>{t('intel.rent.editSchedule')}</Button>}
      >
        <p className="muted small" style={{ marginTop: 0 }}>{t(`intel.rent.source.${o.schedule_source}`)}</p>
        {!o.schedule.length ? <EmptyState icon="📅" title={t('intel.rent.noSchedule')}>{t('intel.rent.noScheduleBody')}</EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>{t('intel.rent.period')}</th><th className="num">{t('intel.rent.monthly')}</th><th className="num">{t('intel.rent.annual')}</th><th className="num">{t('intel.rent.psf')}</th><th>{t('intel.rent.abatement')}</th><th>{t('common.notes')}</th></tr>
              </thead>
              <tbody>
                {o.schedule.map((p, i) => (
                  <tr key={i}>
                    <td>{formatDate(p.start)} – {p.end ? formatDate(p.end) : t('intel.rent.openEnded')}</td>
                    <td className="num">{money(p.monthly_rent)}</td>
                    <td className="num">{money(p.annual_rent)}</td>
                    <td className="num">{p.rent_psf === null ? '—' : formatNumber(p.rent_psf, 2)}</td>
                    <td>{p.abatement ? <Badge tone="warning">{t('intel.rent.abated', { pct: formatNumber(p.abatement_pct ?? 100) })}</Badge> : <span className="muted">—</span>}</td>
                    <td className="small">{p.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t('intel.rent.billingCheck')}>
        {!o.system && <Alert tone="info">{t('intel.rent.noSystem')} <Link to="/import">{t('intel.rent.importLink')}</Link></Alert>}
        {o.system?.import && <p className="muted small" style={{ marginTop: 0 }}>{t('intel.rent.systemFrom', { source: o.system.import.source.toUpperCase(), file: o.system.import.file_name ?? '—', date: formatDateTime(o.system.import.created_at) })}</p>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('intel.rent.check')}</th><th className="num">{t('intel.rent.leaseValue')}</th><th className="num">{t('intel.rent.systemValue')}</th><th>{t('common.status')}</th></tr></thead>
            <tbody>
              {o.checks.map((c) => (
                <tr key={c.key}>
                  <td>{t(`intel.rent.checks.${c.key}`)}</td>
                  <td className="num">{checkValue(c, c.lease)}</td>
                  <td className="num">{checkValue(c, c.system)}</td>
                  <td><Badge tone={RESULT_TONE[c.result]}>{t(`intel.rent.result.${c.result}`)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('intel.rent.audit')}>
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); void compute(); }}>
          <Field label={t('intel.rent.fromMonth')}><Input type="month" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} required /></Field>
          <Field label={t('intel.rent.toMonth')}><Input type="month" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} required /></Field>
          <Button type="submit" variant="primary" loading={computing}>{t('intel.rent.run')}</Button>
          {result && canEdit && <Button loading={saving} onClick={() => void save()}>{t('intel.rent.save')}</Button>}
        </form>
        <p className="muted small">{t('intel.rent.billedHint', { amount: o.system?.monthly_base_rent != null ? money(o.system.monthly_base_rent) : '—' })}</p>
        {error && <Alert tone="danger">{error}</Alert>}
        {savedView && <Alert tone="info">{t('intel.rent.viewingSaved', { date: formatDateTime(savedView.created_at) })}</Alert>}
        {result && (
          <div className="intel-stack" style={{ marginTop: 12 }}>
            <div className="tiles">
              <StatTile label={t('intel.rent.totalLease')} value={money(result.totals.lease)} />
              <StatTile label={t('intel.rent.totalBilled')} value={money(result.totals.billed)} />
              <StatTile label={t('intel.rent.under')} value={money(result.totals.under)} tone={result.totals.under > 0 ? 'warning' : 'neutral'} />
              <StatTile label={t('intel.rent.over')} value={money(result.totals.over)} tone={result.totals.over > 0 ? 'warning' : 'neutral'} />
              <StatTile
                label={t('intel.rent.net')}
                value={money(Math.abs(result.totals.net))}
                hint={result.totals.net > 0 ? t('intel.rent.netTenantOwes') : result.totals.net < 0 ? t('intel.rent.netOwedToTenant') : t('intel.rent.netSettled')}
                tone={result.totals.net === 0 ? 'success' : 'danger'}
              />
            </div>
            {result.totals.unresolved > 0 && <Alert tone="warning">{t('intel.rent.unresolved', { n: result.totals.unresolved })}</Alert>}
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('intel.rent.month')}</th><th className="num">{t('intel.rent.leaseRent')}</th><th className="num">{t('intel.rent.billedRent')}</th><th className="num">{t('intel.rent.difference')}</th></tr></thead>
                <tbody>
                  {result.rows.map((r) => {
                    const key = r.month.slice(0, 7);
                    return (
                      <tr key={r.month}>
                        <td>{key} {r.abated && <Badge tone="warning">{t('intel.rent.abatementShort')}</Badge>}</td>
                        <td className="num">{money(r.lease_rent)}</td>
                        <td className="num">
                          <Input
                            className="intel-inline-input"
                            inputMode="decimal"
                            aria-label={t('intel.rent.billedFor', { month: key })}
                            placeholder={r.billed_rent === null ? '—' : String(r.billed_rent)}
                            value={billed[key] ?? (r.billed_override ? numStr(r.billed_rent) : '')}
                            onChange={(e) => setBilled({ ...billed, [key]: e.target.value })}
                            onBlur={() => void compute()}
                          />
                        </td>
                        <td className={`num ${r.difference && r.difference < 0 ? 'intel-neg' : r.difference && r.difference > 0 ? 'intel-warn' : ''}`}>
                          {r.difference === null ? '—' : money(r.difference)}
                          {r.difference !== null && r.difference !== 0 && <div className="cell-sub">{r.difference < 0 ? t('intel.rent.underShort') : t('intel.rent.overShort')}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <Card title={t('intel.rent.savedAudits')} padded={false}>
        {!o.audits.length ? <p className="card-body muted small">{t('intel.rent.noSaved')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('intel.rent.range')}</th><th className="num">{t('intel.rent.net')}</th><th>{t('intel.rent.savedAt')}</th><th className="num">{t('common.actions')}</th></tr></thead>
              <tbody>
                {o.audits.map((a) => (
                  <tr key={a.id}>
                    <td>{monthInput(a.start_month)} – {monthInput(a.end_month)}</td>
                    <td className="num">{money(a.totals?.net)}</td>
                    <td>{formatDateTime(a.created_at)}</td>
                    <td className="num">
                      <Button size="sm" variant="ghost" onClick={() => void openSaved(a)}>{t('intel.rent.open')}</Button>
                      {canEdit && <Button size="sm" variant="ghost" onClick={() => void removeSaved(a)}>{t('common.delete')}</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canEdit && <ScheduleEditor open={editOpen} schedule={o.schedule} onClose={() => setEditOpen(false)} onSave={saveSchedule} />}
    </div>
  );
}
