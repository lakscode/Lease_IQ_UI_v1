// Small shared components for the lease pages (text helpers live in labels.ts).
import type { ReactNode } from 'react';
import { Badge } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDate } from '../../lib/format.ts';
import type { DocType } from '../../api/types.ts';
import type { AiProvider, FileStatus, LeaseAlert, SignatureRecord } from './types.ts';
import { alertText, docTypeLabel } from './labels.ts';
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

/** Which AI provider (and model) abstracted a lease or document. */
export function AiProviderBadge({ provider, model, showModel = true }: { provider: AiProvider | null | undefined; model?: string | null; showModel?: boolean }) {
  const t = useT();
  if (!provider) return null;
  const name = t(`leases.ai.${provider}`);
  return (
    <Badge tone={provider === 'openai' ? 'success' : 'neutral'} title={t('leases.ai.hint', { provider: name, model: model ?? t('leases.ai.unknownModel') })}>
      {name}{showModel && model ? ` · ${model}` : ''}
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
