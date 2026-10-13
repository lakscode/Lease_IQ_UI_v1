// Portfolio: KPIs, rent expiring by year, tenant concentration, data coverage, rent roll, expirations,
// non-renewals, risk scores and the Market Rent Engine.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get, getBlob, saveBlob } from '../../api/client.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import {
  Badge, Button, Card, EmptyState, ErrorState, LeaseStatusBadge, PageHeader, Select, SortHeader, Spinner, StatTile, Tabs, sortRows, useToast,
} from '../../components/ui.tsx';
import { useT, type TFunction } from '../../i18n/index.tsx';
import { formatDate, formatMoney, formatNumber, formatPercent } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import MarketRentEngine from '../intelligence/MarketRentEngine.tsx';
import SaveToCloudMenu from '../cloud/SaveToCloudMenu.tsx';
import { AXIS_TICK, BAR_RADIUS, ChartCard, ChartTip, GRID_STROKE, HBAR_RADIUS, MAX_BAR, Meter, compact } from './charts.tsx';
import type { ExpiringData, PortfolioData, RentRollRow, RiskReason } from './types.ts';
import './analytics.css';

type Tab = 'overview' | 'rentroll' | 'expiring' | 'nonrenewal' | 'risk' | 'market';
const TABS: Tab[] = ['overview', 'rentroll', 'expiring', 'nonrenewal', 'risk', 'market'];

function riskTone(score: number): 'success' | 'warning' | 'danger' {
  return score >= 50 ? 'danger' : score >= 25 ? 'warning' : 'success';
}

function reasonText(t: TFunction, r: RiskReason): string {
  const p: Record<string, string | number> = { ...(r.params ?? {}) };
  if (typeof p.date === 'string' && p.date) p.date = formatDate(p.date);
  if (typeof p.fields === 'string') p.fields = p.fields.split(',').map((f) => t(`analytics.field.${f}`)).join(', ');
  return t(`analytics.risk.${r.code}`, p);
}

export default function PortfolioPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'overview') as Tab;
  const { data, error, loading, reload } = useAsync((signal) => get<PortfolioData>('/portfolio', undefined, signal), []);

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <div className="page">
      <PageHeader title={t('nav.portfolio')} subtitle={data ? t('analytics.asOf', { date: formatDate(data.as_of) }) : undefined} />
      {loading && !data && <Spinner />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          <Kpis data={data} />
          <Tabs<Tab>
            active={tab}
            onChange={setTab}
            items={[
              { key: 'overview', label: t('analytics.pf.tab.overview') },
              { key: 'rentroll', label: t('analytics.pf.tab.rentroll'), count: data.rent_roll.length },
              { key: 'expiring', label: t('analytics.pf.tab.expiring') },
              { key: 'nonrenewal', label: t('analytics.pf.tab.nonrenewal'), count: data.non_renewals.length },
              { key: 'risk', label: t('analytics.pf.tab.risk') },
              { key: 'market', label: t('analytics.pf.tab.market') },
            ]}
          />
          <div style={{ opacity: loading ? 0.6 : 1 }}>
            {tab === 'overview' && <Overview data={data} />}
            {tab === 'rentroll' && <RentRoll rows={data.rent_roll} />}
            {tab === 'expiring' && <Expiring />}
            {tab === 'nonrenewal' && <NonRenewals data={data} />}
            {tab === 'risk' && <Risk data={data} />}
            {tab === 'market' && <MarketRentEngine />}
          </div>
        </>
      )}
    </div>
  );
}

function Kpis({ data }: { data: PortfolioData }) {
  const t = useT();
  const { currency } = useAuth();
  const k = data.kpis;
  return (
    <div className="tiles">
      <StatTile label={t('analytics.pf.annualRent')} value={formatMoney(k.annual_base_rent, currency)} hint={t('analytics.pf.inPlace', { n: k.in_place_count })} />
      <StatTile label={t('analytics.pf.leasedArea')} value={`${formatNumber(k.leased_area)} ${t('analytics.sqft')}`} />
      <StatTile label={t('analytics.pf.avgPsf')} value={k.avg_rent_psf === null ? '—' : formatMoney(k.avg_rent_psf, currency, 2)} hint={t('analytics.pf.perSqftYear')} />
      <StatTile label={t('analytics.pf.walt')} value={k.walt_years === null ? '—' : t('analytics.years', { n: formatNumber(k.walt_years, 1) })} hint={t('analytics.pf.waltHint')} />
      <StatTile label={t('analytics.pf.tenants')} value={formatNumber(k.tenant_count)} />
    </div>
  );
}

