import { useEffect, useState } from 'react';
import { get, post, put } from '../../api/client.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { Alert, Badge, Button, Card, ErrorState, Field, Input, PageHeader, Select, Spinner, Tabs, useToast } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatNumber } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { AdminDomainsPanel } from './AdminDomainsPanel.tsx';
import { AdminOrgsPanel } from './AdminOrgsPanel.tsx';
import { AdminUsersPanel } from './AdminUsersPanel.tsx';
import { UsageReport } from './UsageReport.tsx';
import type { AdminSettings } from './types.ts';
import './account.css';

type Tab = 'ai' | 'email' | 'users' | 'orgs' | 'domains' | 'usage' | 'maintenance';

const TAB_KEY = 'leaseiq.settingsTab';

export default function SettingsPage() {
  const t = useT();
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      return (sessionStorage.getItem(TAB_KEY) as Tab) || 'ai';
    } catch {
      return 'ai';
    }
  });
  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      sessionStorage.setItem(TAB_KEY, next);
    } catch {
      // ignore
    }
  };
  const settings = useAsync((signal) => get<AdminSettings>('/admin/settings', undefined, signal));

  return (
    <div className="page">
      <PageHeader title={t('nav.settings')} subtitle={t('account.settings.subtitle')} />
      <Tabs<Tab>
        items={[
          { key: 'ai', label: t('account.settings.tabAi') },
          { key: 'email', label: t('account.settings.tabEmail') },
          { key: 'users', label: t('account.settings.tabUsers') },
          { key: 'orgs', label: t('account.settings.tabOrgs') },
          { key: 'domains', label: t('account.settings.tabDomains') },
          { key: 'usage', label: t('account.settings.tabUsage') },
          { key: 'maintenance', label: t('account.settings.tabMaintenance') },
        ]}
        active={tab}
        onChange={setTab}
      />
      {(tab === 'ai' || tab === 'email') &&
        (settings.loading && !settings.data ? <Spinner /> : settings.error ? <ErrorState error={settings.error} onRetry={settings.reload} /> : settings.data && (
          tab === 'ai' ? <AiModelCard settings={settings.data} onSaved={settings.reload} /> : <EmailCard settings={settings.data} onSaved={settings.reload} />
        ))}
      {tab === 'users' && <AdminUsersPanel />}
      {tab === 'orgs' && <AdminOrgsPanel />}
      {tab === 'domains' && <AdminDomainsPanel />}
      {tab === 'usage' && <UsageReport scope="all" />}
      {tab === 'maintenance' && <MaintenanceCard />}
    </div>
  );
}

function AiModelCard({ settings, onSaved }: { settings: AdminSettings; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [model, setModel] = useState(settings.ai_model);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setModel(settings.ai_model), [settings.ai_model]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await put('/admin/settings/ai-model', { model });
      toast(t('account.settings.modelSaved'));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('account.settings.aiModel')}>
      <div className="form">
        {!settings.ai_configured && <Alert tone="warning">{t('account.settings.aiNotConfigured')}</Alert>}
        <p className="muted small">{t('account.settings.aiModelHint')}</p>
        <div className="stack" role="radiogroup" aria-label={t('account.settings.aiModel')}>
          {settings.models.map((m) => (
            <label key={m.id} className="acct-model-option">
              <input type="radio" name="ai-model" value={m.id} checked={model === m.id} onChange={() => setModel(m.id)} />
              <span>
                <strong>{m.label}</strong>{' '}
                {m.id === settings.default_model && <Badge tone="info">{t('account.settings.default')}</Badge>}
                <span className="cell-sub">{m.note} · <code>{m.id}</code></span>
              </span>
            </label>
          ))}
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="form-actions">
          <Button variant="primary" onClick={save} loading={busy} disabled={model === settings.ai_model}>{t('common.save')}</Button>
        </div>
      </div>
    </Card>
  );
}

