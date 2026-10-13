// Shared chart pieces for the analytics pages (recharts 3). Colors come from the --chart-* CSS variables so
// light and dark mode both work. Every chart card has a table view (values never gated behind hover).
import { useState, type ReactNode } from 'react';
import { Card, cx } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';

export const AXIS_TICK = { fill: 'var(--muted)', fontSize: 12 };
export const GRID_STROKE = 'var(--chart-grid)';
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
export const HBAR_RADIUS: [number, number, number, number] = [0, 4, 4, 0];
export const MAX_BAR = 24;

/** Compact numbers for axis ticks: 1.2K, 3.4M (money keeps its currency symbol). */
export function compact(value: number, currency?: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
      ...(currency ? { style: 'currency', currency, currencyDisplay: 'narrowSymbol' } : {}),
    }).format(value);
  } catch {
    return String(value);
  }
}

/** Chart card with a Chart / Table toggle. */
export function ChartCard({ title, subtitle, table, children, actions, className }: {
  title: ReactNode;
  subtitle?: ReactNode;
  table: { headers: ReactNode[]; rows: ReactNode[][]; numeric?: number[] };
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Card
      className={cx('an-chart-card', className)}
      title={
        <span className="an-chart-title">
          {title}
          {subtitle && <span className="an-chart-sub">{subtitle}</span>}
        </span>
      }
      actions={
        <>
          {actions}
          <div className="an-seg" role="group" aria-label={t('analytics.chart.view')}>
            <button type="button" className={cx(view === 'chart' && 'on')} aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
              {t('analytics.chart.chart')}
            </button>
            <button type="button" className={cx(view === 'table' && 'on')} aria-pressed={view === 'table'} onClick={() => setView('table')}>
              {t('analytics.chart.table')}
            </button>
          </div>
        </>
      }
    >
      {view === 'chart' ? (
        children
      ) : (
        <div className="table-wrap an-chart-table">
          <table className="table">
            <thead>
              <tr>{table.headers.map((h, i) => <th key={i} className={cx(table.numeric?.includes(i) && 'num')}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.length === 0 && (
                <tr><td colSpan={table.headers.length} className="muted">{t('common.noResults')}</td></tr>
              )}
              {table.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className={cx(table.numeric?.includes(j) && 'num')}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

interface TipPayload {
  value?: number | string;
  name?: string | number;
  color?: string;
  payload?: Record<string, unknown>;
}

/** Tooltip body: values lead (bold), labels follow; series keyed by a short line in the series color. */
export function ChartTip({ active, payload, label, title, rows }: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
  title?: (label: string | number | undefined, datum: Record<string, unknown> | undefined) => ReactNode;
  rows: (datum: Record<string, unknown>) => { value: ReactNode; label: ReactNode; color?: string }[];
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  return (
    <div className="an-tip">
      <div className="an-tip-title">{title ? title(label, datum) : label}</div>
      {rows(datum).map((r, i) => (
        <div className="an-tip-row" key={i}>
          {r.color && <span className="an-tip-key" style={{ background: r.color }} aria-hidden="true" />}
          <strong>{r.value}</strong>
          <span className="muted">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Two-option segmented control (e.g. rent / count) — one measure per chart, never a second axis. */
export function Segmented<K extends string>({ value, options, onChange, label }: {
  value: K;
  options: { key: K; label: ReactNode }[];
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div className="an-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" className={cx(value === o.key && 'on')} aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Horizontal meter (0–1) for coverage / scores. */
export function Meter({ value, tone = 'primary', label }: { value: number; tone?: 'primary' | 'success' | 'warning' | 'danger'; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cx('an-meter', `an-meter-${tone}`)} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <div className="an-meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
