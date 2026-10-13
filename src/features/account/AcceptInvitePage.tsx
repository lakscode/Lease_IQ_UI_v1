import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, get, post } from '../../api/client.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { Alert, Button, Spinner } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDateTime } from '../../lib/format.ts';
import { AuthShell } from './AuthShell.tsx';
import type { InvitePreview } from './types.ts';
import './account.css';

const ERROR_KEYS: Record<string, string> = {
  invite_invalid: 'account.accept.invalid',
  invite_revoked: 'account.accept.revoked',
  invite_expired: 'account.accept.expired',
  invite_used: 'account.accept.used',
  invite_wrong_account: 'account.accept.wrongAccount',
};

export default function AcceptInvitePage() {
  const t = useT();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { ready, session, refreshMe, switchOrg, signOut } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [acceptError, setAcceptError] = useState<{ code: string; message: string } | null>(null);

  useEffect(() => {
    get<InvitePreview>(`/invites/preview/${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch((err: Error) => setLoadError({ code: err instanceof ApiError ? err.code : 'error', message: err.message }));
  }, [token]);

  const here = `/invite/${token}`;
  const next = encodeURIComponent(here);
  const signedInEmail = session?.user.email?.toLowerCase() ?? null;

  const accept = async () => {
    setBusy(true);
    setAcceptError(null);
    try {
      const res = await post<{ org_id: string }>('/invites/accept', { token });
      await refreshMe();
      switchOrg(res.org_id);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setAcceptError({ code: err instanceof ApiError ? err.code : 'error', message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const switchAccount = async () => {
    await signOut();
    navigate(`/login?next=${next}&email=${encodeURIComponent(preview?.email ?? '')}`);
  };

  if (!ready || (!preview && !loadError)) {
    return <AuthShell title={t('account.accept.title')}><Spinner /></AuthShell>;
  }

  if (loadError || !preview) {
    return (
      <AuthShell title={t('account.accept.title')}>
        <div className="form">
          <Alert tone="danger">{t(ERROR_KEYS[loadError?.code ?? ''] ?? 'account.accept.invalid')}</Alert>
          <Link to="/login" className="btn btn-secondary btn-block">{t('auth.backToSignIn')}</Link>
        </div>
      </AuthShell>
    );
  }

  const orgName = preview.org_name ?? '';
  const header = (
    <>
      {preview.org_logo_url && (
        <div className="acct-invite-org"><img src={preview.org_logo_url} alt={orgName} /></div>
      )}
      <p>
        {preview.invited_by
          ? t('account.accept.invitedBy', { name: preview.invited_by, org: orgName, role: t(`role.${preview.role}`) })
          : t('account.accept.invited', { org: orgName, role: t(`role.${preview.role}`) })}
      </p>
    </>
  );

  if (preview.status !== 'pending') {
    const key = preview.status === 'expired' ? 'account.accept.expired' : preview.status === 'revoked' ? 'account.accept.revoked' : 'account.accept.used';
    return (
      <AuthShell title={t('account.accept.titleOrg', { org: orgName })}>
        <div className="form">
          <Alert tone="warning">{t(key)}</Alert>
          <Link to={session ? '/dashboard' : '/login'} className="btn btn-secondary btn-block">
            {session ? t('auth.continueToApp') : t('auth.backToSignIn')}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('account.accept.titleOrg', { org: orgName })}>
      <div className="form">
        {header}
        <dl className="dl acct-dl-compact">
          <dt>{t('auth.email')}</dt>
          <dd>{preview.email}</dd>
          <dt>{t('account.invites.expires')}</dt>
          <dd>{formatDateTime(preview.expires_at)}</dd>
        </dl>

        {!session ? (
          <>
            <Alert tone="info">{t('account.accept.signInPrompt', { email: preview.email })}</Alert>
            <Link to={`/login?next=${next}&email=${encodeURIComponent(preview.email)}`} className="btn btn-primary btn-block">{t('account.accept.signInToAccept')}</Link>
            <Link to={`/signup?next=${next}&email=${encodeURIComponent(preview.email)}`} className="btn btn-secondary btn-block">{t('account.accept.createAccount')}</Link>
          </>
        ) : signedInEmail !== preview.email.toLowerCase() ? (
          <>
            <Alert tone="warning" title={t('account.accept.wrongAccountTitle')}>
              {t('account.accept.wrongAccountBody', { current: session.user.email ?? '', invited: preview.email })}
            </Alert>
            <Button variant="primary" className="btn-block" onClick={switchAccount}>{t('account.accept.switchAccount', { email: preview.email })}</Button>
          </>
        ) : (
          <>
            {acceptError && <Alert tone="danger">{ERROR_KEYS[acceptError.code] ? t(ERROR_KEYS[acceptError.code]) : acceptError.message}</Alert>}
            <Button variant="primary" className="btn-block" onClick={accept} loading={busy}>{t('account.accept.accept')}</Button>
          </>
        )}
      </div>
    </AuthShell>
  );
}
