import { useEffect, useRef, useState } from 'react';
import { del, get, patch, post } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Alert, Button, Card, ErrorState, Field, Input, PageHeader, Select, Spinner, Tabs } from '../../components/ui.tsx';
import { useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDate } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { MembersPanel } from './MembersPanel.tsx';
import { UsageReport } from './UsageReport.tsx';
import { CURRENCIES, type OrgDetails } from './types.ts';
import './account.css';

type Tab = 'details' | 'members' | 'usage';

export default function OrganizationPage() {
  const t = useT();
  const { activeOrg } = useAuth();
  const [tab, setTab] = useState<Tab>('details');
  const org = useAsync((signal) => get<OrgDetails>('/orgs/current', undefined, signal));

  return (
    <div className="page">
      <PageHeader title={activeOrg?.name ?? t('nav.organization')} subtitle={t('account.org.subtitle')} />
      <Tabs<Tab>
        items={[
          { key: 'details', label: t('account.org.tabDetails') },
          { key: 'members', label: t('account.org.tabMembers'), count: org.data?.member_count },
          { key: 'usage', label: t('account.org.tabUsage') },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'details' && (
        org.loading && !org.data ? <Spinner /> : org.error ? <ErrorState error={org.error} onRetry={org.reload} /> : org.data && <OrgDetailsForm org={org.data} onSaved={org.reload} />
      )}
      {tab === 'members' && <MembersPanel base="/orgs/current" />}
      {tab === 'usage' && <UsageReport scope="org" />}
    </div>
  );
}

function OrgDetailsForm({ org, onSaved }: { org: OrgDetails; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const { refreshMe } = useAuth();
  const [name, setName] = useState(org.name);
  const [currency, setCurrency] = useState(org.currency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(org.name);
    setCurrency(org.currency);
  }, [org.name, org.currency]);

  const dirty = name.trim() !== org.name || currency !== org.currency;
  const currencies = org.currencies?.length ? org.currencies : CURRENCIES;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await patch('/orgs/current', { name: name.trim(), currency });
      toast(t('account.org.saved'));
      await refreshMe();
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setLogoError(t('account.org.logoType'));
    if (file.size > 1024 * 1024) return setLogoError(t('account.org.logoSize'));
    setLogoBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await post('/orgs/current/logo', form);
      toast(t('account.org.logoSaved'));
      await refreshMe();
      onSaved();
    } catch (err) {
      setLogoError((err as Error).message);
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    setLogoError(null);
    try {
      await del('/orgs/current/logo');
      toast(t('account.org.logoRemoved'));
      await refreshMe();
      onSaved();
    } catch (err) {
      setLogoError((err as Error).message);
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="grid-2">
      <Card title={t('account.org.details')}>
        <form className="form" onSubmit={save}>
          <Field label={t('account.org.name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </Field>
          <Field label={t('account.org.currency')} hint={t('account.org.currencyHint')}>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <dl className="dl">
            <dt>{t('account.org.created')}</dt>
            <dd>{formatDate(org.created_at)}</dd>
            <dt>{t('account.org.members')}</dt>
            <dd>{org.member_count}</dd>
          </dl>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="form-actions">
            <Button type="submit" variant="primary" loading={saving} disabled={!dirty || !name.trim()}>{t('common.save')}</Button>
          </div>
        </form>
      </Card>

      <Card title={t('account.org.logo')}>
        <div className="form">
          <div className="acct-logo-row">
            <div className="acct-logo-preview">
              {org.logo_url ? <img src={org.logo_url} alt={t('account.org.logo')} /> : <span>{t('account.org.noLogo')}</span>}
            </div>
            <div className="stack">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => uploadLogo(e.target.files?.[0])} />
              <Button onClick={() => fileRef.current?.click()} loading={logoBusy}>{org.logo_url ? t('account.org.replaceLogo') : t('account.org.uploadLogo')}</Button>
              {org.logo_url && <Button variant="ghost" onClick={removeLogo} disabled={logoBusy}>{t('account.org.removeLogo')}</Button>}
            </div>
          </div>
          <p className="small muted">{t('account.org.logoHint')}</p>
          {logoError && <Alert tone="danger">{logoError}</Alert>}
        </div>
      </Card>
    </div>
  );
}
