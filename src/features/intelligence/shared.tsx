// Shared bits for the intelligence area: types, AI-error handling, links and small badges.
import { Link } from 'react-router';
import { ApiError } from '../../api/client.ts';
import { Alert, Badge } from '../../components/ui.tsx';
import { useT, type TFunction } from '../../i18n/index.tsx';
import './intelligence.css';

export interface LeaseOption {
  id: string;
  tenant_name: string | null;
  premises_address: string | null;
}

export interface LeaseDocumentOption {
  id: string;
  title: string | null;
  doc_type: string;
  page_count: number | null;
}

export interface RentPeriod {
  start: string;
  end: string | null;
  monthly_rent: number | null;
  annual_rent: number | null;
  rent_psf: number | null;
  abatement: boolean;
  abatement_pct: number | null;
  note: string | null;
}

export interface CamTerms {
  pro_rata_share: number | null;
  admin_fee_pct: number | null;
  gross_up_pct: number | null;
  cap_pct: number | null;
  cap_cumulative: boolean | null;
  cap_controllable_only: boolean | null;
  base_year: number | null;
  notes: string | null;
}

export function isAiNotConfigured(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'ai_not_configured';
}

/** User-facing message for an error, with a friendly text for the "AI not configured" case. */
export function errorText(t: TFunction, err: unknown): string {
  if (isAiNotConfigured(err)) return t('intel.ai.notConfiguredBody');
  return (err as Error)?.message || t('common.error');
}

export function AiNotConfigured({ compact }: { compact?: boolean }) {
  const t = useT();
  return (
    <Alert tone="warning" title={compact ? undefined : t('intel.ai.notConfiguredTitle')}>
      {t('intel.ai.notConfiguredBody')}
    </Alert>
  );
}

/** Lease workspace link that opens a document's PDF at a page. */
export function pdfHref(leaseId: string, documentId: string, page?: number | null): string {
  const qs = new URLSearchParams({ tab: 'documents', doc: documentId });
  if (page) qs.set('page', String(page));
  return `/leases/${leaseId}/details?${qs.toString()}`;
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

/** Parse a user-entered number ("1,234.50", "") → number | null. */
export function parseNum(value: string): number | null {
  const v = value.trim().replace(/[\s,]/g, '');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const numStr = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(v));

export function leaseLabel(l: LeaseOption): string {
  return [l.tenant_name, l.premises_address].filter(Boolean).join(' — ') || l.id.slice(0, 8);
}