function Overview({ data }: { data: PortfolioData }) {
  const t = useT();
  const { currency } = useAuth();
  const money = (v: number | null) => formatMoney(v, currency);
  const conc = data.concentration.map((c) => ({ ...c, label: c.tenant === '__other__' ? t('analytics.other') : c.tenant }));
  return (
    <div className="an-grid">
      <ChartCard
        title={t('analytics.pf.expiringByYear')}
        subtitle={t('analytics.pf.expiringByYearSub')}
        table={{
          headers: [t('analytics.year'), t('analytics.leases'), t('analytics.annualRent')],
          rows: data.rent_expiring_by_year.map((r) => [r.year, formatNumber(r.count), money(r.annual_rent)]),
          numeric: [1, 2],
        }}
      >
        {data.rent_expiring_by_year.length === 0 ? <p className="muted">{t('analytics.noData')}</p> : (
          <div className="an-chart">
            <ResponsiveContainer>
              <BarChart data={data.rent_expiring_by_year} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="year" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => compact(v, currency)} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={<ChartTip rows={(d) => [
                    { value: money(d.annual_rent as number), label: t('analytics.annualRent'), color: 'var(--chart-1)' },
                    { value: formatNumber(d.count as number), label: t('analytics.leases') },
                  ]} />}
                />
                <Bar dataKey="annual_rent" fill="var(--chart-1)" radius={BAR_RADIUS} maxBarSize={MAX_BAR} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title={t('analytics.pf.concentration')}
        subtitle={t('analytics.pf.concentrationSub')}
        table={{
          headers: [t('analytics.tenant'), t('analytics.annualRent'), t('analytics.share')],
          rows: conc.map((c) => [c.label, money(c.annual_rent), formatPercent(c.share, 1)]),
          numeric: [1, 2],
        }}
      >
        {conc.length === 0 ? <p className="muted">{t('analytics.noData')}</p> : (
          <div className="an-chart" style={{ height: Math.max(160, conc.length * 42 + 30) }}>
            <ResponsiveContainer>
              <BarChart layout="vertical" data={conc} margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                <XAxis type="number" domain={[0, 1]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} tickFormatter={(v: number) => formatPercent(v)} />
                <YAxis type="category" dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} width={170} tickFormatter={(s: string) => (s.length > 24 ? `${s.slice(0, 23)}…` : s)} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={<ChartTip rows={(d) => [
                    { value: formatPercent(d.share as number, 1), label: t('analytics.share'), color: 'var(--chart-1)' },
                    { value: money(d.annual_rent as number), label: t('analytics.annualRent') },
                  ]} />}
                />
                <Bar
                  dataKey="share"
                  fill="var(--chart-1)"
                  radius={HBAR_RADIUS}
                  maxBarSize={MAX_BAR}
                  isAnimationActive={false}
                  label={{ position: 'right', fill: 'var(--muted)', fontSize: 12, formatter: (v: unknown) => formatPercent(Number(v)) }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <Card title={t('analytics.pf.coverage')} className="an-span-2">
        <p className="muted small" style={{ marginBottom: 12 }}>{t('analytics.pf.coverageSub')}</p>
        <div className="an-coverage">
          {data.coverage.map((c) => (
            <div key={c.field} style={{ display: 'contents' }}>
              <span>{t(`analytics.field.${c.field}`)}</span>
              <Meter value={c.pct} tone={c.pct >= 0.9 ? 'success' : c.pct >= 0.6 ? 'warning' : 'danger'} label={t(`analytics.field.${c.field}`)} />
              <span className="num small" title={`${c.present} / ${c.total}`}>{formatPercent(c.pct)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

type RollKey = 'tenant_name' | 'premises_address' | 'rentable_area' | 'expiration_date' | 'monthly_rent' | 'annual_rent' | 'rent_psf' | 'status';

function RentRoll({ rows }: { rows: RentRollRow[] }) {
  const t = useT();
  const toast = useToast();
  const { currency } = useAuth();
  const [sort, setSort] = useState<{ key: RollKey; dir: 'asc' | 'desc' }>({ key: 'tenant_name', dir: 'asc' });
  const [downloading, setDownloading] = useState(false);
  const onSort = (key: RollKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const fetchCsv = async () => {
    const { blob, filename } = await getBlob('/portfolio/rent-roll.csv');
    return { blob, name: filename ?? 'rent-roll.csv' };
  };
  const download = async () => {
    setDownloading(true);
    try {
      const { blob, name } = await fetchCsv();
      saveBlob(blob, name);
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setDownloading(false);
    }
  };
  const sorted = sortRows(rows, sort.key, sort.dir);
  const totals = rows.filter((r) => r.status !== 'expired').reduce((s, r) => ({ monthly: s.monthly + (r.monthly_rent ?? 0), area: s.area + (r.rentable_area ?? 0) }), { monthly: 0, area: 0 });
  return (
    <Card
      title={t('analytics.pf.tab.rentroll')}
      padded={false}
      actions={
        <>
          <Button size="sm" onClick={download} loading={downloading}>⬇ {t('common.exportCsv')}</Button>
          <SaveToCloudMenu getFile={fetchCsv} />
        </>
      }
    >
      {rows.length === 0 ? <EmptyState title={t('analytics.noLeases')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <SortHeader label={t('analytics.tenant')} column="tenant_name" sort={sort} onSort={onSort} />
                <SortHeader label={t('analytics.premises')} column="premises_address" sort={sort} onSort={onSort} />
                <SortHeader label={t('analytics.area')} column="rentable_area" sort={sort} onSort={onSort} align="right" />
                <SortHeader label={t('analytics.end')} column="expiration_date" sort={sort} onSort={onSort} />
                <SortHeader label={t('analytics.monthlyRent')} column="monthly_rent" sort={sort} onSort={onSort} align="right" />
                <SortHeader label={t('analytics.annualRent')} column="annual_rent" sort={sort} onSort={onSort} align="right" />
                <SortHeader label={t('analytics.psf')} column="rent_psf" sort={sort} onSort={onSort} align="right" />
                <SortHeader label={t('common.status')} column="status" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className={r.status === 'expired' ? 'an-muted-row' : undefined}>
                  <td>
                    <Link className="cell-title" to={`/leases/${r.id}`}>{r.tenant_name ?? t('analytics.unnamed')}</Link>
                    {r.landlord_name && <div className="cell-sub">{r.landlord_name}</div>}
                  </td>
                  <td>{r.premises_address ?? '—'}{r.property_type && <div className="cell-sub">{r.property_type}</div>}</td>
                  <td className="num">{formatNumber(r.rentable_area)}</td>
                  <td>{formatDate(r.expiration_date)}{r.notice_by && <div className="cell-sub">{t('analytics.noticeBy')}: {formatDate(r.notice_by)}</div>}</td>
                  <td className="num">{formatMoney(r.monthly_rent, currency)}</td>
                  <td className="num">{formatMoney(r.annual_rent, currency)}</td>
                  <td className="num">{formatMoney(r.rent_psf, currency, 2)}</td>
                  <td><LeaseStatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}><strong>{t('analytics.pf.inPlaceTotal')}</strong></td>
                <td className="num"><strong>{formatNumber(totals.area)}</strong></td>
                <td />
                <td className="num"><strong>{formatMoney(totals.monthly, currency)}</strong></td>
                <td className="num"><strong>{formatMoney(totals.monthly * 12, currency)}</strong></td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

const RENEWAL_TONE: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  renewed: 'success', option_available: 'info', notice_received: 'danger', notice_passed: 'warning', no_option: 'neutral', expired: 'danger',
};

function Expiring() {
  const t = useT();
  const { currency } = useAuth();
  const [params, setParams] = useSearchParams();
  const months = Number(params.get('months')) || 12;
  const { data, error, loading, reload } = useAsync((signal) => get<ExpiringData>('/portfolio/expiring', { months }, signal), [months]);
  const setMonths = (m: number) => {
    const p = new URLSearchParams(params);
    p.set('months', String(m));
    setParams(p, { replace: true });
  };
  return (
    <Card
      title={t('analytics.pf.expiringTitle')}
      padded={false}
      actions={
        <label className="row small">
          {t('analytics.pf.period')}
          <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[3, 6, 12, 18, 24, 36, 60].map((m) => <option key={m} value={m}>{t('analytics.nextMonths', { n: m })}</option>)}
          </Select>
        </label>
      }
    >
      {error && <div className="card-body"><ErrorState error={error} onRetry={reload} /></div>}
      {loading && !data && <div className="card-body"><Spinner /></div>}
      {data && (
        <>
          <div className="card-body an-totals">
            <span>{t('analytics.leases')}: <strong>{data.rows.length}</strong></span>
            <span>{t('analytics.pf.rentAtRisk')}: <strong>{formatMoney(data.total_annual_rent, currency)}</strong></span>
            <span>{t('analytics.pf.through')}: <strong>{formatDate(data.until)}</strong></span>
          </div>
          {data.rows.length === 0 ? <EmptyState icon="✅" title={t('analytics.pf.noneExpiring')} /> : (
            <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('analytics.tenant')}</th>
                    <th>{t('analytics.end')}</th>
                    <th className="num">{t('analytics.annualRent')}</th>
                    <th>{t('analytics.pf.renewalStatus')}</th>
                    <th>{t('analytics.noticeBy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td><Link className="cell-title" to={`/leases/${r.id}`}>{r.tenant_name ?? t('analytics.unnamed')}</Link><div className="cell-sub">{r.premises_address}</div></td>
                      <td>{formatDate(r.expiration_date)}<div className="cell-sub">{t('analytics.daysLeft', { n: r.days_left })}</div></td>
                      <td className="num">{formatMoney(r.annual_rent, currency)}</td>
                      <td><Badge tone={RENEWAL_TONE[r.renewal_status]}>{t(`analytics.renewal.${r.renewal_status}`)}</Badge></td>
                      <td>{r.notice_by ? formatDate(r.notice_by) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function NonRenewals({ data }: { data: PortfolioData }) {
  const t = useT();
  const { currency } = useAuth();
  return (
    <Card title={t('analytics.pf.nonRenewalTitle')} padded={false}>
      <p className="card-body muted small">{t('analytics.pf.nonRenewalSub')}</p>
      {data.non_renewals.length === 0 ? <EmptyState icon="✅" title={t('analytics.pf.noNonRenewals')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('analytics.tenant')}</th>
                <th>{t('analytics.reason')}</th>
                <th>{t('analytics.end')}</th>
                <th className="num">{t('analytics.annualRent')}</th>
              </tr>
            </thead>
            <tbody>
              {data.non_renewals.map((r) => (
                <tr key={r.id}>
                  <td><Link className="cell-title" to={`/leases/${r.id}`}>{r.tenant_name ?? t('analytics.unnamed')}</Link><div className="cell-sub">{r.premises_address}</div></td>
                  <td>
                    <Badge tone={r.reason === 'no_option' ? 'neutral' : r.reason === 'notice_passed' ? 'warning' : 'danger'}>{t(`analytics.nonRenewal.${r.reason}`)}</Badge>
                    {r.date && <div className="cell-sub">{formatDate(r.date)}</div>}
                  </td>
                  <td>{formatDate(r.expiration_date)}</td>
                  <td className="num">{formatMoney(r.annual_rent, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Risk({ data }: { data: PortfolioData }) {
  const t = useT();
  const [sort, setSort] = useState<{ key: 'score' | 'tenant_name' | 'expiration_date'; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' });
  const onSort = (key: 'score' | 'tenant_name' | 'expiration_date') => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const rows = sortRows(data.risk, sort.key, sort.dir);
  const high = data.risk.filter((r) => r.score >= 50).length;
  const medium = data.risk.filter((r) => r.score >= 25 && r.score < 50).length;
  return (
    <Card title={t('analytics.pf.riskTitle')} padded={false}>
      <div className="card-body an-totals">
        <span>{t('analytics.pf.riskHigh')}: <strong>{high}</strong></span>
        <span>{t('analytics.pf.riskMedium')}: <strong>{medium}</strong></span>
        <span>{t('analytics.pf.riskLow')}: <strong>{data.risk.length - high - medium}</strong></span>
      </div>
      <p className="card-body muted small" style={{ paddingTop: 0 }}>{t('analytics.pf.riskSub')}</p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <SortHeader label={t('analytics.tenant')} column="tenant_name" sort={sort} onSort={onSort} />
              <SortHeader label={t('analytics.pf.score')} column="score" sort={sort} onSort={onSort} />
              <th>{t('analytics.reasons')}</th>
              <SortHeader label={t('analytics.end')} column="expiration_date" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link className="cell-title" to={`/leases/${r.id}`}>{r.tenant_name ?? t('analytics.unnamed')}</Link><div className="cell-sub">{r.premises_address}</div></td>
                <td>
                  <div className="an-score">
                    <strong>{r.score}</strong>
                    <Meter value={r.score / 100} tone={riskTone(r.score)} label={t('analytics.pf.score')} />
                  </div>
                </td>
                <td>
                  {r.reasons.length === 0 ? <span className="muted">{t('analytics.pf.noRisk')}</span> : (
                    <div className="an-reasons">
                      {r.reasons.map((x, i) => <span key={i} className="an-reason">{reasonText(t, x)}<b>+{x.points}</b></span>)}
                    </div>
                  )}
                </td>
                <td>{formatDate(r.expiration_date)}<div className="cell-sub"><LeaseStatusBadge status={r.status} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
