// Shared chart styling constants and number formatting for the analytics pages (kept out of charts.tsx so it
// only exports components, as React Fast Refresh requires).

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
