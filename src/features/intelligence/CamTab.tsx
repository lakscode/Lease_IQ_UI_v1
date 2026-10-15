// CAM reconciliation for one lease: inputs and settings → server-side calculation; one saved reconciliation per year.
import { useEffect, useRef, useState } from 'react';
import { del, get, post, put } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Alert, Button, Card, ErrorState, Field, Input, Select, Spinner, StatTile } from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDateTime, formatMoney } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { type CamTerms } from './shared.tsx';
import { errorText, numStr, parseNum } from './helpers.ts';

interface CamResult {
  recoverable: number; gross_up_adjustment: number; grossed_up_pool: number; cap_applied: boolean; cap_subject: number | null;
  cap_limit: number | null; cap_excess: number; capped_pool: number; base_year_deduction: number; chargeable_pool: number;
  tenant_share: number; tenant_gross_up: number; tenant_cap_adjustment: number; admin_fee: number; total_due: number;
  estimates_paid: number; balance: number; balance_direction: 'due_from_tenant' | 'due_to_tenant' | 'settled'; warnings: string[];
}

interface Overview {
  cam_terms: CamTerms | null;
  reconciliations: { id: string; year: number; updated_at: string; total_due: number | null; balance: number | null; balance_direction: string | null }[];
}

const INPUT_KEYS = ['total_expenses', 'excluded_expenses', 'variable_expenses', 'controllable_expenses', 'occupancy_pct', 'base_year_expenses', 'base_year_controllable', 'prior_year_capped', 'estimates_paid'] as const;
const PCT_INPUTS = new Set(['occupancy_pct']);

type Inputs = Record<(typeof INPUT_KEYS)[number], string>;
interface Settings {
  pro_rata_share: string; admin_fee_pct: string; gross_up_pct: string; cap_pct: string; base_year: string;
  cap_cumulative: boolean; cap_controllable_only: boolean; recovery: 'net' | 'base_year';
}

const EMPTY_INPUTS = Object.fromEntries(INPUT_KEYS.map((k) => [k, ''])) as Inputs;

function settingsFromTerms(terms: CamTerms | null): Settings {
  return {
    pro_rata_share: numStr(terms?.pro_rata_share),
    admin_fee_pct: numStr(terms?.admin_fee_pct),
    gross_up_pct: numStr(terms?.gross_up_pct),
    cap_pct: numStr(terms?.cap_pct),
    base_year: numStr(terms?.base_year),
    cap_cumulative: Boolean(terms?.cap_cumulative),
    cap_controllable_only: Boolean(terms?.cap_controllable_only),
    recovery: terms?.base_year ? 'base_year' : 'net',
  };
}


