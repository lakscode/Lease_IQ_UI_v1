// API shapes used by the lease pages (see API routes/files.ts and routes/leases.ts).
import type { DocType, LeaseStatus } from '../../api/types.ts';

export type FileStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface PipelineStep {
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  started_at?: string | null;
  finished_at?: string | null;
  detail?: string | null;
}

export interface TokenRun {
  process: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
}

export interface FileDoc {
  id: string;
  file_id: string;
  doc_type: DocType;
  title: string | null;
  lease_id: string | null;
  page_start: number | null;
  page_end: number | null;
  tenant_name: string | null;
  premises_address: string | null;
  /** The lease's current (as amended) expiration date and status (absent from older API versions). */
  expiration_date?: string | null;
  lease_status?: LeaseStatus | null;
}

export interface LeaseFile {
  id: string;
  file_name: string;
  file_size: number | null;
  sha256: string | null;
  page_count: number | null;
  is_scanned: boolean | null;
  source: string;
  target_lease_id: string | null;
  status: FileStatus;
  error: string | null;
  steps: PipelineStep[];
  created_at: string;
  processed_at: string | null;
  uploaded_by_name: string | null;
  locked: boolean;
  documents: FileDoc[];
  tokens: TokenRun[];
}

export interface FilesResponse {
  summary: { files: number; documents: number; processing: number; needs_attention: number };
  files: LeaseFile[];
  ai_configured: boolean;
}

export interface LeaseListItem {
  id: string;
  tenant_name: string | null;
  landlord_name: string | null;
  premises_address: string | null;
  rentable_area: number | null;
  commencement_date: string | null;
  expiration_date: string | null;
  base_rent_monthly: number | null;
  status: LeaseStatus;
  property_type: string | null;
  risk_score: number | null;
  document_count: number;
  main_document_id: string | null;
  updated_at: string;
  /** First lease this one is listed under (same "Add amendment" upload or split PDF); absent from older APIs. */
  parent_lease_id?: string | null;
  /** Review after abstraction (absent from older APIs; null when not started). */
  review?: { status: ReviewStatus; summary: ReviewSummary | null } | null;
}

export interface TermValue {
  value: string | number;
  source_document_id: string;
  source_title: string | null;
  source_doc_type: DocType;
}

export interface SignatureRecord {
  status?: 'signed' | 'partially_signed' | 'unsigned' | 'unclear';
  method?: string;
  parties?: { party: string; signer: string | null; date: string | null }[];
  signature_pages?: number[];
  notes?: string | null;
  checked_at?: string;
}

export interface LeaseDocument {
  id: string;
  doc_type: DocType;
  title: string | null;
  effective_date: string | null;
  page_start: number | null;
  page_end: number | null;
  page_count: number | null;
  file_id: string | null;
  file_name: string | null;
  changes_made: string | null;
  summary: string | null;
  signature: SignatureRecord | null;
  sha256: string | null;
  has_pdf: boolean;
  is_scanned: boolean | null;
  abstract: Record<string, unknown> & { pages?: Record<string, number> };
  created_at: string;
}

export interface LeaseAlert {
  code: string;
  severity: 'urgent' | 'normal';
  message: string;
  due_date?: string | null;
}

export interface LeaseDetail {
  lease: LeaseListItem & { current_terms: Record<string, TermValue> };
  documents: LeaseDocument[];
  alerts: LeaseAlert[];
  notice_by: string | null;
}

/** 'user': marked by a user on the PDF (not a classifier; kept when the document is re-classified). */
export type ClauseSource = 'claude' | 'svm' | 'gateway' | 'langchain' | 'llama' | 'user';

export interface ClauseItem {
  id: string;
  document_id: string;
  document_title: string | null;
  doc_type: DocType | null;
  clause_type: string;
  /** Classifier that produced the clause: Claude AI, the local SVM model, or a Vercel AI Gateway model. */
  source: ClauseSource;
  /** Model that produced the clause (Claude model id, gateway / Llama model id, or SVM version). */
  model: string | null;
  /** Predicted type when a user changed it (null when the type is the prediction). */
  original_clause_type: string | null;
  verified: boolean;
  /** Removed by a user (hidden unless "show removed"). */
  dismissed: boolean;
  edited_at: string | null;
  confidence: number | null;
  alt_types: { type: string; confidence: number }[] | null;
  section: string | null;
  page: number | null;
  paragraph: number | null;
  line: number | null;
  text: string | null;
  /** User clauses: highlight on the page (0..1 of the page), and who added it. */
  rects?: { x: number; y: number; w: number; h: number }[] | null;
  created_by_name?: string | null;
}

/** GET /leases/:id/clauses */
export interface ClauseGroup { clause_type: string; clauses: ClauseItem[] }

export interface EditEntry {
  id: number;
  document_id: string;
  document_title: string | null;
  doc_type: DocType | null;
  field: string;
  field_label: string;
  old_value: unknown;
  new_value: unknown;
  edited_at: string;
  edited_by: string | null;
}

