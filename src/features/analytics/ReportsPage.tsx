// Reports: every lease as amended, filterable (filters live in the URL), sortable, with charts that filter on
// click and CSV export (download, save to cloud, email).
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get, getBlob, post, saveBlob } from '../../api/client.ts';
import type { LeaseStatus } from '../../api/types.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { EmailDialog } from '../../components/EmailDialog.tsx';
import { Button, Card, EmptyState, ErrorState, Field, Input, LeaseStatusBadge, PageHeader, Select, SortHeader, Spinner } from '../../components/ui.tsx';
import { sortRows } from '../../components/ui-utils.ts';
import { useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatMoney, formatNumber } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import SaveToCloudMenu from '../cloud/SaveToCloudMenu.tsx';
import { ChartCard, ChartTip } from './charts.tsx';
import { AXIS_TICK, BAR_RADIUS, GRID_STROKE, HBAR_RADIUS, MAX_BAR, compact } from './chart-style.ts';
import type { ReportData, ReportRow } from './types.ts';
import './analytics.css';

const FILTER_KEYS = ['search', 'tenant', 'landlord', 'status', 'start_from', 'start_to', 'end_from', 'end_to', 'rent_min', 'rent_max'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type SortKey = 'tenant_name' | 'landlord_name' | 'premises_address' | 'commencement_date' | 'expiration_date' | 'annual_rent' | 'monthly_rent' | 'status';
const SORT_KEYS: SortKey[] = ['tenant_name', 'landlord_name', 'premises_address', 'commencement_date', 'expiration_date', 'annual_rent', 'monthly_rent', 'status'];
const STATUSES: LeaseStatus[] = ['active', 'expiring', 'renewed', 'expired', 'unknown'];

export default function ReportsPage() {
  const t = useT();
  const toast = useToast();
  const { currency } = useAuth();
  const [params, setParams] = useSearchParams();
  const [emailOpen, setEmailOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const filters = useMemo(() => {
    const f: Partial<Record<FilterKey, string>> = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) f[k] = v;
    }
    return f;
  }, [params]);
  const filterKey = JSON.stringify(filters);
  const sortKey = (SORT_KEYS.includes(params.get('sort') as SortKey) ? params.get('sort') : 'tenant_name') as SortKey;
  const sortDir = params.get('dir') === 'desc' ? 'desc' : 'asc';

  const { data, error, loading, reload } = useAsync((signal) => get<ReportData>('/reports/leases', filters, signal), [filterKey]);

  const update = (changes: Partial<Record<FilterKey | 'sort' | 'dir', string | null>>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };
  const clearAll = () => {
    const p = new URLSearchParams(params);
    FILTER_KEYS.forEach((k) => p.delete(k));
    setParams(p, { replace: true });
  };

  // Search box: local state, pushed to the URL after a short pause.
  const [search, setSearch] = useState(filters.search ?? '');
  useEffect(() => setSearch(filters.search ?? ''), [filters.search]);
  useEffect(() => {
    if ((filters.search ?? '') === search) return;
    const id = setTimeout(() => update({ search: search.trim() || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const onSort = (key: SortKey) => update({ sort: key, dir: sortKey === key && sortDir === 'asc' ? 'desc' : 'asc' });
  const rows: ReportRow[] = data ? sortRows(data.rows, sortKey, sortDir) : [];
  const money = (v: number | null | undefined) => formatMoney(v, currency);

  const fetchCsv = async () => {
    const { blob, filename } = await getBlob('/reports/leases.csv', filters);
    return { blob, name: filename ?? 'lease-report.csv' };
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

  const yearSelected = (year: string) => filters.end_from === `${year}-01-01` && filters.end_to === `${year}-12-31`;
  const statusFilter = filters.status?.split(',') ?? [];

  const chips: { key: FilterKey[]; label: string }[] = [];
  if (filters.search) chips.push({ key: ['search'], label: `${t('common.search')}: ${filters.search}` });
  if (filters.tenant) chips.push({ key: ['tenant'], label: `${t('analytics.tenant')}: ${filters.tenant}` });
  if (filters.landlord) chips.push({ key: ['landlord'], label: `${t('analytics.landlord')}: ${filters.landlord}` });
  if (filters.status) chips.push({ key: ['status'], label: `${t('common.status')}: ${statusFilter.map((s) => t(`status.${s}`)).join(', ')}` });
  if (filters.start_from || filters.start_to) chips.push({ key: ['start_from', 'start_to'], label: `${t('analytics.start')}: ${formatDate(filters.start_from)} – ${formatDate(filters.start_to)}` });
  if (filters.end_from || filters.end_to) chips.push({ key: ['end_from', 'end_to'], label: `${t('analytics.end')}: ${formatDate(filters.end_from)} – ${formatDate(filters.end_to)}` });
  if (filters.rent_min || filters.rent_max) chips.push({ key: ['rent_min', 'rent_max'], label: `${t('analytics.annualRent')}: ${filters.rent_min ? money(Number(filters.rent_min)) : '…'} – ${filters.rent_max ? money(Number(filters.rent_max)) : '…'}` });

  return (
    <div className="page">
      <PageHeader
        title={t('nav.reports')}
        subtitle={t('analytics.rep.subtitle')}
        actions={
          <>
            <Button size="sm" onClick={download} loading={downloading}>⬇ {t('common.exportCsv')}</Button>
            <SaveToCloudMenu getFile={fetchCsv} />
            <Button size="sm" onClick={() => setEmailOpen(true)}>✉ {t('common.email')}</Button>
          </>
        }
      />

      <Card>
        <div className="an-filters">
          <Field label={t('common.search')}>
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('analytics.rep.searchPlaceholder')} />
          </Field>
          <Field label={t('analytics.tenant')}>
            <Select value={filters.tenant ?? ''} onChange={(e) => update({ tenant: e.target.value || null })}>
              <option value="">{t('common.all')}</option>
              {data?.options.tenants.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label={t('analytics.landlord')}>
            <Select value={filters.landlord ?? ''} onChange={(e) => update({ landlord: e.target.value || null })}>
              <option value="">{t('common.all')}</option>
              {data?.options.landlords.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label={t('common.status')}>
            <Select value={statusFilter.length > 1 ? '__multi' : (filters.status ?? '')} onChange={(e) => update({ status: e.target.value === '__multi' ? filters.status ?? null : e.target.value || null })}>
              <option value="">{t('common.all')}</option>
              {statusFilter.length > 1 && <option value="__multi">{statusFilter.map((s) => t(`status.${s}`)).join(', ')}</option>}
              {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </Select>
          </Field>
          <div className="an-wide"><Field label={t('analytics.rep.startRange')}>
            <div className="an-range">
              <Input type="date" aria-label={t('common.from')} value={filters.start_from ?? ''} onChange={(e) => update({ start_from: e.target.value || null })} />
              <Input type="date" aria-label={t('common.to')} value={filters.start_to ?? ''} onChange={(e) => update({ start_to: e.target.value || null })} />
            </div>
          </Field></div>
          <div className="an-wide"><Field label={t('analytics.rep.endRange')}>
            <div className="an-range">
              <Input type="date" aria-label={t('common.from')} value={filters.end_from ?? ''} onChange={(e) => update({ end_from: e.target.value || null })} />
              <Input type="date" aria-label={t('common.to')} value={filters.end_to ?? ''} onChange={(e) => update({ end_to: e.target.value || null })} />
            </div>
          </Field></div>
          <div className="an-wide"><Field label={t('analytics.rep.rentRange')}>
            <div className="an-range">
              <Input type="number" min={0} inputMode="numeric" placeholder={t('analytics.min')} aria-label={t('analytics.min')} defaultValue={filters.rent_min ?? ''} key={`min-${filters.rent_min ?? ''}`} onBlur={(e) => update({ rent_min: e.target.value || null })} onKeyDown={(e) => e.key === 'Enter' && update({ rent_min: e.currentTarget.value || null })} />
              <Input type="number" min={0} inputMode="numeric" placeholder={t('analytics.max')} aria-label={t('analytics.max')} defaultValue={filters.rent_max ?? ''} key={`max-${filters.rent_max ?? ''}`} onBlur={(e) => update({ rent_max: e.target.value || null })} onKeyDown={(e) => e.key === 'Enter' && update({ rent_max: e.currentTarget.value || null })} />
            </div>
          </Field></div>
        </div>
        {chips.length > 0 && (
          <div className="an-active-filters" style={{ marginTop: 12 }}>
            {chips.map((c) => (
              <span className="an-filter-chip" key={c.key.join()}>
                {c.label}
                <button type="button" aria-label={t('common.remove')} onClick={() => update(Object.fromEntries(c.key.map((k) => [k, null])))}>×</button>
              </span>
            ))}
            <Button size="sm" variant="ghost" onClick={clearAll}>{t('analytics.rep.clear')}</Button>
          </div>
        )}
      </Card>

      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && (
        <div className="stack" style={{ gap: 18, opacity: loading ? 0.6 : 1 }}>
          <div className="an-grid">
            <ChartCard
              title={t('analytics.rep.byStatus')}
              subtitle={t('analytics.rep.clickToFilter')}
              table={{ headers: [t('common.status'), t('analytics.leases')], rows: data.charts.by_status.map((s) => [t(`status.${s.status}`), formatNumber(s.count)]), numeric: [1] }}
            >
              <div className="an-chart an-clickable">
                <ResponsiveContainer>
                  <BarChart data={data.charts.by_status.map((s) => ({ ...s, label: t(`status.${s.status}`) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval={0} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTip rows={(d) => [{ value: formatNumber(d.count as number), label: t('analytics.leases'), color: 'var(--chart-1)' }]} />} />
                    <Bar
                      dataKey="count"
                      radius={BAR_RADIUS}
                      maxBarSize={MAX_BAR}
                      isAnimationActive={false}
                      onClick={(_, i) => {
                        const s = data.charts.by_status[i]?.status;
                        if (s) update({ status: filters.status === s ? null : s });
                      }}
                    >
                      {data.charts.by_status.map((s) => (
                        <Cell key={s.status} fill="var(--chart-1)" fillOpacity={statusFilter.length && !statusFilter.includes(s.status) ? 0.3 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title={t('analytics.rep.byYear')}
              subtitle={t('analytics.rep.clickToFilter')}
              table={{
                headers: [t('analytics.year'), t('analytics.leases'), t('analytics.annualRent')],
                rows: data.charts.expirations_by_year.map((y) => [y.year, formatNumber(y.count), money(y.annual_rent)]),
                numeric: [1, 2],
              }}
            >
              {data.charts.expirations_by_year.length === 0 ? <p className="muted">{t('analytics.noData')}</p> : (
                <div className="an-chart an-clickable">
                  <ResponsiveContainer>
                    <BarChart data={data.charts.expirations_by_year} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                      <XAxis dataKey="year" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
                      <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: 'var(--surface-2)' }}
                        content={<ChartTip rows={(d) => [
                          { value: formatNumber(d.count as number), label: t('analytics.leases'), color: 'var(--chart-1)' },
                          { value: money(d.annual_rent as number), label: t('analytics.annualRent') },
                        ]} />}
                      />
                      <Bar
                        dataKey="count"
                        radius={BAR_RADIUS}
                        maxBarSize={MAX_BAR}
                        isAnimationActive={false}
                        onClick={(_, i) => {
                          const y = data.charts.expirations_by_year[i]?.year;
                          if (!y) return;
                          if (yearSelected(y)) update({ end_from: null, end_to: null });
                          else update({ end_from: `${y}-01-01`, end_to: `${y}-12-31` });
                        }}
                      >
                        {data.charts.expirations_by_year.map((y) => (
                          <Cell key={y.year} fill="var(--chart-1)" fillOpacity={(filters.end_from || filters.end_to) && !yearSelected(y.year) ? 0.3 : 1} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard
              className="an-span-2"
              title={t('analytics.rep.byLandlord')}
              subtitle={t('analytics.rep.byLandlordSub')}
              table={{ headers: [t('analytics.landlord'), t('analytics.annualRent')], rows: data.charts.rent_by_landlord.map((l) => [l.landlord, money(l.annual_rent)]), numeric: [1] }}
            >
              {data.charts.rent_by_landlord.length === 0 ? <p className="muted">{t('analytics.noData')}</p> : (
                <div className="an-chart an-clickable" style={{ height: Math.max(140, data.charts.rent_by_landlord.length * 40 + 30) }}>
                  <ResponsiveContainer>
                    <BarChart layout="vertical" data={data.charts.rent_by_landlord} margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                      <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                      <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} tickFormatter={(v: number) => compact(v, currency)} />
                      <YAxis type="category" dataKey="landlord" tick={AXIS_TICK} tickLine={false} axisLine={false} width={170} tickFormatter={(s: string) => (s.length > 26 ? `${s.slice(0, 25)}…` : s)} />
                      <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTip rows={(d) => [{ value: money(d.annual_rent as number), label: t('analytics.annualRent'), color: 'var(--chart-1)' }]} />} />
                      <Bar
                        dataKey="annual_rent"
                        radius={HBAR_RADIUS}
                        maxBarSize={MAX_BAR}
                        isAnimationActive={false}
                        onClick={(_, i) => {
                          const l = data.charts.rent_by_landlord[i]?.landlord;
                          if (l) update({ landlord: filters.landlord === l ? null : l });
                        }}
                      >
                        {data.charts.rent_by_landlord.map((l) => (
                          <Cell key={l.landlord} fill="var(--chart-1)" fillOpacity={filters.landlord && filters.landlord !== l.landlord ? 0.3 : 1} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <Card
            title={t('analytics.rep.tableTitle', { n: data.totals.count, total: data.total })}
            padded={false}
            actions={
              <div className="an-totals">
                <span>{t('analytics.annualRent')}: <strong>{money(data.totals.annual_rent)}</strong></span>
                <span>{t('analytics.monthlyRent')}: <strong>{money(data.totals.monthly_rent)}</strong></span>
              </div>
            }
          >
            {rows.length === 0 ? (
              <EmptyState icon="🔎" title={t('analytics.rep.noMatch')} action={<Button onClick={clearAll}>{t('analytics.rep.clear')}</Button>} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <SortHeader label={t('analytics.tenant')} column="tenant_name" sort={{ key: sortKey, dir: sortDir }} onSort={onSort} />
                      <SortHeader label={t('analytics.landlord')} column="landlord_name" sort={{ key: sortKey, dir: sortDir }} onSort={onSort} />
                      <SortHeader label={t('analytics.premises')} column="premises_address" sort={{ key: sortKey, dir: sortDir }} onSort={onSort} />
                      <SortHeader label={t('analytics.start')} column="commencement_date" sort={{ key: sortKey, dir: sortDir }} onSort={onSort} />
                      <SortHeader label={t('analytics.end')} column="expiration_date" sort={{ key: sortKey, dir: sortDir }} onSort={onSort} />
                      <SortHeader label={t('analytics.annualRent')} column="annual_rent" sort={{ key: sortKey, dir: sortDir }} onSort={onSort} align="right" />
                      <SortHeader label={t('analytics.monthlyRent')} column="monthly_rent" sort={{ key: sortKey, dir: sortDir }} onSort={onSort} align="right" />
                      <SortHeader label={t('common.status')} column="status" sort={{ key: sortKey, dir: sortDir }} onSort={onSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td><Link className="cell-title" to={`/leases/${r.id}`}>{r.tenant_name ?? t('analytics.unnamed')}</Link></td>
                        <td>{r.landlord_name ?? '—'}</td>
                        <td>{r.premises_address ?? '—'}</td>
                        <td>{formatDate(r.commencement_date)}</td>
                        <td>{formatDate(r.expiration_date)}</td>
                        <td className="num">{money(r.annual_rent)}</td>
                        <td className="num">{money(r.monthly_rent)}</td>
                        <td><LeaseStatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      <EmailDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title={t('analytics.rep.emailTitle')}
        description={t('analytics.rep.emailDesc', { n: data?.totals.count ?? 0 })}
        onSend={async (to, message) => {
          await post('/reports/leases/email', { to, message, filters });
          toast(t('analytics.rep.emailSent', { n: to.length }));
        }}
      />
    </div>
  );
}
