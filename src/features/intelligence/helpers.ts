// Non-component helpers and types for the intelligence pages (kept out of shared.tsx so it only exports
// components, as React Fast Refresh requires).
import { ApiError } from '../../api/client.ts';
import type { TFunction } from '../../i18n/index.tsx';

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

/** Lease workspace link that opens a document's PDF at a page. */
export function pdfHref(leaseId: string, documentId: string, page?: number | null): string {
  const qs = new URLSearchParams({ tab: 'documents', doc: documentId });
  if (page) qs.set('page', String(page));
  return `/leases/${leaseId}/details?${qs.toString()}`;
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
