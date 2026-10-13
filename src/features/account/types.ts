// Response types for the account & administration API.
import type { Role } from '../../api/types.ts';

export interface OrgDetails {
  id: string;
  name: string;
  currency: string;
  logo_url: string | null;
  created_at: string;
  member_count: number;
  role: Role;
  currencies: string[];
}

export interface Member {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  is_super_admin: boolean;
  created_at: string;
}

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invite {
  id: string;
  email: string;
  role: Role;
  status: InviteStatus;
  expires_at: string;
  email_sent: boolean;
  created_at: string;
  accepted_at: string | null;
  invited_by: string | null;
}

export interface InviteResult {
  status: 'added' | 'already_member' | 'invited' | 'invited_no_email';
  email: string;
  user_id?: string;
  invite_id?: string;
  link?: string;
  email_error?: string;
}

export interface ImportRow {
  row: number;
  email: string;
  role: string;
  status: InviteResult['status'] | 'failed';
  reason?: string;
  link?: string;
}

export interface ImportResponse {
  summary: Record<ImportRow['status'], number>;
  results: ImportRow[];
}

export interface InvitePreview {
  org_name: string | null;
  org_logo_url: string | null;
  email: string;
  role: Role;
  status: InviteStatus;
  expires_at: string;
  invited_by: string | null;
}

export interface UsageTotals {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  duration_ms: number;
}

export interface UsageReportData {
  from: string;
  to: string;
  org_id: string | null;
  totals: UsageTotals;
  by_day: (UsageTotals & { date: string })[];
  by_org: (UsageTotals & { org_id: string | null; org_name: string })[];
  by_user: (UsageTotals & { user_id: string | null; email: string })[];
  by_model: (UsageTotals & { model: string })[];
  by_process: (UsageTotals & { process: string })[];
}

export interface AdminSettings {
  ai_model: string;
  default_model: string;
  models: { id: string; label: string; note: string }[];
  ai_configured: boolean;
  email: { provider: 'default' | 'sendgrid'; from_name: string; from_email: string };
  sendgrid_key_set: boolean;
  email_configured: boolean;
}

export interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  is_super_admin: boolean;
  providers: string[];
  email_confirmed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  orgs: { org_id: string; org_name: string; role: Role }[];
}

export interface AdminOrg {
  id: string;
  name: string;
  currency: string;
  logo_url: string | null;
  created_at: string;
  member_count: number;
  lease_count: number;
  file_count: number;
  document_count: number;
  domains: string[];
}

export interface AdminDomain {
  id: string;
  org_id: string;
  org_name: string | null;
  domain: string;
  default_role: Role;
  ms_tenant_id: string | null;
  created_at: string;
}

export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'CNY', 'HKD', 'SGD',
  'INR', 'ZAR', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'AED', 'SAR',
];

export const ROLES: Role[] = ['admin', 'editor', 'viewer'];

/** Only same-app relative paths are allowed as post-login destinations. */
export function safeNext(value: string | null | undefined): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}
