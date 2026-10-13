// Market Rent Engine (embedded on the Portfolio page): market rates per property type and in-place vs market analysis.
import { useState } from 'react';
import { Link } from 'react-router';
import { del, get, patch, post } from '../../api/client.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Spinner, StatTile, useConfirm, useToast,
} from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatMoney, formatNumber, formatPercent } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { errorText, numStr, parseNum } from './shared.tsx';
import './intelligence.css';

interface MarketRate { id: string; property_type: string; rate_psf_annual: number; source: string | null; as_of: string | null; address_match: string | null }

interface AnalysisRow {
  lease_id: string; tenant_name: string | null; premises_address: string | null; property_type: string | null; status: string;
  expiration_date: string | null; rentable_area: number | null; annual_base_rent: number | null; in_place_psf: number | null;
  market_psf: number | null; market_source: 'override' | 'assigned' | 'address' | 'type_default' | 'none';
  market_rate_id: string | null; market_rate_override: number | null; mark_to_market_pct: number | null;
  mark_to_market_annual: number | null; position: 'below' | 'at' | 'above' | null; ending_within_24m: boolean; renewal_upside: number | null;
}

interface Analysis {
  as_of: string;
  rows: AnalysisRow[];
  property_types: string[];
  summary: {
    leases: number; compared: number; below: number; at: number; above: number; mark_to_market_annual: number;
    renewal_upside: number; renewal_leases: number; avg_in_place_psf: number | null; avg_market_psf: number | null;
  };
}

const POSITION_TONE = { below: 'warning', at: 'success', above: 'info' } as const;

const emptyRate = { property_type: '', rate_psf_annual: '', source: '', as_of: '', address_match: '' };

