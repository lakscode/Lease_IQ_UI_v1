import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase.ts';
import { Alert, Button, Field, Input, Spinner } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { AuthShell } from './AuthShell.tsx';

// Captured when the module loads, before the Supabase client strips auth params from the URL.
// Only when the app was opened on /reset-password (an OAuth ?code= on another page must not count as recovery).
const initialUrl = new URL(window.location.pathname.replace(/\/$/, '') === '/reset-password' ? window.location.href : window.location.origin);
const initialHash = new URLSearchParams(initialUrl.hash.replace(/^#/, ''));
const INITIAL = {
  tokenHash: initialUrl.searchParams.get('token_hash'),
  type: initialUrl.searchParams.get('type') || initialHash.get('type'),
  code: initialUrl.searchParams.get('code'),
  error: initialUrl.searchParams.get('error_description') || initialHash.get('error_description'),
};

type Phase = 'verifying' | 'ready' | 'invalid' | 'done';

/**
 * Recovery links arrive as /reset-password?token_hash=...&type=recovery (branded template, works in any tab)
 * or ?code=... (Supabase default PKCE link; only works in the tab that requested it).
 */
export default function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('verifying');
  const [linkError, setLinkError] = useState<string | null>(INITIAL.error);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !cancelled) setPhase('ready');
    });

    (async () => {
      if (INITIAL.error) return setPhase('invalid');
      if (INITIAL.tokenHash && INITIAL.type === 'recovery') {
        const { error: err } = await supabase.auth.verifyOtp({ token_hash: INITIAL.tokenHash, type: 'recovery' });
        if (cancelled) return;
        window.history.replaceState(null, '', '/reset-password');
        if (err) {
          setLinkError(err.message);
          return setPhase('invalid');
        }
        return setPhase('ready');
      }
      if (INITIAL.code || INITIAL.type === 'recovery') {
        // The client exchanges the code on load; wait for the session it creates.
        for (let i = 0; i < 20 && !cancelled; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) return setPhase('ready');
          await new Promise((r) => setTimeout(r, 250));
        }
        if (!cancelled) setPhase('invalid');
        return;
      }
      setPhase('invalid');
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError(t('account.password.tooShort'));
    if (password !== confirm) return setError(t('account.password.mismatch'));
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.message);
    setPhase('done');
  };

  if (phase === 'verifying') {
    return <AuthShell title={t('auth.newPasswordTitle')}><Spinner label={t('auth.verifyingLink')} /></AuthShell>;
  }

  if (phase === 'invalid') {
    return (
      <AuthShell title={t('auth.newPasswordTitle')}>
        <div className="form">
          <Alert tone="danger" title={t('auth.resetLinkInvalid')}>{linkError ?? t('auth.resetLinkInvalidBody')}</Alert>
          <Link to="/forgot-password" className="btn btn-primary btn-block">{t('auth.requestNewLink')}</Link>
          <p className="auth-footer muted"><Link to="/login">{t('auth.backToSignIn')}</Link></p>
        </div>
      </AuthShell>
    );
  }

  if (phase === 'done') {
    return (
      <AuthShell title={t('auth.newPasswordTitle')}>
        <div className="form">
          <Alert tone="success">{t('auth.passwordUpdated')}</Alert>
          <Button variant="primary" className="btn-block" onClick={() => navigate('/dashboard', { replace: true })}>{t('auth.continueToApp')}</Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.newPasswordTitle')} subtitle={t('auth.newPasswordSubtitle')}>
      <form onSubmit={submit} className="form" noValidate>
        <Field label={t('account.password.new')} hint={t('account.password.minLength')}>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoFocus />
        </Field>
        <Field label={t('account.password.confirm')}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" variant="primary" className="btn-block" loading={busy} disabled={!password || !confirm}>
          {t('auth.savePassword')}
        </Button>
      </form>
    </AuthShell>
  );
}