export default function CamTab({ leaseId }: { leaseId: string }) {
  const t = useT();
  const { canEdit, currency } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const overview = useAsync((signal) => get<Overview>(`/leases/${leaseId}/cam`, undefined, signal), [leaseId]);
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [inputs, setInputs] = useState<Inputs>(EMPTY_INPUTS);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [result, setResult] = useState<CamResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const seq = useRef(0);
  const money = (v: number | null | undefined) => formatMoney(v, currency, 2);

  // Prefill settings from the extracted CAM terms once loaded.
  useEffect(() => {
    if (overview.data && !settings) setSettings(settingsFromTerms(overview.data.cam_terms));
  }, [overview.data, settings]);

  const body = () => ({
    year: Number(year),
    inputs: Object.fromEntries(INPUT_KEYS.map((k) => [k, parseNum(inputs[k])])),
    settings: settings && {
      pro_rata_share: parseNum(settings.pro_rata_share), admin_fee_pct: parseNum(settings.admin_fee_pct),
      gross_up_pct: parseNum(settings.gross_up_pct), cap_pct: parseNum(settings.cap_pct), base_year: parseNum(settings.base_year),
      cap_cumulative: settings.cap_cumulative, cap_controllable_only: settings.cap_controllable_only, recovery: settings.recovery,
    },
  });

  // Live calculation (debounced).
  useEffect(() => {
    if (!settings) return;
    const id = ++seq.current;
    const timer = window.setTimeout(() => {
      post<{ result: CamResult }>(`/leases/${leaseId}/cam/compute`, body())
        .then((r) => { if (id === seq.current) { setResult(r.result); setCalcError(null); } })
        .catch((err) => { if (id === seq.current) setCalcError(errorText(t, err)); });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, settings, year, leaseId]);

  const openYear = async (y: number) => {
    try {
      const rec = await get<{ year: number; inputs: Record<string, number | null>; settings: Record<string, unknown>; updated_at: string }>(`/leases/${leaseId}/cam/${y}`);
      setYear(String(rec.year));
      setInputs(Object.fromEntries(INPUT_KEYS.map((k) => [k, numStr(rec.inputs[k] as number | null)])) as Inputs);
      const s = rec.settings;
      setSettings({
        pro_rata_share: numStr(s.pro_rata_share as number), admin_fee_pct: numStr(s.admin_fee_pct as number),
        gross_up_pct: numStr(s.gross_up_pct as number | null), cap_pct: numStr(s.cap_pct as number | null), base_year: numStr(s.base_year as number | null),
        cap_cumulative: Boolean(s.cap_cumulative), cap_controllable_only: Boolean(s.cap_controllable_only), recovery: s.recovery === 'base_year' ? 'base_year' : 'net',
      });
      setSavedAt(rec.updated_at);
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const save = async () => {
    const y = Number(year);
    if (!Number.isInteger(y)) return toast(t('intel.cam.badYear'), 'danger');
    setSaving(true);
    try {
      const rec = await put<{ result: CamResult; updated_at: string }>(`/leases/${leaseId}/cam/${y}`, body());
      setResult(rec.result);
      setSavedAt(rec.updated_at);
      toast(t('intel.cam.saved', { year: y }));
      overview.reload();
    } catch (err) {
      toast(errorText(t, err), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (y: number) => {
    if (!(await confirm({ title: t('intel.cam.deleteTitle'), message: t('intel.cam.deleteBody', { year: y }), confirmLabel: t('common.delete'), danger: true }))) return;
    try {
      await del(`/leases/${leaseId}/cam/${y}`);
      overview.reload();
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const reset = () => {
    setInputs(EMPTY_INPUTS);
    setSettings(settingsFromTerms(overview.data?.cam_terms ?? null));
    setSavedAt(null);
  };

  if (overview.loading && !overview.data) return <Spinner />;
  if (overview.error) return <ErrorState error={overview.error} onRetry={overview.reload} />;
  const o = overview.data as Overview;
  if (!settings) return <Spinner />;
  const set = (k: keyof Settings, v: string | boolean) => setSettings({ ...settings, [k]: v } as Settings);

  const line = (label: string, value: number | null | undefined, strong = false) => (
    <tr><td>{strong ? <strong>{label}</strong> : label}</td><td className="num">{strong ? <strong>{money(value)}</strong> : money(value)}</td></tr>
  );

  return (
    <div className="intel-stack">
      {o.cam_terms
        ? <Alert tone="info">{t('intel.cam.prefilled')}{o.cam_terms.notes ? ` ${o.cam_terms.notes}` : ''}</Alert>
        : <p className="muted small" style={{ margin: 0 }}>{t('intel.cam.noTerms')}</p>}

      <div className="grid-2">
        <Card title={t('intel.cam.inputs')} actions={<Button size="sm" variant="ghost" onClick={reset}>{t('intel.cam.reset')}</Button>}>
          <div className="form-grid">
            <Field label={t('intel.cam.year')}><Input type="number" min={1950} max={2200} value={year} onChange={(e) => setYear(e.target.value)} /></Field>
            <div />
            {INPUT_KEYS.map((k) => (
              <Field key={k} label={t(`intel.cam.in.${k}`)} hint={t(`intel.cam.inHint.${k}`)}>
                <Input inputMode="decimal" className="num" value={inputs[k]} placeholder={PCT_INPUTS.has(k) ? '%' : currency}
                  onChange={(e) => setInputs({ ...inputs, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        </Card>

        <Card title={t('intel.cam.settings')}>
          <div className="form-grid">
            <Field label={t('intel.cam.set.pro_rata_share')}><Input inputMode="decimal" className="num" placeholder="%" value={settings.pro_rata_share} onChange={(e) => set('pro_rata_share', e.target.value)} /></Field>
            <Field label={t('intel.cam.set.admin_fee_pct')}><Input inputMode="decimal" className="num" placeholder="%" value={settings.admin_fee_pct} onChange={(e) => set('admin_fee_pct', e.target.value)} /></Field>
            <Field label={t('intel.cam.set.gross_up_pct')} hint={t('intel.cam.set.gross_up_hint')}><Input inputMode="decimal" className="num" placeholder="%" value={settings.gross_up_pct} onChange={(e) => set('gross_up_pct', e.target.value)} /></Field>
            <Field label={t('intel.cam.set.cap_pct')}><Input inputMode="decimal" className="num" placeholder="%" value={settings.cap_pct} onChange={(e) => set('cap_pct', e.target.value)} /></Field>
            <Field label={t('intel.cam.set.recovery')}>
              <Select value={settings.recovery} onChange={(e) => set('recovery', e.target.value)}>
                <option value="net">{t('intel.cam.set.recoveryNet')}</option>
                <option value="base_year">{t('intel.cam.set.recoveryBaseYear')}</option>
              </Select>
            </Field>
            <Field label={t('intel.cam.set.base_year')}><Input type="number" value={settings.base_year} onChange={(e) => set('base_year', e.target.value)} /></Field>
            <label className="checkbox field-full"><input type="checkbox" checked={settings.cap_cumulative} onChange={(e) => set('cap_cumulative', e.target.checked)} /> {t('intel.cam.set.cap_cumulative')}</label>
            <label className="checkbox field-full"><input type="checkbox" checked={settings.cap_controllable_only} onChange={(e) => set('cap_controllable_only', e.target.checked)} /> {t('intel.cam.set.cap_controllable_only')}</label>
          </div>
          <details className="intel-details" style={{ marginTop: 12 }}>
            <summary>{t('intel.cam.howCalculated')}</summary>
            <pre className="intel-formula">{t('intel.cam.formula')}</pre>
          </details>
        </Card>
      </div>

      <Card title={t('intel.cam.result', { year })} actions={canEdit && <Button variant="primary" loading={saving} onClick={() => void save()}>{t('intel.cam.save', { year })}</Button>}>
        {savedAt && <p className="muted small" style={{ marginTop: 0 }}>{t('intel.cam.savedAt', { date: formatDateTime(savedAt) })}</p>}
        {calcError && <Alert tone="danger">{calcError}</Alert>}
        {!result ? <Spinner /> : (
          <div className="intel-stack">
            <div className="tiles">
              <StatTile label={t('intel.cam.r.tenant_share')} value={money(result.tenant_share)} />
              <StatTile label={t('intel.cam.r.admin_fee')} value={money(result.admin_fee)} />
              <StatTile label={t('intel.cam.r.total_due')} value={money(result.total_due)} />
              <StatTile
                label={t('intel.cam.r.balance')}
                value={money(Math.abs(result.balance))}
                hint={t(`intel.cam.dir.${result.balance_direction}`)}
                tone={result.balance_direction === 'settled' ? 'success' : 'warning'}
              />
            </div>
            {result.warnings.map((w) => <Alert key={w} tone="warning">{t(`intel.cam.warn.${w}`)}</Alert>)}
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {line(t('intel.cam.r.recoverable'), result.recoverable)}
                  {line(t('intel.cam.r.gross_up_adjustment'), result.gross_up_adjustment)}
                  {line(t('intel.cam.r.grossed_up_pool'), result.grossed_up_pool)}
                  {result.cap_applied && line(t('intel.cam.r.cap_subject'), result.cap_subject)}
                  {result.cap_applied && line(t('intel.cam.r.cap_limit'), result.cap_limit)}
                  {line(t('intel.cam.r.cap_excess'), result.cap_excess)}
                  {line(t('intel.cam.r.capped_pool'), result.capped_pool)}
                  {line(t('intel.cam.r.base_year_deduction'), result.base_year_deduction)}
                  {line(t('intel.cam.r.chargeable_pool'), result.chargeable_pool, true)}
                  {line(t('intel.cam.r.tenant_share'), result.tenant_share)}
                  {line(t('intel.cam.r.tenant_gross_up'), result.tenant_gross_up)}
                  {line(t('intel.cam.r.tenant_cap_adjustment'), result.tenant_cap_adjustment)}
                  {line(t('intel.cam.r.admin_fee'), result.admin_fee)}
                  {line(t('intel.cam.r.total_due'), result.total_due, true)}
                  {line(t('intel.cam.r.estimates_paid'), result.estimates_paid)}
                  {line(t(`intel.cam.dir.${result.balance_direction}`), Math.abs(result.balance), true)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <Card title={t('intel.cam.savedYears')} padded={false}>
        {!o.reconciliations.length ? <p className="card-body muted small">{t('intel.cam.noSaved')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('intel.cam.year')}</th><th className="num">{t('intel.cam.r.total_due')}</th><th className="num">{t('intel.cam.r.balance')}</th><th>{t('intel.rent.savedAt')}</th><th className="num">{t('common.actions')}</th></tr></thead>
              <tbody>
                {o.reconciliations.map((r) => (
                  <tr key={r.id}>
                    <td>{r.year}</td>
                    <td className="num">{money(r.total_due)}</td>
                    <td className="num">{money(r.balance === null ? null : Math.abs(r.balance))}{r.balance_direction && <div className="cell-sub">{t(`intel.cam.dir.${r.balance_direction}`)}</div>}</td>
                    <td>{formatDateTime(r.updated_at)}</td>
                    <td className="num">
                      <Button size="sm" variant="ghost" onClick={() => void openYear(r.year)}>{t('intel.rent.open')}</Button>
                      {canEdit && <Button size="sm" variant="ghost" onClick={() => void remove(r.year)}>{t('common.delete')}</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