export default function MarketRentEngine() {
  const t = useT();
  const { canEdit, currency } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const rates = useAsync((signal) => get<MarketRate[]>('/market-rates', undefined, signal), []);
  const analysis = useAsync((signal) => get<Analysis>('/market-rates/analysis', undefined, signal), []);
  const [rateForm, setRateForm] = useState<(typeof emptyRate & { id?: string }) | null>(null);
  const [leaseForm, setLeaseForm] = useState<{ row: AnalysisRow; property_type: string; market_rate_id: string; override: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'below' | 'at' | 'above' | 'renewal'>('all');

  const psf = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatMoney(v, currency, 2));
  const reloadAll = () => { rates.reload(); analysis.reload(); };

  const saveRate = async () => {
    if (!rateForm) return;
    const rate = parseNum(rateForm.rate_psf_annual);
    if (!rateForm.property_type.trim() || rate === null) return setFormError(t('intel.mkt.rateRequired'));
    setSaving(true);
    setFormError(null);
    const body = { property_type: rateForm.property_type.trim(), rate_psf_annual: rate, source: rateForm.source || null, as_of: rateForm.as_of || null, address_match: rateForm.address_match || null };
    try {
      if (rateForm.id) await patch(`/market-rates/${rateForm.id}`, body);
      else await post('/market-rates', body);
      setRateForm(null);
      reloadAll();
    } catch (err) {
      setFormError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  };

  const removeRate = async (r: MarketRate) => {
    if (!(await confirm({ title: t('intel.mkt.deleteTitle'), message: t('intel.mkt.deleteBody', { type: r.property_type }), confirmLabel: t('common.delete'), danger: true }))) return;
    try {
      await del(`/market-rates/${r.id}`);
      reloadAll();
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const saveLease = async () => {
    if (!leaseForm) return;
    const override = leaseForm.override.trim() === '' ? null : parseNum(leaseForm.override);
    if (leaseForm.override.trim() !== '' && override === null) return setFormError(t('intel.mkt.overrideInvalid'));
    setSaving(true);
    setFormError(null);
    try {
      await patch(`/leases/${leaseForm.row.lease_id}/market`, {
        property_type: leaseForm.property_type.trim() || null,
        market_rate_id: leaseForm.market_rate_id || null,
        market_rate_override: override,
      });
      setLeaseForm(null);
      analysis.reload();
    } catch (err) {
      setFormError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  };

  const a = analysis.data;
  const rows = (a?.rows ?? []).filter((r) => (filter === 'all' ? true : filter === 'renewal' ? r.ending_within_24m : r.position === filter));

  return (
    <div className="intel-stack">
      {analysis.error ? <ErrorState error={analysis.error} onRetry={analysis.reload} /> : !a ? <Spinner /> : (
        <div className="tiles">
          <StatTile label={t('intel.mkt.below')} value={a.summary.below} tone={a.summary.below ? 'warning' : 'neutral'} onClick={() => setFilter(filter === 'below' ? 'all' : 'below')} hint={t('intel.mkt.bandHint')} />
          <StatTile label={t('intel.mkt.at')} value={a.summary.at} tone="success" onClick={() => setFilter(filter === 'at' ? 'all' : 'at')} />
          <StatTile label={t('intel.mkt.above')} value={a.summary.above} onClick={() => setFilter(filter === 'above' ? 'all' : 'above')} />
          <StatTile label={t('intel.mkt.mtmTotal')} value={formatMoney(a.summary.mark_to_market_annual, currency)} hint={t('intel.mkt.mtmHint')} />
          <StatTile label={t('intel.mkt.upside')} value={formatMoney(a.summary.renewal_upside, currency)} hint={t('intel.mkt.upsideHint', { n: a.summary.renewal_leases })} tone="success" onClick={() => setFilter(filter === 'renewal' ? 'all' : 'renewal')} />
          <StatTile label={t('intel.mkt.avgPsf')} value={`${psf(a.summary.avg_in_place_psf)} / ${psf(a.summary.avg_market_psf)}`} hint={t('intel.mkt.avgPsfHint')} />
        </div>
      )}

      <Card
        title={t('intel.mkt.rates')}
        actions={canEdit && <Button size="sm" variant="primary" onClick={() => { setFormError(null); setRateForm({ ...emptyRate }); }}>{t('intel.mkt.addRate')}</Button>}
        padded={false}
      >
        {rates.loading && !rates.data ? <div className="card-body"><Spinner /></div>
          : rates.error ? <div className="card-body"><ErrorState error={rates.error} onRetry={rates.reload} /></div>
            : !rates.data?.length ? <EmptyState icon="🏷️" title={t('intel.mkt.noRates')}>{t('intel.mkt.noRatesBody')}</EmptyState>
              : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t('intel.mkt.propertyType')}</th><th>{t('intel.mkt.addressMatch')}</th><th className="num">{t('intel.mkt.rate')}</th><th>{t('intel.mkt.source')}</th><th>{t('intel.mkt.asOf')}</th>{canEdit && <th className="num">{t('common.actions')}</th>}</tr></thead>
                    <tbody>
                      {rates.data.map((r) => (
                        <tr key={r.id}>
                          <td>{r.property_type}</td>
                          <td>{r.address_match ?? <span className="muted">{t('intel.mkt.typeDefault')}</span>}</td>
                          <td className="num">{psf(r.rate_psf_annual)}</td>
                          <td>{r.source ?? '—'}</td>
                          <td>{formatDate(r.as_of)}</td>
                          {canEdit && (
                            <td className="num">
                              <Button size="sm" variant="ghost" onClick={() => { setFormError(null); setRateForm({ id: r.id, property_type: r.property_type, rate_psf_annual: numStr(r.rate_psf_annual), source: r.source ?? '', as_of: r.as_of ?? '', address_match: r.address_match ?? '' }); }}>{t('common.edit')}</Button>
                              <Button size="sm" variant="ghost" onClick={() => void removeRate(r)}>{t('common.delete')}</Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
      </Card>

      <Card
        title={t('intel.mkt.analysis')}
        padded={false}
        actions={
          <Select value={filter} aria-label={t('intel.mkt.filter')} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">{t('intel.mkt.filterAll')}</option>
            <option value="below">{t('intel.mkt.below')}</option>
            <option value="at">{t('intel.mkt.at')}</option>
            <option value="above">{t('intel.mkt.above')}</option>
            <option value="renewal">{t('intel.mkt.filterRenewal')}</option>
          </Select>
        }
      >
        {!a ? <div className="card-body"><Spinner /></div> : !rows.length ? <p className="card-body muted small">{t('common.noResults')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('intel.mkt.tenant')}</th>
                  <th>{t('intel.mkt.propertyType')}</th>
                  <th className="num">{t('intel.mkt.inPlace')}</th>
                  <th className="num">{t('intel.mkt.market')}</th>
                  <th className="num">{t('intel.mkt.mtm')}</th>
                  <th className="num">{t('intel.mkt.mtmAnnual')}</th>
                  <th>{t('intel.mkt.expires')}</th>
                  <th className="num">{t('intel.mkt.upsideCol')}</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lease_id}>
                    <td>
                      <Link className="cell-title" to={`/leases/${r.lease_id}`}>{r.tenant_name ?? t('intel.mkt.unknownTenant')}</Link>
                      <div className="cell-sub">{r.premises_address ?? ''}{r.rentable_area ? ` · ${formatNumber(r.rentable_area)} ${t('intel.mkt.sqft')}` : ''}</div>
                    </td>
                    <td>{r.property_type ?? <span className="muted">—</span>}</td>
                    <td className="num">{psf(r.in_place_psf)}</td>
                    <td className="num">
                      {psf(r.market_psf)}
                      <div className="cell-sub">{t(`intel.mkt.src.${r.market_source}`)}</div>
                    </td>
                    <td className="num">
                      {r.mark_to_market_pct === null ? '—' : formatPercent(r.mark_to_market_pct, 1)}
                      {r.position && <div><Badge tone={POSITION_TONE[r.position]}>{t(`intel.mkt.${r.position}`)}</Badge></div>}
                    </td>
                    <td className={`num ${r.mark_to_market_annual && r.mark_to_market_annual > 0 ? 'intel-pos' : ''}`}>{r.mark_to_market_annual === null ? '—' : formatMoney(r.mark_to_market_annual, currency)}</td>
                    <td>{formatDate(r.expiration_date)}</td>
                    <td className="num">{r.ending_within_24m ? (r.renewal_upside === null ? '—' : formatMoney(r.renewal_upside, currency)) : <span className="muted">—</span>}</td>
                    {canEdit && (
                      <td className="num">
                        <Button size="sm" variant="ghost" onClick={() => { setFormError(null); setLeaseForm({ row: r, property_type: r.property_type ?? '', market_rate_id: r.market_rate_id ?? '', override: numStr(r.market_rate_override) }); }}>{t('intel.mkt.assign')}</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(rateForm)}
        title={rateForm?.id ? t('intel.mkt.editRate') : t('intel.mkt.addRate')}
        onClose={() => setRateForm(null)}
        footer={<><Button onClick={() => setRateForm(null)}>{t('common.cancel')}</Button><Button variant="primary" loading={saving} onClick={() => void saveRate()}>{t('common.save')}</Button></>}
      >
        {rateForm && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); void saveRate(); }}>
            <Field label={t('intel.mkt.propertyType')}>
              <Input list="intel-property-types" value={rateForm.property_type} required onChange={(e) => setRateForm({ ...rateForm, property_type: e.target.value })} />
            </Field>
            <Field label={t('intel.mkt.rate')} hint={t('intel.mkt.rateHint')}>
              <Input inputMode="decimal" value={rateForm.rate_psf_annual} required onChange={(e) => setRateForm({ ...rateForm, rate_psf_annual: e.target.value })} />
            </Field>
            <Field label={t('intel.mkt.addressMatch')} hint={t('intel.mkt.addressMatchHint')}>
              <Input value={rateForm.address_match} onChange={(e) => setRateForm({ ...rateForm, address_match: e.target.value })} />
            </Field>
            <div className="form-grid">
              <Field label={t('intel.mkt.source')}><Input value={rateForm.source} onChange={(e) => setRateForm({ ...rateForm, source: e.target.value })} /></Field>
              <Field label={t('intel.mkt.asOf')}><Input type="date" value={rateForm.as_of} onChange={(e) => setRateForm({ ...rateForm, as_of: e.target.value })} /></Field>
            </div>
            {formError && <div className="field-error" role="alert">{formError}</div>}
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(leaseForm)}
        title={t('intel.mkt.assignTitle', { tenant: leaseForm?.row.tenant_name ?? '' })}
        onClose={() => setLeaseForm(null)}
        footer={<><Button onClick={() => setLeaseForm(null)}>{t('common.cancel')}</Button><Button variant="primary" loading={saving} onClick={() => void saveLease()}>{t('common.save')}</Button></>}
      >
        {leaseForm && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); void saveLease(); }}>
            <Field label={t('intel.mkt.propertyType')}>
              <Input list="intel-property-types" value={leaseForm.property_type} onChange={(e) => setLeaseForm({ ...leaseForm, property_type: e.target.value })} />
            </Field>
            <Field label={t('intel.mkt.assignedRate')} hint={t('intel.mkt.assignedRateHint')}>
              <Select value={leaseForm.market_rate_id} onChange={(e) => setLeaseForm({ ...leaseForm, market_rate_id: e.target.value })}>
                <option value="">{t('intel.mkt.automatic')}</option>
                {(rates.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.property_type}{r.address_match ? ` · ${r.address_match}` : ''} — {psf(r.rate_psf_annual)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('intel.mkt.override')} hint={t('intel.mkt.overrideHint')}>
              <Input inputMode="decimal" value={leaseForm.override} onChange={(e) => setLeaseForm({ ...leaseForm, override: e.target.value })} />
            </Field>
            {formError && <div className="field-error" role="alert">{formError}</div>}
          </form>
        )}
      </Modal>
      <datalist id="intel-property-types">{(a?.property_types ?? []).map((p) => <option key={p} value={p} />)}</datalist>
    </div>
  );
}
