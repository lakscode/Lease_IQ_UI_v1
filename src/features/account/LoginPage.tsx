import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { supabase } from '../../lib/supabase.ts';
import { config } from '../../lib/config.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { Alert, Button, Field, Input } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { AuthShell } from './AuthShell.tsx';
import { safeNext } from './types.ts';

export default function LoginPage() {
  const { session } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  // Destination after sign-in: router state (from RequireAuth) or ?next= (from the invite page / emails).
  const redirectTo = safeNext((location.state as { from?: string } | null)?.from) || safeNext(params.get('next')) || '/dashboard';
  const nextQuery = redirectTo !== '/dashboard' ? `?next=${encodeURIComponent(redirectTo)}` : '';

  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to={redirectTo} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(/invalid login/i.test(err.message) ? t('auth.invalidCredentials') : /not confirmed/i.test(err.message) ? t('auth.emailNotConfirmed') : err.message);
    else navigate(redirectTo, { replace: true });
  };

  const sso = async (provider: 'google' | 'azure') => {
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}${redirectTo}`,
        scopes: provider === 'azure' ? 'email openid profile' : undefined,
      },
    });
    if (err) setError(err.message);
  };

  return (
    <AuthShell title={t('auth.signIn')} subtitle={t('auth.signInSubtitle')}>
      <form onSubmit={submit} className="form" noValidate>
        <Field label={t('auth.email')}>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!email} />
        </Field>
        <Field label={t('auth.password')}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus={Boolean(email)} />
        </Field>
        <div className="row-between">
          <Link to={`/forgot-password${email ? `?email=${encodeURIComponent(email.trim())}` : ''}`} className="small">{t('auth.forgotPassword')}</Link>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" variant="primary" className="btn-block" loading={busy} disabled={!email || !password}>
          {t('auth.signIn')}
        </Button>
      </form>

      {(config.sso.google || config.sso.microsoft) && (
        <>
          <div className="divider-text"><span>{t('auth.or')}</span></div>
          <div className="stack">
            {config.sso.google && (
              <Button className="btn-block" onClick={() => sso('google')}>{t('auth.continueGoogle')}</Button>
            )}
            {config.sso.microsoft && (
              <Button className="btn-block" onClick={() => sso('azure')}>{t('auth.continueMicrosoft')}</Button>
            )}
          </div>
        </>
      )}

      <p className="auth-footer muted">
        {t('auth.noAccount')} <Link to={`/signup${nextQuery}${email ? `${nextQuery ? '&' : '?'}email=${encodeURIComponent(email.trim())}` : ''}`}>{t('auth.signUp')}</Link>
      </p>
    </AuthShell>
  );
}
