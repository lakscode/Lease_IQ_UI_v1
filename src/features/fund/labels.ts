// Fund administration display helpers (no components here: React Fast Refresh).
import type { Tone } from '../../components/ui-utils.ts';
import type { CallStatus, FundStatus } from './types.ts';

export const CALL_STATUS_TONE: Record<CallStatus, Tone> = { paid: 'success', partial: 'info', open: 'neutral', overdue: 'danger' };
export const FUND_STATUS_TONE: Record<FundStatus, Tone> = { fundraising: 'info', active: 'success', harvesting: 'warning', closed: 'neutral' };

/** DPI/RVPI/TVPI style multiple: 1.25x, or — when there is nothing to divide by. */
export function formatMultiple(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(2)}x`;
}

/** Form value for an optional number field. */
export const numText = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));

/** Optional number from a form field: '' → null. */
export const numOrNull = (value: string) => (value.trim() === '' ? null : Number(value));
