// Fund administration API shapes (API routes/fund.ts, routes/fund-transactions.ts, lib/fund-accounts.ts).

export const FUND_STATUSES = ['fundraising', 'active', 'harvesting', 'closed'] as const;
export const INVESTOR_TYPES = ['institution', 'pension', 'endowment', 'family_office', 'individual', 'fund_of_funds', 'gp', 'other'] as const;
export const CALL_PURPOSES = ['investment', 'management_fee', 'expenses', 'other'] as const;
export const DISTRIBUTION_TYPES = ['income', 'return_of_capital', 'capital_gain', 'other'] as const;

export type FundStatus = (typeof FUND_STATUSES)[number];
export type InvestorType = (typeof INVESTOR_TYPES)[number];
export type CallPurpose = (typeof CALL_PURPOSES)[number];
export type DistributionType = (typeof DISTRIBUTION_TYPES)[number];
export type CallStatus = 'paid' | 'partial' | 'open' | 'overdue';

export interface Fund {
  id: string; name: string; strategy: string | null; vintage_year: number | null; inception_date: string | null;
  target_size: number | null; status: FundStatus; management_fee_pct: number | null; carry_pct: number | null;
  hurdle_pct: number | null; notes: string | null; created_at: string; updated_at: string;
}

export interface FundMetrics {
  commitments: number; called: number; paid_in: number; receivable: number; uncalled: number; distributed: number;
  nav: number | null; nav_date: string | null; dpi: number | null; rvpi: number | null; tvpi: number | null;
  investors: number; properties: number; called_pct: number | null;
}

export type FundWithMetrics = Fund & { metrics: FundMetrics };

export interface CapitalAccount {
  investor_id: string; investor_name: string; investor_type: InvestorType; commitment: number; ownership_pct: number;
  called: number; paid_in: number; receivable: number; uncalled: number; distributed: number; nav_share: number | null;
}

export interface Commitment { id: string; fund_id: string; investor_id: string; amount: number; commitment_date: string | null }

export interface CapitalCall {
  id: string; fund_id: string; call_number: number; call_date: string; due_date: string | null; amount: number;
  purpose: CallPurpose; notes: string | null; created_at: string;
}
export type CapitalCallRow = CapitalCall & { fund_name: string; investors: number; status: CallStatus; paid: number };
export interface CallAllocation {
  id: string; call_id: string; investor_id: string; investor_name: string; amount: number; paid_amount: number;
  paid_date: string | null; outstanding: number;
}
export type CapitalCallDetail = CapitalCall & { fund_name: string; status: CallStatus; paid: number; allocations: CallAllocation[] };

export interface Distribution {
  id: string; fund_id: string; distribution_number: number; distribution_date: string; amount: number;
  distribution_type: DistributionType; notes: string | null; created_at: string;
}
export type DistributionRow = Distribution & { fund_name: string; investors: number };
export type DistributionDetail = Distribution & {
  fund_name: string; allocations: { id: string; investor_id: string; investor_name: string; amount: number }[];
};

export interface Valuation { id: string; fund_id: string; as_of_date: string; nav: number; notes: string | null; created_at: string }
export type ValuationRow = Valuation & { fund_name: string };

export interface FundLease {
  id: string; tenant_name: string | null; landlord_name: string | null; premises_address: string | null;
  property_type: string | null; rentable_area: number | null; base_rent_monthly: number | null;
  expiration_date: string | null; status: 'active' | 'expiring' | 'expired' | 'renewed' | 'unknown';
}

export interface FundDetail {
  fund: Fund;
  metrics: FundMetrics;
  accounts: CapitalAccount[];
  commitments: (Commitment & { investor_name: string })[];
  calls: (CapitalCall & { status: CallStatus; paid: number })[];
  distributions: Distribution[];
  valuations: Valuation[];
  leases: FundLease[];
}

export interface Investor {
  id: string; name: string; investor_type: InvestorType; contact_name: string | null; email: string | null;
  phone: string | null; notes: string | null; created_at: string;
}
export type InvestorRow = Investor & {
  commitments: (Commitment & { fund_name: string })[];
  total_commitment: number; paid_in: number; receivable: number; distributed: number;
};

export interface FundOverview {
  totals: {
    funds: number; investors: number; commitments: number; called: number; paid_in: number; receivable: number;
    uncalled: number; distributed: number; nav: number | null; dpi: number | null; tvpi: number | null;
  };
  funds: FundWithMetrics[];
  open_calls: (CapitalCall & { fund_name: string; status: CallStatus; paid: number })[];
  recent_distributions: (Distribution & { fund_name: string })[];
}
