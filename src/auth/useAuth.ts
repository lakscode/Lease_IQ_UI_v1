// Auth context and hook. The <AuthProvider> component lives in AuthProvider.tsx, so this module exports no
// components (React Fast Refresh).
import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AppConfig, MeResponse, MyOrg, Role } from '../api/types.ts';

export interface AuthValue {
  /** null while the initial session check runs */
  ready: boolean;
  session: Session | null;
  me: MeResponse | null;
  meError: string | null;
  config: AppConfig | null;
  orgs: MyOrg[];
  activeOrg: MyOrg | null;
  role: Role | null;
  isSuperAdmin: boolean;
  /** admin or editor in the active org */
  canEdit: boolean;
  isOrgAdmin: boolean;
  currency: string;
  switchOrg: (orgId: string) => void;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