function EmailCard({ settings, onSaved }: { settings: AdminSettings; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const { me } = useAuth();
  const [provider, setProvider] = useState(settings.email.provider);
  const [fromName, setFromName] = useState(settings.email.from_name);
  const [fromEmail, setFromEmail] = useState(settings.email.from_email);
  const [testTo, setTestTo] = useState(me?.user.email ?? '');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await put('/admin/settings/email', { provider, from_name: fromName.trim(), from_email: fromEmail.trim() });
      toast(t('account.settings.emailSaved'));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await post<{ to: string }>('/admin/settings/email/test', { to: testTo.trim() });
      setTestResult({ ok: true, message: t('account.settings.testSent', { email: res.to }) });
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid-2">
      <Card title={t('account.settings.emailProvider')}>
        <form className="form" onSubmit={save}>
          <p className="muted small">{t('account.settings.emailHint')}</p>
          <Field label={t('account.settings.provider')}>
            <Select value={provider} onChange={(e) => setProvider(e.target.value as 'default' | 'sendgrid')}>
              <option value="default">{t('account.settings.providerDefault')}</option>
              <option value="sendgrid">SendGrid</option>
            </Select>
          </Field>
          {provider === 'sendgrid' && (
            <>
              {!settings.sendgrid_key_set && <Alert tone="warning">{t('account.settings.sendgridKeyMissing')}</Alert>}
              <Field label={t('account.settings.fromName')}>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={100} />
              </Field>
              <Field label={t('account.settings.fromEmail')} hint={t('account.settings.fromEmailHint')}>
                <Input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} required />
              </Field>
            </>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="form-actions">
            <Button type="submit" variant="primary" loading={busy}>{t('common.save')}</Button>
          </div>
        </form>
      </Card>
      <Card title={t('account.settings.testEmail')}>
        <div className="form">
          <div>
            {settings.email_configured
              ? <Badge tone="success">{t('account.settings.emailActive')}</Badge>
              : <Badge tone="warning">{t('account.settings.emailInactive')}</Badge>}
          </div>
          <p className="muted small">{settings.email_configured ? t('account.settings.emailActiveHint') : t('account.settings.emailInactiveHint')}</p>
          <Field label={t('account.settings.testRecipient')}>
            <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </Field>
          {testResult && <Alert tone={testResult.ok ? 'success' : 'danger'}>{testResult.message}</Alert>}
          <div className="form-actions">
            <Button onClick={test} loading={testing} disabled={!testTo.trim()}>{t('account.settings.sendTest')}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MaintenanceCard() {
  const t = useT();
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const run = async (job: 'rebuild-clauses' | 'rebuild-search') => {
    setRunning(job);
    setResults((r) => ({ ...r, [job]: undefined as unknown as { ok: boolean; message: string } }));
    try {
      const res = await post<{ documents?: number; pages?: number }>(`/files/maintenance/${job}`);
      const message = job === 'rebuild-clauses'
        ? t('account.maint.clausesDone', { n: formatNumber(res?.documents ?? 0) })
        : t('account.maint.searchDone', { n: formatNumber(res?.pages ?? 0) });
      setResults((r) => ({ ...r, [job]: { ok: true, message } }));
    } catch (err) {
      setResults((r) => ({ ...r, [job]: { ok: false, message: (err as Error).message } }));
    } finally {
      setRunning(null);
    }
  };

  const rows: { job: 'rebuild-clauses' | 'rebuild-search'; title: string; body: string }[] = [
    { job: 'rebuild-search', title: t('account.maint.searchTitle'), body: t('account.maint.searchBody') },
    { job: 'rebuild-clauses', title: t('account.maint.clausesTitle'), body: t('account.maint.clausesBody') },
  ];

  return (
    <Card title={t('account.settings.tabMaintenance')}>
      {rows.map((row) => (
        <div key={row.job} className="acct-maint-row">
          <div>
            <h3>{row.title}</h3>
            <p className="muted small">{row.body}</p>
            {results[row.job] && <Alert tone={results[row.job].ok ? 'success' : 'danger'}>{results[row.job].message}</Alert>}
          </div>
          <Button onClick={() => run(row.job)} loading={running === row.job} disabled={Boolean(running)}>{t('account.maint.run')}</Button>
        </div>
      ))}
    </Card>
  );
}
