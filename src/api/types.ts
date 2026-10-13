// Shared API response types. Feature-specific types live next to their feature.

export type Role = 'admin' | 'editor' | 'viewer';
export type LeaseStatus = 'active' | 'expiring' | 'expired' | 'renewed' | 'unknown';
export type DocType = 'main_lease' | 'amendment' | 'addendum' | 'commencement_letter' | 'other';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  is_super_admin: boolean;
  default_org_id: string | null;
  locale: 'en' | 'de' | 'es' | 'pt' | 'it';
  created_at: string;
}

export interface MyOrg {
  id: string;
  name: string;
  currency: string;
  logo_url: string | null;
  role: Role;
  via_super_admin: boolean;
}

export interface MeResponse {
  user: {
    id: string;
    email: string | undefined;
    providers: string[];
    created_at: string;
    last_sign_in_at: string | null;
  };
  profile: Profile;
  orgs: MyOrg[];
  active_org_id: string | null;
}

export interface AppConfig {
  ai: boolean;
  email: boolean;
  jira: boolean;
  maxUploadMb: number;
}
