// Shared bits for the intelligence area: types, AI-error handling, links and small badges.
import { Link } from 'react-router';
import { Alert, Badge } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { pdfHref } from './helpers.ts';
export type { CamTerms, LeaseDocumentOption, LeaseOption, RentPeriod } from './helpers.ts';
import './intelligence.css';

export function AiNotConfigured({ compact }: { compact?: boolean }) {
  const t = useT();
  return (
    <Alert tone="warning" title={compact ? undefined : t('intel.ai.notConfiguredTitle')}>
      {t('intel.ai.notConfiguredBody')}
    </Alert>
  );
}

export function PageLink({ leaseId, documentId, page, label, quote }: { leaseId: string; documentId: string; page?: number | null; label: string; quote?: string | null }) {
  return (
    <Link className="intel-chip" to={pdfHref(leaseId, documentId, page)} title={quote ?? undefined}>
      <span aria-hidden="true">📄</span> {label}
    </Link>
  );
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export function JobStatusBadge({ status }: { status: string }) {
  const t = useT();
  const tone: Tone = status === 'completed' ? 'success' : status === 'failed' ? 'danger' : status === 'processing' ? 'info' : 'neutral';
  return <Badge tone={tone}>{t(`intel.job.${status}`)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string | null }) {
  const t = useT();
  if (!priority) return null;
  const tone: Tone = priority === 'high' ? 'danger' : priority === 'medium' ? 'warning' : 'neutral';
  return <Badge tone={tone}>{t(`intel.priority.${priority}`)}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const t = useT();
  const tone: Tone = severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : 'neutral';
  return <Badge tone={tone}>{t(`intel.priority.${severity}`)}</Badge>;
}

