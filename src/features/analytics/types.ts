// Response types for the analytics API (/api/dashboard, /api/portfolio, /api/reports, /api/imports).
import type { LeaseStatus } from '../../api/types.ts';

export interface DashboardData {
  as_of: string;
  health: { active: number; expiring: number; expired: number; unknown: number };
  tiles: { total: number; expiring_90_days: number; expiring_12_months: number; renewed: number; expired: number };
  expirations_by_quarter: { quarter: string; count: number; annual_rent: number }[];
  rent_outlook: { month: string; rent: number }[];
  timeline: { id: string; tenant_name: string | null; start: string | null; end: string | null; status: LeaseStatus }[];
  documents_by_type: { doc_type: string; count: number }[];
  upcoming_expirations: {
    id: string;
    tenant_name: string | null;
    premises_address: string | null;
    expiration_date: string;
    days_left: number;
    urgency: 'urgent' | 'soon' | 'upcoming';
    monthly_rent: number | null;
    status: LeaseStatus;
  }[];
}

export interface RiskReason {
  code: string;
  points: number;
  params?: Record<string, string | number>;
}

export interface RentRollRow {
  id: string;
  tenant_name: string | null;
  landlord_name: string | null;
  premises_address: string | null;
  property_type: string | null;
  rentable_area: number | null;
  commencement_date: string | null;
  expiration_date: string | null;
  monthly_rent: number | null;
  annual_rent: number | null;
  rent_psf: number | null;
  security_deposit: number | null;
  status: LeaseStatus;
  notice_by: string | null;
  risk_score: number | null;
}

export interface PortfolioData {
  as_of: string;
  kpis: {
    lease_count: number;
    in_place_count: number;
    annual_base_rent: number;
    leased_area: number;
    avg_rent_psf: number | null;
    walt_years: number | null;
    tenant_count: number;
  };
  rent_expiring_by_year: { year: string; annual_rent: number; count: number }[];
  concentration: { tenant: string; annual_rent: number; share: number }[];
  coverage: { field: string; present: number; total: number; pct: number }[];
  rent_roll: RentRollRow[];
  non_renewals: {
    id: string;
    tenant_name: string | null;
    premises_address: string | null;
    expiration_date: string | null;
    annual_rent: number | null;
    reason: 'notice_received' | 'expired' | 'notice_passed' | 'no_option';
    date: string | null;
  }[];
  risk: {
    id: string;
    tenant_name: string | null;
    premises_address: string | null;
    expiration_date: string | null;
    status: LeaseStatus;
    market_rate_psf: number | null;
    score: number;
    reasons: RiskReason[];
  }[];
}

export type RenewalStatus = 'renewed' | 'notice_received' | 'option_available' | 'notice_passed' | 'no_option' | 'expired';

export interface ExpiringData {
  months: number;
  until: string;
  total_annual_rent: number;
  rows: {
    id: string;
    tenant_name: string | null;
    premises_address: string | null;
    expiration_date: string;
    days_left: number;
    annual_rent: number | null;
    renewal_status: RenewalStatus;
    has_renewal_option: boolean;
    notice_by: string | null;
    status: LeaseStatus;
  }[];
}

export interface ReportRow {
  id: string;
  tenant_name: string | null;
  landlord_name: string | null;
  premises_address: string | null;
  commencement_date: string | null;
  expiration_date: string | null;
  annual_rent: number | null;
  monthly_rent: number | null;
  status: LeaseStatus;
}

export interface ReportData {
  as_of: string;
  total: number;
  rows: ReportRow[];
  totals: { count: number; annual_rent: number; monthly_rent: number };
  options: { tenants: string[]; landlords: string[] };
  charts: {
    by_status: { status: LeaseStatus; count: number }[];
    expirations_by_year: { year: string; count: number; annual_rent: number }[];
    rent_by_landlord: { landlord: string; annual_rent: number }[];
  };
}

export const RENT_ROLL_FIELDS = [
  'tenant', 'external_id', 'property', 'unit', 'status', 'start_date', 'end_date', 'area',
  'monthly_base_rent', 'annual_base_rent', 'cam', 'tax', 'insurance', 'other_charges', 'security_deposit',
  'next_escalation_date', 'next_escalation_rent',
] as const;
export type RentRollField = (typeof RENT_ROLL_FIELDS)[number];
export type ColumnMapping = Partial<Record<RentRollField, string | null>>;

export interface RentRollRecord {
  id: string;
  import_id: string;
  lease_id: string | null;
  match_confidence: number | null;
  tenant: string | null;
  external_id: string | null;
  property: string | null;
  unit: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  area: number | null;
  monthly_base_rent: number | null;
  annual_base_rent: number | null;
  cam: number | null;
  tax: number | null;
  insurance: number | null;
  other_charges: number | null;
  security_deposit: number | null;
  next_escalation_date: string | null;
  next_escalation_rent: number | null;
  charge_codes: Record<string, number> | null;
  raw: Record<string, string> | null;
  lease_tenant_name?: string | null;
  lease_premises?: string | null;
}

export type ImportSource = 'yardi' | 'mri' | 'csv';

export interface RentRollImport {
  id: string;
  source: ImportSource;
  file_name: string | null;
  mapping: { columns?: ColumnMapping; header_row?: number; charge_columns?: string[]; skipped_rows?: number } | null;
  row_count: number;
  matched_count: number;
  created_at: string;
}

export interface ImportPreview {
  delimiter: string;
  header_row: number;
  headers: string[];
  mapping: ColumnMapping;
  charge_columns: string[];
  row_count: number;
  skipped_rows: number;
  matched_in_sample: number;
  sample: (Omit<RentRollRecord, 'id' | 'import_id' | 'lease_id' | 'raw'> & {
    match_lease_id: string | null;
    match_tenant: string | null;
    match_confidence: number | null;
  })[];
}

export interface SystemRecordResponse {
  record: RentRollRecord | null;
  import: { id: string; source: ImportSource; file_name: string | null; created_at: string } | null;
  comparison: { field: string; label: string; lease_value: string | number | null; system_value: string | number | null; match: boolean | null }[];
}
