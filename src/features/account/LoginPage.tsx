import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase.ts';
import { config } from '../../lib/config.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { Alert, Button, Field, Input } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { AuthShell } from './AuthShell.tsx';

export default function LoginPage() {
  const { session } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from || '/dashboard';

  const [email, setEmail] = useState('');
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
    if (err) setError(err.message);
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
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label={t('auth.password')}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <div className="row-between">
          <Link to="/forgot-password" className="small">{t('auth.forgotPassword')}</Link>
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
        {t('auth.noAccount')} <Link to="/signup">{t('auth.signUp')}</Link>
      </p>
    </AuthShell>
  );
}
