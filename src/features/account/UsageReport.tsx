// AI usage report: org admins see their organization; super admins can see all organizations with a filter.
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get, getBlob, saveBlob } from '../../api/client.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { Button, Card, EmptyState, ErrorState, Field, Input, Select, Spinner, StatTile } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatNumber, formatTokens, todayIso } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import type { AdminOrg, UsageReportData, UsageTotals } from './types.ts';
import './account.css';

type Range = '7' | '30' | '90' | '365' | 'custom';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function UsageReport({ scope }: { scope: 'org' | 'all' }) {
  const t = useT();
  const { activeOrg } = useAuth();
  const [range, setRange] = useState<Range>('30');
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(todayIso());
  const [orgFilter, setOrgFilter] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const orgId = scope === 'org' ? activeOrg?.id ?? null : orgFilter === 'all' ? null : orgFilter;
  const query = {
    ...(range === 'custom' ? { from, to } : { days: range }),
    ...(orgId ? { org_id: orgId } : {}),
  };
  const queryKey = JSON.stringify(query);

  const report = useAsync((signal) => get<UsageReportData>('/usage', query, signal), [queryKey]);
  const orgs = useAsync((signal) => (scope === 'all' ? get<AdminOrg[]>('/admin/orgs', undefined, signal) : Promise.resolve([])), [scope]);

  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const { blob, filename } = await getBlob('/usage/export', query);
      saveBlob(blob, filename ?? 'ai-usage.csv');
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const data = report.data;
  const showOrgs = scope === 'all' && !orgId;

  return (
    <div className="acct-section-gap">
      <div className="acct-usage-filters">
        <Field label={t('account.usage.range')}>
          <Select value={range} onChange={(e) => setRange(e.target.value as Range)}>
            <option value="7">{t('account.usage.lastDays', { n: 7 })}</option>
            <option value="30">{t('account.usage.lastDays', { n: 30 })}</option>
            <option value="90">{t('account.usage.lastDays', { n: 90 })}</option>
            <option value="365">{t('account.usage.lastDays', { n: 365 })}</option>
            <option value="custom">{t('account.usage.custom')}</option>
          </Select>
        </Field>
        {range === 'custom' && (
          <>
            <Field label={t('common.from')}><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label={t('common.to')}><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          </>
        )}
        {scope === 'all' && (
          <Field label={t('account.usage.organization')}>
            <Select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
              <option value="all">{t('account.usage.allOrgs')}</option>
              {(orgs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="acct-toolbar-spacer" />
        <Button onClick={exportCsv} loading={exporting} disabled={!data}>{t('common.exportCsv')}</Button>
      </div>
      {exportError && <ErrorState error={exportError} />}

      {report.loading && !data ? (
        <Spinner />
      ) : report.error ? (
        <ErrorState error={report.error} onRetry={report.reload} />
      ) : data ? (
        <>
          <div className="tiles">
            <StatTile label={t('account.usage.calls')} value={formatNumber(data.totals.calls)} hint={`${formatDate(data.from)} – ${formatDate(data.to)}`} />
            <StatTile label={t('account.usage.totalTokens')} value={formatTokens(data.totals.total_tokens)} hint={formatNumber(data.totals.total_tokens)} />
            <StatTile label={t('account.usage.inputTokens')} value={formatTokens(data.totals.input_tokens)} />
            <StatTile label={t('account.usage.outputTokens')} value={formatTokens(data.totals.output_tokens)} />
            <StatTile
              label={t('account.usage.cacheTokens')}
              value={formatTokens(data.totals.cache_read_tokens + data.totals.cache_creation_tokens)}
              hint={t('account.usage.cacheHint', { read: formatTokens(data.totals.cache_read_tokens), write: formatTokens(data.totals.cache_creation_tokens) })}
            />
          </div>

          {data.totals.calls === 0 ? (
            <Card><EmptyState icon="📊" title={t('account.usage.empty')}>{t('account.usage.emptyHint')}</EmptyState></Card>
          ) : (
            <>
              <Card title={t('account.usage.tokensByDay')}>
                <DailyChart rows={data.by_day} />
              </Card>
              <Card title={t('account.usage.byModel')} padded={false}>
                <UsageTable rows={data.by_model.map((r) => ({ key: r.model, label: r.model, ...r }))} labelHeader={t('account.usage.model')} showCache />
              </Card>
              <Card title={t('account.usage.byProcess')} padded={false}>
                <UsageTable rows={data.by_process.map((r) => ({ key: r.process, label: t(`account.usage.process.${r.process}`), ...r }))} labelHeader={t('account.usage.process')} />
              </Card>
              <Card title={t('account.usage.byUser')} padded={false}>
                <UsageTable rows={data.by_user.map((r) => ({ key: r.user_id ?? 'system', label: r.email, ...r }))} labelHeader={t('account.usage.user')} />
              </Card>
              {showOrgs && (
                <Card title={t('account.usage.byOrg')} padded={false}>
                  <UsageTable rows={data.by_org.map((r) => ({ key: r.org_id ?? 'none', label: r.org_name, ...r }))} labelHeader={t('account.usage.organization')} />
                </Card>
              )}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function DailyChart({ rows }: { rows: (UsageTotals & { date: string })[] }) {
  const t = useT();
  return (
    <div className="acct-usage-chart" role="img" aria-label={t('account.usage.tokensByDay')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => formatDate(d).replace(/,? \d{4}$/, '')}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border-strong)' }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis tickFormatter={(v: number) => formatTokens(v)} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={({ active, payload }) => {
              const row = active && payload?.[0]?.payload as (UsageTotals & { date: string }) | undefined;
              if (!row) return null;
              return (
                <div className="acct-tooltip">
                  <span className="muted">{formatDate(row.date)}</span>
                  <span>{t('account.usage.totalTokens')}: <strong>{formatNumber(row.total_tokens)}</strong></span>
                  <span>{t('account.usage.calls')}: <strong>{formatNumber(row.calls)}</strong></span>
                </div>
              );
            }}
          />
          <Bar dataKey="total_tokens" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function UsageTable({ rows, labelHeader, showCache }: {
  rows: (UsageTotals & { key: string; label: string })[];
  labelHeader: string;
  showCache?: boolean;
}) {
  const t = useT();
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{labelHeader}</th>
            <th className="num">{t('account.usage.calls')}</th>
            <th className="num">{t('account.usage.inputTokens')}</th>
            <th className="num">{t('account.usage.outputTokens')}</th>
            {showCache && <th className="num">{t('account.usage.cacheWrite')}</th>}
            {showCache && <th className="num">{t('account.usage.cacheRead')}</th>}
            <th className="num">{t('account.usage.totalTokens')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="cell-title">{r.label}</td>
              <td className="num">{formatNumber(r.calls)}</td>
              <td className="num">{formatNumber(r.input_tokens)}</td>
              <td className="num">{formatNumber(r.output_tokens)}</td>
              {showCache && <td className="num">{formatNumber(r.cache_creation_tokens)}</td>}
              {showCache && <td className="num">{formatNumber(r.cache_read_tokens)}</td>}
              <td className="num">{formatNumber(r.total_tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
