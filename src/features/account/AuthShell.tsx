import type { ReactNode } from 'react';
import { useT } from '../../i18n/index.tsx';

/** Centered card used by sign-in, sign-up, password reset and invitation pages. */
export function AuthShell({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  const t = useT();
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand brand-centered">
          <span className="brand-mark">IQ</span>
          <span className="brand-name">{t('app.name')}</span>
        </div>
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="muted auth-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
