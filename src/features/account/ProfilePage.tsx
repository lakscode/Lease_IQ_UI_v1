import { useEffect, useState } from 'react';
import { patch, post } from '../../api/client.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner, useToast } from '../../components/ui.tsx';
import { LOCALE_NAMES, LOCALES, useI18n, type Locale } from '../../i18n/index.tsx';
import { formatDate, formatDateTime } from '../../lib/format.ts';
import { supabase } from '../../lib/supabase.ts';
import './account.css';

const PROVIDER_KEYS: Record<string, string> = { email: 'account.profile.provider.email', google: 'account.profile.provider.google', azure: 'account.profile.provider.azure' };

export default function ProfilePage() {
  const { t } = useI18n();
  const { me, orgs, activeOrg, isSuperAdmin } = useAuth();
  if (!me) return <Spinner />;

  const providers = me.user.providers;
  const hasPassword = providers.includes('email');
  const ssoNames = providers.filter((p) => p !== 'email').map((p) => t(PROVIDER_KEYS[p] ?? p));

  return (
    <div className="page page-narrow">
      <PageHeader title={t('account.profile.title')} subtitle={me.user.email} />
      <div className="acct-profile-grid">
        <div className="acct-section-gap">
          <ProfileForm />
          <AccountInfo
            providers={providers.map((p) => t(PROVIDER_KEYS[p] ?? p))}
            role={activeOrg ? t(`role.${activeOrg.role}`) : null}
            orgName={activeOrg?.name ?? null}
            superAdmin={isSuperAdmin}
            memberSince={me.profile.created_at || me.user.created_at}
            lastSignIn={me.user.last_sign_in_at}
            orgCount={orgs.filter((o) => !o.via_super_admin).length}
          />
        </div>
        <div className="acct-section-gap">
          {hasPassword ? (
            <>
              <EmailForm />
              <PasswordForm />
            </>
          ) : (
            <Card title={t('account.profile.security')}>
              <Alert tone="info" title={t('account.profile.ssoManagedTitle', { provider: ssoNames.join(', ') })}>
                {t('account.profile.ssoManagedBody', { provider: ssoNames.join(', ') })}
              </Alert>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileForm() {
  const { t, setLocale } = useI18n();
  const toast = useToast();
  const { me, orgs, refreshMe } = useAuth();
  const [name, setName] = useState(me?.profile.display_name ?? '');
  const [locale, setLoc] = useState<Locale>((me?.profile.locale as Locale) ?? 'en');
  const [defaultOrg, setDefaultOrg] = useState(me?.profile.default_org_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(me?.profile.display_name ?? '');
    setLoc((me?.profile.locale as Locale) ?? 'en');
    setDefaultOrg(me?.profile.default_org_id ?? '');
  }, [me?.profile.display_name, me?.profile.locale, me?.profile.default_org_id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await patch('/me', { display_name: name.trim(), locale, default_org_id: defaultOrg || null });
      setLocale(locale);
      await refreshMe();
      toast(t('account.profile.saved'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('account.profile.details')}>
      <form className="form" onSubmit={save}>
        <Field label={t('account.profile.displayName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
        </Field>
        <Field label={t('nav.language')} hint={t('account.profile.languageHint')}>
          <Select value={locale} onChange={(e) => setLoc(e.target.value as Locale)}>
            {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
          </Select>
        </Field>
        {orgs.length > 0 && (
          <Field label={t('account.profile.defaultOrg')} hint={t('account.profile.defaultOrgHint')}>
            <Select value={defaultOrg} onChange={(e) => setDefaultOrg(e.target.value)}>
              <option value="">{t('account.profile.noDefaultOrg')}</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}{o.via_super_admin ? ' ★' : ''}</option>)}
            </Select>
          </Field>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="form-actions">
          <Button type="submit" variant="primary" loading={busy}>{t('common.save')}</Button>
        </div>
      </form>
    </Card>
  );
}

function EmailForm() {
  const { t } = useI18n();
  const { me, refreshMe } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const pending = sentTo ?? (me?.user as { new_email?: string | null } | undefined)?.new_email ?? null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = email.trim().toLowerCase();
    if (next === (me?.user.email ?? '').toLowerCase()) return setError(t('account.profile.sameEmail'));
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/profile` });
    setBusy(false);
    if (err) return setError(err.message);
    setSentTo(next);
    setEmail('');
    refreshMe();
  };

  return (
    <Card title={t('account.profile.email')}>
      <form className="form" onSubmit={submit}>
        <dl className="dl">
          <dt>{t('account.profile.currentEmail')}</dt>
          <dd>{me?.user.email}</dd>
        </dl>
        {pending && <Alert tone="info" title={t('account.profile.emailPendingTitle')}>{t('account.profile.emailPendingBody', { email: pending })}</Alert>}
        <Field label={t('account.profile.newEmail')} hint={t('account.profile.newEmailHint')}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="form-actions">
          <Button type="submit" loading={busy} disabled={!email.trim()}>{t('account.profile.changeEmail')}</Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const { t } = useI18n();
  const toast = useToast();
  const { me } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 6) return setError(t('account.password.tooShort'));
    if (next !== confirm) return setError(t('account.password.mismatch'));
    setBusy(true);
    setError(null);
    try {
      await post('/me/password', { current_password: current, new_password: next });
      // Supabase signs out every session after a password change; sign this tab back in.
      const email = me?.user.email;
      if (email) await supabase.auth.signInWithPassword({ email, password: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      toast(t('account.password.changed'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('account.password.title')}>
      <form className="form" onSubmit={submit}>
        <Field label={t('account.password.current')}>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field label={t('account.password.new')} hint={t('account.password.minLength')}>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={6} required />
        </Field>
        <Field label={t('account.password.confirm')}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="form-actions">
          <Button type="submit" loading={busy} disabled={!current || !next || !confirm}>{t('account.password.change')}</Button>
        </div>
      </form>
    </Card>
  );
}

function AccountInfo({ providers, role, orgName, superAdmin, memberSince, lastSignIn, orgCount }: {
  providers: string[]; role: string | null; orgName: string | null; superAdmin: boolean; memberSince: string; lastSignIn: string | null; orgCount: number;
}) {
  const { t } = useI18n();
  return (
    <Card title={t('account.profile.account')}>
      <dl className="dl">
        <dt>{t('account.profile.signInMethods')}</dt>
        <dd><span className="acct-chips">{providers.map((p) => <Badge key={p}>{p}</Badge>)}</span></dd>
        <dt>{t('account.profile.role')}</dt>
        <dd>
          <span className="acct-chips">
            {role && orgName ? <Badge tone="info">{`${role} · ${orgName}`}</Badge> : <span className="muted">{t('account.profile.noOrg')}</span>}
            {superAdmin && <Badge tone="primary">{t('role.superAdmin')}</Badge>}
          </span>
        </dd>
        <dt>{t('account.profile.organizations')}</dt>
        <dd>{orgCount}</dd>
        <dt>{t('account.profile.memberSince')}</dt>
        <dd>{formatDate(memberSince)}</dd>
        <dt>{t('account.profile.lastSignIn')}</dt>
        <dd>{formatDateTime(lastSignIn)}</dd>
      </dl>
    </Card>
  );
}
