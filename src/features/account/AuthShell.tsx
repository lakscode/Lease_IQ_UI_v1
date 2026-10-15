import type { ReactNode } from 'react';
import { BrandLogo } from '../../components/BrandLogo.tsx';

/** Centered card used by sign-in, sign-up, password reset and invitation pages. */
export function AuthShell({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand brand-centered">
          <BrandLogo size="lg" />
        </div>
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="muted auth-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
