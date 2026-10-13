import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { supabase } from '../../lib/supabase.ts';
import { Alert, Button, Field, Input } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { AuthShell } from './AuthShell.tsx';

export default function ForgotPasswordPage() {
  const t = useT();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    // Don't reveal whether an account exists; only show rate-limit style errors.
    if (err && !/not found|no user/i.test(err.message)) setError(err.message);
    else setSent(true);
  };

  return (
    <AuthShell title={t('auth.resetTitle')} subtitle={sent ? undefined : t('auth.resetSubtitle')}>
      {sent ? (
        <div className="form">
          <Alert tone="success">{t('auth.resetSent', { email: email.trim() })}</Alert>
          <Link to="/login" className="btn btn-secondary btn-block">{t('auth.backToSignIn')}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="form" noValidate>
          <Field label={t('auth.email')}>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" variant="primary" className="btn-block" loading={busy} disabled={!email.trim()}>
            {t('auth.sendResetLink')}
          </Button>
          <p className="auth-footer muted"><Link to="/login">{t('auth.backToSignIn')}</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
