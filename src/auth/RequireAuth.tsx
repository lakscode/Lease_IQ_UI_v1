import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from './useAuth.ts';
import { Button, EmptyState, ErrorState, Spinner } from '../components/ui.tsx';
import { useT } from '../i18n/index.tsx';

/** Signed-in users only. Users without an organization see a notice (except on allowNoOrg pages). */
export function RequireAuth({ children, allowNoOrg }: { children: ReactNode; allowNoOrg?: boolean }) {
  const { ready, session, me, meError, orgs, refreshMe, signOut } = useAuth();
  const location = useLocation();
  const t = useT();

  if (!ready) return <div className="center-screen"><Spinner /></div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (meError && !me) return <div className="center-screen"><ErrorState error={meError} onRetry={refreshMe} /></div>;
  if (!me) return <div className="center-screen"><Spinner /></div>;
  if (orgs.length === 0 && !allowNoOrg) {
    return (
      <div className="center-screen">
        <EmptyState
          icon="🏢"
          title={t('noOrg.title')}
          action={
            <div className="row-gap">
              <Link to="/profile" className="btn btn-secondary">{t('nav.profile')}</Link>
              <Button onClick={signOut}>{t('nav.signOut')}</Button>
            </div>
          }
        >
          {t('noOrg.body')}
        </EmptyState>
      </div>
    );
  }
  return <>{children}</>;
}

/** Restrict a page to org admins or super admins. */
export function RequireRole({ children, superAdmin }: { children: ReactNode; superAdmin?: boolean }) {
  const { isOrgAdmin, isSuperAdmin } = useAuth();
  if (superAdmin ? !isSuperAdmin : !isOrgAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