export interface AccessEntry {
  id: number;
  action: string;
  document_id: string | null;
  file_id: string | null;
  user_name: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface ProcessingLog {
  id: number;
  file_id?: string;
  step: string | null;
  level: 'info' | 'warn' | 'error';
  message: string;
  created_at: string;
}

/** One change to a predicted clause (clause_edits). */
export interface ClauseEditEntry {
  id: number;
  document_id: string;
  document_title: string | null;
  doc_type: DocType | null;
  clause_id: string | null;
  clause_text: string | null;
  action: 'type' | 'verify' | 'unverify' | 'dismiss' | 'restore' | 'add' | 'delete';
  old_value: string | null;
  new_value: string | null;
  edited_at: string;
  edited_by: string | null;
}

export interface ActivityResponse {
  files: { id: string; file_name: string; status: FileStatus; error: string | null; steps: PipelineStep[]; page_count: number | null; is_scanned: boolean | null; created_at: string; processed_at: string | null; logs: ProcessingLog[] }[];
  edits: EditEntry[];
  clause_edits: ClauseEditEntry[];
  usage: { file_id: string | null; file_name: string | null; process: string; model: string; calls: number; input_tokens: number; output_tokens: number; cache_tokens: number; duration_ms: number }[];
}

export type FieldKind = 'text' | 'longtext' | 'date' | 'number' | 'money';
export type FieldGroup = 'parties' | 'property' | 'dates' | 'rent' | 'options' | 'other';

/** Mirror of API lib/abstract.ts ABSTRACT_FIELDS (labels come from i18n: leases.field.<key>). */
export const ABSTRACT_FIELDS: { key: string; kind: FieldKind; group: FieldGroup }[] = [
  { key: 'landlord', kind: 'text', group: 'parties' },
  { key: 'tenant', kind: 'text', group: 'parties' },
  { key: 'guarantor', kind: 'text', group: 'parties' },
  { key: 'premises_address', kind: 'text', group: 'property' },
  { key: 'property_name', kind: 'text', group: 'property' },
  { key: 'rentable_area', kind: 'number', group: 'property' },
  { key: 'permitted_use', kind: 'longtext', group: 'property' },
  { key: 'commencement_date', kind: 'date', group: 'dates' },
  { key: 'expiration_date', kind: 'date', group: 'dates' },
  { key: 'term_months', kind: 'number', group: 'dates' },
  { key: 'base_rent_monthly', kind: 'money', group: 'rent' },
  { key: 'base_rent_annual', kind: 'money', group: 'rent' },
  { key: 'rent_escalations', kind: 'longtext', group: 'rent' },
  { key: 'security_deposit', kind: 'money', group: 'rent' },
  { key: 'operating_expenses', kind: 'longtext', group: 'rent' },
  { key: 'renewal_options', kind: 'longtext', group: 'options' },
  { key: 'renewal_notice_window', kind: 'text', group: 'options' },
  { key: 'renewal_notice_months', kind: 'number', group: 'options' },
  { key: 'termination_options', kind: 'longtext', group: 'options' },
  { key: 'changes_made', kind: 'longtext', group: 'other' },
];

export const FIELD_GROUPS: FieldGroup[] = ['parties', 'property', 'dates', 'rent', 'options', 'other'];

// ---- Review (GET /leases/:id/review; checklist in API lib/review-checklist.json) ----

export type ReviewStatus = 'in_progress' | 'completed';
export type FieldVerdict = 'correct' | 'incorrect' | 'not_applicable';
export type ClauseVerdict = 'correct' | 'incorrect' | 'missing' | 'not_applicable';
export type CheckStatus = 'ok' | 'missing' | 'not_found' | 'invalid' | 'warning' | 'low_confidence';

export interface ReviewSummary { issues: number; reviewed: number; total: number; correct: number; incorrect: number }

export interface ReviewCheck { status: CheckStatus; messages: { code: string; params?: Record<string, string | number> }[] }

interface ReviewVerdictInfo<V> { verdict: V | null; note: string | null; reviewed_by_name: string | null; reviewed_at: string | null }

export interface ReviewFieldItem extends ReviewVerdictInfo<FieldVerdict> {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  value: string | number | null;
  source_document_id: string | null;
  source_title: string | null;
  source_doc_type: DocType | null;
  page: number | null;
  auto: ReviewCheck;
  ai: { status: 'correct' | 'incorrect' | 'not_in_document'; correct_value: string | null; document_id: string | null; page: number | null; note: string } | null;
}

export interface ReviewClauseItem extends ReviewVerdictInfo<ClauseVerdict> {
  name: string;
  required: boolean;
  match: string[];
  found: number;
  verified: number;
  best_confidence: number | null;
  pages: number[];
  samples: { id: string; document_id: string; document_title: string | null; clause_type: string; page: number | null; confidence: number | null; verified: boolean; text: string }[];
  auto: ReviewCheck;
  ai: { present: boolean; document_id: string | null; page: number | null; note: string } | null;
}

export interface ReviewResponse {
  review: {
    id: string;
    status: ReviewStatus;
    started_by_name: string | null;
    completed_by_name: string | null;
    completed_at: string | null;
    ai_checked_at: string | null;
    updated_at: string;
  } | null;
  min_clause_confidence: number;
  fields: ReviewFieldItem[];
  clauses: ReviewClauseItem[];
  extra_clauses: { clause_type: string; count: number }[];
  summary: ReviewSummary & {
    fields_total: number;
    fields_found: number;
    fields_required_missing: number;
    clauses_total: number;
    clauses_found: number;
    clauses_required_missing: number;
    ai_disagreements: number;
  };
}
