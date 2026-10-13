// Session (Supabase, per tab) + who-am-I (/api/me) + active organization.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.ts';
import { get, setActiveOrgId } from '../api/client.ts';
import type { AppConfig, MeResponse, MyOrg, Role } from '../api/types.ts';
import { useI18n, LOCALES, type Locale } from '../i18n/index.tsx';

const ORG_KEY = 'leaseiq.activeOrg';

interface AuthValue {
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

const AuthContext = createContext<AuthValue | null>(null);

function readStoredOrg(): string | null {
  try {
    return sessionStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useI18n();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(readStoredOrg);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    get<AppConfig>('/config').then(setConfig).catch(() => setConfig(null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const data = await get<MeResponse>('/me');
      setMe(data);
      setMeError(null);
      setActiveOrgIdState((current) => {
        const valid = current && data.orgs.some((o) => o.id === current) ? current : data.active_org_id;
        setActiveOrgId(valid);
        return valid;
      });
    } catch (err) {
      setMeError((err as Error).message);
    }
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (userId) {
      refreshMe();
    } else {
      setMe(null);
      setActiveOrgId(null);
    }
  }, [userId, refreshMe]);

  // The profile's language wins when it loads.
  const profileLocale = me?.profile.locale;
  useEffect(() => {
    if (profileLocale && profileLocale !== locale && (LOCALES as readonly string[]).includes(profileLocale)) {
      setLocale(profileLocale as Locale);
    }
    // only when the profile value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLocale]);

  const switchOrg = useCallback((orgId: string) => {
    setActiveOrgId(orgId);
    setActiveOrgIdState(orgId);
    try {
      sessionStorage.setItem(ORG_KEY, orgId);
    } catch {
      // ignore
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    try {
      sessionStorage.removeItem(ORG_KEY);
    } catch {
      // ignore
    }
    setMe(null);
    setActiveOrgId(null);
  }, []);

  const value = useMemo<AuthValue>(() => {
    const orgs = me?.orgs ?? [];
    const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null;
    const role = activeOrg?.role ?? null;
    return {
      ready,
      session,
      me,
      meError,
      config,
      orgs,
      activeOrg,
      role,
      isSuperAdmin: Boolean(me?.profile.is_super_admin),
      canEdit: role === 'admin' || role === 'editor',
      isOrgAdmin: role === 'admin',
      currency: activeOrg?.currency ?? 'USD',
      switchOrg,
      refreshMe,
      signOut,
    };
  }, [ready, session, me, meError, config, activeOrgId, switchOrg, refreshMe, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
