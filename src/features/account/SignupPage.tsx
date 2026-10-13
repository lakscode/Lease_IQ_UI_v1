import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { supabase } from '../../lib/supabase.ts';
import { config } from '../../lib/config.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { Alert, Button, Field, Input } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { AuthShell } from './AuthShell.tsx';
import { safeNext } from './types.ts';

export default function SignupPage() {
  const { session } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next')) || '/dashboard';
  const nextQuery = next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (session && !sentTo) return <Navigate to={next} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError(t('account.password.tooShort'));
    if (password !== confirm) return setError(t('account.password.mismatch'));
    setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: name.trim() ? { full_name: name.trim() } : undefined,
        emailRedirectTo: `${window.location.origin}/login${nextQuery}`,
      },
    });
    setBusy(false);
    if (err) return setError(err.message);
    // With email confirmation off, Supabase signs the user in right away.
    if (data.session) navigate(next, { replace: true });
    else setSentTo(email.trim());
  };

  const sso = async (provider: 'google' | 'azure') => {
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${next}`, scopes: provider === 'azure' ? 'email openid profile' : undefined },
    });
    if (err) setError(err.message);
  };

  if (sentTo) {
    return (
      <AuthShell title={t('auth.checkEmailTitle')}>
        <div className="form">
          <Alert tone="success">{t('auth.signupCheckEmail', { email: sentTo })}</Alert>
          <Link to={`/login${nextQuery}${nextQuery ? '&' : '?'}email=${encodeURIComponent(sentTo)}`} className="btn btn-primary btn-block">{t('auth.backToSignIn')}</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.createAccount')} subtitle={t('auth.signupSubtitle')}>
      <form onSubmit={submit} className="form" noValidate>
        <Field label={t('account.profile.displayName')}>
          <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('auth.email')}>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={t('auth.password')} hint={t('account.password.minLength')}>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        </Field>
        <Field label={t('account.password.confirm')}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" variant="primary" className="btn-block" loading={busy} disabled={!email || !password || !confirm}>
          {t('auth.signUp')}
        </Button>
      </form>

      {(config.sso.google || config.sso.microsoft) && (
        <>
          <div className="divider-text"><span>{t('auth.or')}</span></div>
          <div className="stack">
            {config.sso.google && <Button className="btn-block" onClick={() => sso('google')}>{t('auth.continueGoogle')}</Button>}
            {config.sso.microsoft && <Button className="btn-block" onClick={() => sso('azure')}>{t('auth.continueMicrosoft')}</Button>}
          </div>
        </>
      )}

      <p className="auth-footer muted">
        {t('auth.haveAccount')} <Link to={`/login${nextQuery}`}>{t('auth.signIn')}</Link>
      </p>
    </AuthShell>
  );
}
