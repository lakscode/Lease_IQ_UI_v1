// Small shared pieces for the lease pages.
import type { ReactNode } from 'react';
import { Badge } from '../../components/ui.tsx';
import { useT, type TFunction } from '../../i18n/index.tsx';
import { formatDate, formatMoney, formatNumber } from '../../lib/format.ts';
import type { DocType } from '../../api/types.ts';
import { ABSTRACT_FIELDS, type FileStatus, type LeaseAlert, type SignatureRecord } from './types.ts';

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

export function DocTypeBadge({ type }: { type: DocType | string }) {
  const t = useT();
  const tone = type === 'main_lease' ? 'primary' : type === 'amendment' || type === 'addendum' ? 'info' : 'neutral';
  return <Badge tone={tone}>{docTypeLabel(t, type)}</Badge>;
}

export function FileStatusBadge({ status }: { status: FileStatus }) {
  const t = useT();
  const tone = status === 'completed' ? 'success' : status === 'failed' ? 'danger' : status === 'processing' ? 'info' : 'neutral';
  return (
    <Badge tone={tone}>
      {(status === 'processing' || status === 'queued') && <span className="spinner spinner-inline lw-badge-spin" aria-hidden="true" />}
      {t(`leases.fileStatus.${status}`)}
    </Badge>
  );
}

export function SignatureBadge({ signature }: { signature: SignatureRecord | null | undefined }) {
  const t = useT();
  const status = signature?.status;
  if (!status) return <Badge tone="neutral">{t('leases.sig.notChecked')}</Badge>;
  const tone = status === 'signed' ? 'success' : status === 'partially_signed' ? 'warning' : status === 'unsigned' ? 'danger' : 'neutral';
  return <Badge tone={tone}>{t(`leases.sig.${status}`)}</Badge>;
}

export function alertText(t: TFunction, alert: LeaseAlert): string {
  const key = `leases.alert.${alert.code}`;
  const text = t(key);
  return text === key ? alert.message : text;
}

export function AlertList({ alerts, empty }: { alerts: LeaseAlert[]; empty?: ReactNode }) {
  const t = useT();
  if (!alerts.length) return <p className="muted">{empty ?? t('leases.alerts.none')}</p>;
  return (
    <ul className="lw-alerts">
      {alerts.map((a, i) => (
        <li key={`${a.code}-${i}`} className={`lw-alert lw-alert-${a.severity}`}>
          <Badge tone={a.severity === 'urgent' ? 'danger' : 'neutral'}>{t(`leases.severity.${a.severity}`)}</Badge>
          <span className="lw-alert-text">{alertText(t, a)}</span>
          {a.due_date && <span className="muted small">{formatDate(a.due_date)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Friendly message for API errors (AI/email not configured). */
export function errorText(t: TFunction, err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'ai_not_configured') return t('leases.err.aiNotConfigured');
  if (e?.code === 'email_not_configured') return t('leases.err.emailNotConfigured');
  return e?.message || t('common.error');
}
