// Text helpers for the lease pages (labels, value formatting, alert, error and step messages).
// Kept apart from shared.tsx so that module only exports components (required for React Fast Refresh).
import type { TFunction } from '../../i18n/index.tsx';
import { formatDate, formatMoney, formatNumber } from '../../lib/format.ts';
import type { DocType } from '../../api/types.ts';
import { ABSTRACT_FIELDS, type LeaseAlert } from './types.ts';

export function fieldLabel(t: TFunction, key: string): string {
  return t(`leases.field.${key}`);
}

export function docTypeLabel(t: TFunction, type: DocType | string | null | undefined): string {
  return type ? t(`leases.docType.${type}`) : '—';
}

/** Display a term/abstract value by field kind. */
export function formatFieldValue(key: string, value: unknown, currency: string): string {
  if (value === null || value === undefined || value === '') return '—';
  const kind = ABSTRACT_FIELDS.find((f) => f.key === key)?.kind;
  if (kind === 'money') return formatMoney(value as number, currency, 2);
  if (kind === 'date') return formatDate(String(value));
  if (kind === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? formatNumber(n, Number.isInteger(n) ? 0 : 2) : String(value);
  }
  return String(value);
}

export function documentName(t: TFunction, doc: { title: string | null; doc_type: DocType | string | null }): string {
  return doc.title || docTypeLabel(t, doc.doc_type);
}

export function alertText(t: TFunction, alert: LeaseAlert): string {
  const key = `leases.alert.${alert.code}`;
  const text = t(key);
  return text === key ? alert.message : text;
}

/** Friendly message for API errors (AI/email not configured). */
export function errorText(t: TFunction, err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'ai_not_configured') return t('leases.err.aiNotConfigured');
  if (e?.code === 'email_not_configured') return t('leases.err.emailNotConfigured');
  return e?.message || t('common.error');
}

/** Label of a processing pipeline step ("ocr:1-20", "abstract:0", "split", ...). */
export function stepLabel(t: TFunction, name: string): string {
  const [base, arg] = name.split(':');
  if (base === 'ocr') return t('leases.step.ocr', { pages: arg ?? '' });
  if (base === 'abstract') return t('leases.step.abstract', { n: Number(arg ?? 0) + 1 });
  return t(`leases.step.${base}`);
}
