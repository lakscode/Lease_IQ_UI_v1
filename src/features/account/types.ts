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
  /** How much of each document Claude reads: economy (text + signature pages) or quality (whole PDF). */
  ai_mode: 'economy' | 'quality';
  /** provider 'default' sends through an SMTP mailbox; 'sendgrid' through the SendGrid API. */
  email: {
    provider: 'default' | 'sendgrid';
    from_name: string;
    from_email: string;
    smtp_host: string;
    smtp_port: number;
    smtp_security: 'ssl' | 'starttls' | 'none';
    smtp_user: string;
  };
  /** An SMTP password is saved (never returned). */
  smtp_password_set: boolean;
  sendgrid_key_set: boolean;
  /** 'settings' = saved in Settings, 'environment' = SENDGRID_API_KEY on the server */
  sendgrid_key_source: 'settings' | 'environment' | null;
  /** Last 4 characters of the key in use */
  sendgrid_key_hint: string | null;
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
  /** Clause classifier chosen by super admins: Claude AI, local SVM, or a Vercel AI Gateway model (clause_model). */
  clause_classifier: ClauseClassifier;
  clause_model: string | null;
  /** AI provider for document processing; ai_model null = the provider's default. */
  ai_provider: AiProvider;
  ai_model: string | null;
}

export type AiProvider = 'claude' | 'openai';

export interface AiModelOption { id: string; label: string; note: string }

/** GET /admin/ai-providers: providers an organization can use, with their models. */
export interface AiProviderInfo {
  providers: AiProvider[];
  claude: { configured: boolean; default_model: string; models: AiModelOption[] };
  openai: { configured: boolean; default_model: string; models: AiModelOption[] };
}

export type ClauseClassifier = 'claude' | 'svm' | 'gateway' | 'langchain' | 'llama';

/** GET /admin/prediction-catalog: what the predictions use. */
export interface PredictionCatalog {
  fields: { key: string; label: string; kind: 'text' | 'longtext' | 'date' | 'number' | 'money'; group: string; lease_column: string | null }[];
  /** lease_clauses.json (SVM, LangChain, Llama). examples = SVM training rows (0 = no training data); svm_f1 = cross-validated F1. */
  lease_clauses: { id: string; name: string; examples: number; svm_f1: number | null }[];
  /** CLAUSE_TYPES (Claude, Vercel AI Gateway). */
  standard_clauses: string[];
  svm: { trained_at: string; clause_types: number; accuracy: number | null; macro_f1: number | null; cv_examples: number | null };
  orgs: { id: string; name: string; classifier: ClauseClassifier; model: string | null; ai_provider: AiProvider; ai_model: string | null }[];
}

export interface ClauseClassifierInfo {
  classifiers: ClauseClassifier[];
  claude: { configured: boolean; model: string };
  svm: { configured: boolean; trained_at: string; clause_types: number };
  /** Vercel AI Gateway health, shared by gateway / langchain / llama (ready = has credits to serve requests). */
  gateway_status: { configured: boolean; ready: boolean; balance: string | null; error: string | null };
  gateway: { configured: boolean; models: { id: string; name: string }[] };
  /** LangChain chain with any Vercel AI Gateway model. */
  langchain: { configured: boolean; default_model: string; models: { id: string; name: string }[] };
  /** Meta Llama via the Vercel AI SDK; models = the gateway's meta/llama* models. */
  llama: { configured: boolean; default_model: string; models: { id: string; name: string }[] };
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

export interface ErrorLogEntry {
  id: number;
  created_at: string;
  source: 'ui' | 'api';
  area: string;
  level: 'error' | 'warning';
  code: string | null;
  message: string;
  details: Record<string, unknown> | null;
  user_id: string | null;
  email: string | null;
  path: string | null;
  user_agent: string | null;
}

/** GET /api/logs/api (lib/api-request-log.ts). Summary counts ignore the outcome filter. */
export interface ApiRequestLog {
  summary: {
    total: number; success: number; client_errors: number; server_errors: number;
    /** timing of the rows returned, not of every matching request */
    avg_ms: number | null; p95_ms: number | null; sample: number;
  };
  rows: {
    id: number; created_at: string; method: string; path: string; query: string | null; status: number; duration_ms: number;
    user_id: string | null; email: string | null; org_id: string | null; org_name: string | null;
    error_code: string | null; error_message: string | null; ip: string | null; user_agent: string | null; runtime: string | null;
  }[];
}
