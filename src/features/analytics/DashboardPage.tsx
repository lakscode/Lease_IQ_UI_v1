// Dashboard: portfolio health, expiration tiles, charts and upcoming expirations.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get } from '../../api/client.ts';
import type { LeaseStatus } from '../../api/types.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Card, EmptyState, ErrorState, PageHeader, Spinner, StatTile } from '../../components/ui.tsx';
import { useT, type TFunction } from '../../i18n/index.tsx';
import { formatDate, formatMoney, formatNumber, todayIso } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { ChartCard, ChartTip, Segmented } from './charts.tsx';
import { AXIS_TICK, BAR_RADIUS, GRID_STROKE, HBAR_RADIUS, MAX_BAR, compact } from './chart-style.ts';
import type { DashboardData } from './types.ts';
import './analytics.css';

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export default function DashboardPage() {
  const t = useT();
  const { currency } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync((signal) => get<DashboardData>('/dashboard', undefined, signal), []);
  const [quarterMetric, setQuarterMetric] = useState<'rent' | 'count'>('rent');

  if (loading && !data) return <div className="page"><PageHeader title={t('nav.dashboard')} /><Spinner /></div>;
  if (error && !data) return <div className="page"><PageHeader title={t('nav.dashboard')} /><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return null;

  const quick = (
    <div className="an-quick">
      <Link className="btn btn-primary" to="/leases">{t('analytics.dash.upload')}</Link>
      <Link className="btn btn-secondary" to="/assistant">{t('analytics.dash.askAssistant')}</Link>
    </div>
  );

  if (data.tiles.total === 0) {
    return (
      <div className="page">
        <PageHeader title={t('nav.dashboard')} />
        <EmptyState icon="📊" title={t('analytics.dash.emptyTitle')} action={quick}>{t('analytics.dash.emptyBody')}</EmptyState>
      </div>
    );
  }

  const money = (v: number | null | undefined) => formatMoney(v, currency);

  return (
    <div className="page" style={{ opacity: loading ? 0.6 : 1 }}>
      <PageHeader title={t('nav.dashboard')} subtitle={t('analytics.asOf', { date: formatDate(data.as_of) })} actions={quick} />

      <HealthCard data={data} t={t} />

      <div className="tiles">
        <StatTile label={t('analytics.dash.exp90')} value={formatNumber(data.tiles.expiring_90_days)} tone={data.tiles.expiring_90_days ? 'danger' : 'neutral'} onClick={() => navigate('/portfolio?tab=expiring&months=3')} />
        <StatTile label={t('analytics.dash.exp12')} value={formatNumber(data.tiles.expiring_12_months)} tone={data.tiles.expiring_12_months ? 'warning' : 'neutral'} onClick={() => navigate('/portfolio?tab=expiring&months=12')} />
        <StatTile label={t('analytics.dash.renewed')} value={formatNumber(data.tiles.renewed)} onClick={() => navigate('/reports?status=renewed')} />
        <StatTile label={t('analytics.dash.expired')} value={formatNumber(data.tiles.expired)} tone={data.tiles.expired ? 'danger' : 'neutral'} onClick={() => navigate('/reports?status=expired')} />
      </div>

      <div className="an-grid">
        <ChartCard
          title={t('analytics.dash.byQuarter')}
          subtitle={t('analytics.dash.byQuarterSub')}
          actions={
            <Segmented
              label={t('analytics.dash.metric')}
              value={quarterMetric}
              onChange={setQuarterMetric}
              options={[{ key: 'rent', label: t('analytics.annualRent') }, { key: 'count', label: t('analytics.leases') }]}
            />
          }
          table={{
            headers: [t('analytics.quarter'), t('analytics.leases'), t('analytics.annualRent')],
            rows: data.expirations_by_quarter.map((q) => [q.quarter, formatNumber(q.count), money(q.annual_rent)]),
            numeric: [1, 2],
          }}
        >
          <div className="an-chart">
            <ResponsiveContainer>
              <BarChart data={data.expirations_by_quarter} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="quarter" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={4} tickFormatter={(q: string) => { const [y, qq] = q.split(' '); return `${qq} ’${y.slice(2)}`; }} />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={quarterMetric === 'rent' ? 64 : 32}
                  allowDecimals={false}
                  tickFormatter={(v: number) => (quarterMetric === 'rent' ? compact(v, currency) : String(v))}
                />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={
                    <ChartTip
                      rows={(d) => [
                        { value: money(d.annual_rent as number), label: t('analytics.annualRent'), color: quarterMetric === 'rent' ? 'var(--chart-1)' : undefined },
                        { value: formatNumber(d.count as number), label: t('analytics.leases'), color: quarterMetric === 'count' ? 'var(--chart-1)' : undefined },
                      ]}
                    />
                  }
                />
                <Bar dataKey={quarterMetric === 'rent' ? 'annual_rent' : 'count'} fill="var(--chart-1)" radius={BAR_RADIUS} maxBarSize={MAX_BAR} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title={t('analytics.dash.outlook')}
          subtitle={t('analytics.dash.outlookSub')}
          table={{
            headers: [t('analytics.month'), t('analytics.monthlyRent')],
            rows: data.rent_outlook.map((m) => [monthLabel(m.month), money(m.rent)]),
            numeric: [1],
          }}
        >
          <div className="an-chart">
            <ResponsiveContainer>
              <AreaChart data={data.rent_outlook} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} tickFormatter={monthLabel} minTickGap={24} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => compact(v, currency)} />
                <Tooltip
                  cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
                  content={<ChartTip title={(l) => monthLabel(String(l))} rows={(d) => [{ value: money(d.rent as number), label: t('analytics.monthlyRent'), color: 'var(--chart-1)' }]} />}
                />
                <Area
                  type="stepAfter"
                  dataKey="rent"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="var(--chart-1)"
                  fillOpacity={0.1}
                  activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2, fill: 'var(--chart-1)' }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="an-span-2"
          title={t('analytics.dash.timeline')}
          subtitle={t('analytics.dash.timelineSub')}
          table={{
            headers: [t('analytics.tenant'), t('analytics.start'), t('analytics.end'), t('common.status')],
            rows: data.timeline.map((l) => [l.tenant_name ?? '—', formatDate(l.start), formatDate(l.end), t(`status.${l.status}`)]),
          }}
        >
          <LeaseTimeline rows={data.timeline} asOf={data.as_of} t={t} />
        </ChartCard>

        <ChartCard
          title={t('analytics.dash.docTypes')}
          table={{
            headers: [t('analytics.docType'), t('analytics.documents')],
            rows: data.documents_by_type.map((d) => [t(`analytics.docType.${d.doc_type}`), formatNumber(d.count)]),
            numeric: [1],
          }}
        >
          {data.documents_by_type.length === 0 ? (
            <p className="muted">{t('analytics.noData')}</p>
          ) : (
            <div className="an-chart" style={{ height: Math.max(140, data.documents_by_type.length * 40 + 30) }}>
              <ResponsiveContainer>
                <BarChart layout="vertical" data={data.documents_by_type.map((d) => ({ ...d, label: t(`analytics.docType.${d.doc_type}`) }))} margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                  <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} width={130} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTip rows={(d) => [{ value: formatNumber(d.count as number), label: t('analytics.documents'), color: 'var(--chart-1)' }]} />} />
                  <Bar dataKey="count" fill="var(--chart-1)" radius={HBAR_RADIUS} maxBarSize={MAX_BAR} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <Card title={t('analytics.dash.upcoming')} padded={false}>
          {data.upcoming_expirations.length === 0 ? (
            <div className="card-body muted">{t('analytics.dash.noUpcoming')}</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('analytics.tenant')}</th>
                    <th>{t('analytics.end')}</th>
                    <th>{t('analytics.urgency')}</th>
                    <th className="num">{t('analytics.monthlyRent')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.upcoming_expirations.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <Link className="cell-title" to={`/leases/${u.id}`}>{u.tenant_name ?? t('analytics.unnamed')}</Link>
                        <div className="cell-sub">{u.premises_address}</div>
                      </td>
                      <td>
                        {formatDate(u.expiration_date)}
                        <div className="cell-sub">{t('analytics.daysLeft', { n: u.days_left })}</div>
                      </td>
                      <td><span className={`an-chip an-chip-${u.urgency}`}>{t(`analytics.urgency.${u.urgency}`)}</span></td>
                      <td className="num">{money(u.monthly_rent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function HealthCard({ data, t }: { data: DashboardData; t: TFunction }) {
  const segs: { key: 'active' | 'expiring' | 'expired' | 'unknown'; value: number }[] = [
    { key: 'active', value: data.health.active },
    { key: 'expiring', value: data.health.expiring },
    { key: 'expired', value: data.health.expired },
    { key: 'unknown', value: data.health.unknown },
  ];
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  const label = (k: string) => (k === 'expiring' ? t('analytics.dash.healthExpiring') : t(`status.${k}`));
  return (
    <Card title={t('analytics.dash.health')}>
      <div className="an-health" role="img" aria-label={segs.map((s) => `${label(s.key)}: ${s.value}`).join(', ')}>
        {segs.filter((s) => s.value > 0).map((s) => (
          <div key={s.key} className={`an-health-seg an-st-${s.key}`} style={{ flexGrow: s.value, flexBasis: 0 }} title={`${label(s.key)}: ${s.value}`} />
        ))}
      </div>
      <div className="an-health-legend">
        {segs.map((s) => (
          <div className="an-health-item" key={s.key}>
            <span className="label"><span className={`an-swatch an-st-${s.key}`} aria-hidden="true" />{label(s.key)}</span>
            <span className="value">
              {formatNumber(s.value)} <span className="muted small">({Math.round((s.value / total) * 100)}%)</span>
            </span>
          </div>
        ))}
      </div>
      {data.tiles.renewed > 0 && <p className="an-hint">{t('analytics.dash.renewedNote', { n: data.tiles.renewed })}</p>}
    </Card>
  );
}

function toMs(d: string) {
  return Date.parse(`${d}T00:00:00Z`);
}

function LeaseTimeline({ rows, asOf, t }: { rows: DashboardData['timeline']; asOf: string; t: TFunction }) {
  const today = asOf || todayIso();
  const { min, max, years } = useMemo(() => {
    const dates = rows.flatMap((r) => [r.start, r.end]).filter((d): d is string => Boolean(d));
    dates.push(today);
    let lo = Math.min(...dates.map(toMs));
    let hi = Math.max(...dates.map(toMs), toMs(today) + 365 * 86_400_000);
    const y0 = new Date(lo).getUTCFullYear();
    const y1 = new Date(hi).getUTCFullYear() + 1;
    lo = Date.UTC(y0, 0, 1);
    hi = Date.UTC(y1, 0, 1);
    const ys: number[] = [];
    for (let y = y0; y <= y1; y++) ys.push(y);
    return { min: lo, max: hi, years: ys };
  }, [rows, today]);
  const pos = (ms: number) => ((ms - min) / (max - min)) * 100;
  const step = years.length > 10 ? 2 : 1;
  const statuses: LeaseStatus[] = ['active', 'renewed', 'expiring', 'expired', 'unknown'];

  if (!rows.length) return <p className="muted">{t('analytics.noData')}</p>;
  return (
    <div className="an-timeline">
      <div className="an-tl-axis" aria-hidden="true">
        {years.filter((_, i) => i % step === 0).map((y) => (
          <span key={y} style={{ left: `${pos(Date.UTC(y, 0, 1))}%` }}>{y}</span>
        ))}
      </div>
      <div className="an-tl-scroll">
        <div className="an-tl-body">
          <div className="an-tl-overlay" aria-hidden="true">
            {years.map((y) => <div key={y} className="an-tl-grid" style={{ left: `${pos(Date.UTC(y, 0, 1))}%` }} />)}
            <div className="an-tl-today" style={{ left: `${pos(toMs(today))}%` }} />
          </div>
          {rows.map((r) => {
            const start = r.start ? toMs(r.start) : min;
            const open = !r.end;
            const end = r.end ? toMs(r.end) : max;
            const tip = `${r.tenant_name ?? '—'}: ${formatDate(r.start)} – ${r.end ? formatDate(r.end) : t('analytics.dash.noEnd')} (${t(`status.${r.status}`)})`;
            return (
              <div className="an-tl-row" key={r.id}>
                <Link className="an-tl-name" to={`/leases/${r.id}`} title={r.tenant_name ?? ''}>{r.tenant_name ?? t('analytics.unnamed')}</Link>
                <div className="an-tl-track">
                  <Link
                    to={`/leases/${r.id}`}
                    className={`an-tl-bar an-st-${r.status}${open ? ' an-tl-open' : ''}`}
                    style={{ left: `${pos(start)}%`, width: `${Math.max(0.5, pos(end) - pos(start))}%` }}
                    title={tip}
                    aria-label={tip}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="an-legend">
        {statuses.map((s) => (
          <span className="an-legend-item" key={s}><span className={`an-swatch an-st-${s}`} aria-hidden="true" />{t(`status.${s}`)}</span>
        ))}
        <span className="an-legend-item"><span className="an-tl-key-today" aria-hidden="true" />{t('analytics.today')} · {formatDate(today)}</span>
      </div>
    </div>
  );
}
