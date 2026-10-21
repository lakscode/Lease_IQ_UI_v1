import { useEffect, useState } from 'react';
import { get, post, put } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Alert, Badge, Button, Card, ErrorState, Field, Input, PageHeader, Select, Spinner, Tabs } from '../../components/ui.tsx';
import { useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatNumber } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { AdminDomainsPanel } from './AdminDomainsPanel.tsx';
import { AdminErrorLogPanel } from './AdminErrorLogPanel.tsx';
import { AdminOrgsPanel } from './AdminOrgsPanel.tsx';
import { AdminUsersPanel } from './AdminUsersPanel.tsx';
import { PredictionCatalogPanel } from './PredictionCatalogPanel.tsx';
import { UsageReport } from './UsageReport.tsx';
import type { AdminSettings } from './types.ts';
import './account.css';

type Tab = 'ai' | 'catalog' | 'email' | 'users' | 'orgs' | 'domains' | 'usage' | 'errors' | 'maintenance';

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
          { key: 'catalog', label: t('account.settings.tabCatalog') },
          { key: 'email', label: t('account.settings.tabEmail') },
          { key: 'users', label: t('account.settings.tabUsers') },
          { key: 'orgs', label: t('account.settings.tabOrgs') },
          { key: 'domains', label: t('account.settings.tabDomains') },
          { key: 'usage', label: t('account.settings.tabUsage') },
          { key: 'errors', label: t('account.settings.tabErrors') },
          { key: 'maintenance', label: t('account.settings.tabMaintenance') },
        ]}
        active={tab}
        onChange={setTab}
      />
      {(tab === 'ai' || tab === 'email') &&
        (settings.loading && !settings.data ? <Spinner /> : settings.error ? <ErrorState error={settings.error} onRetry={settings.reload} /> : settings.data && (
          tab === 'ai' ? <div className="stack"><AiModelCard settings={settings.data} onSaved={settings.reload} /><AiModeCard settings={settings.data} onSaved={settings.reload} /></div> : <EmailCard settings={settings.data} onSaved={settings.reload} />
        ))}
      {tab === 'users' && <AdminUsersPanel />}
      {tab === 'orgs' && <AdminOrgsPanel />}
      {tab === 'catalog' && <PredictionCatalogPanel />}
      {tab === 'domains' && <AdminDomainsPanel />}
      {tab === 'usage' && <UsageReport scope="all" />}
      {tab === 'errors' && <AdminErrorLogPanel />}
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

function AiModeCard({ settings, onSaved }: { settings: AdminSettings; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [mode, setMode] = useState(settings.ai_mode ?? 'economy');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setMode(settings.ai_mode ?? 'economy'), [settings.ai_mode]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await put('/admin/settings/ai-mode', { mode });
      toast(t('account.settings.aiModeSaved'));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('account.settings.aiMode')}>
      <div className="form">
        <p className="muted small">{t('account.settings.aiModeHint')}</p>
        <div className="stack" role="radiogroup" aria-label={t('account.settings.aiMode')}>
          {(['economy', 'quality'] as const).map((m) => (
            <label key={m} className="acct-model-option">
              <input type="radio" name="ai-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              <span>
                <strong>{t(`account.settings.aiMode.${m}`)}</strong>{' '}
                {m === 'economy' && <Badge tone="info">{t('account.settings.default')}</Badge>}
                <span className="cell-sub">{t(`account.settings.aiModeNote.${m}`)}</span>
              </span>
            </label>
          ))}
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="form-actions">
          <Button variant="primary" onClick={save} loading={busy} disabled={mode === (settings.ai_mode ?? 'economy')}>{t('common.save')}</Button>
        </div>
      </div>
    </Card>
  );
}

const SMTP_PRESETS: Record<string, { label: string; host: string; port: number; security: 'ssl' | 'starttls' }> = {
  gmail: { label: 'Gmail / Google Workspace', host: 'smtp.gmail.com', port: 465, security: 'ssl' },
  office365: { label: 'Microsoft 365 / Outlook', host: 'smtp.office365.com', port: 587, security: 'starttls' },
  yahoo: { label: 'Yahoo Mail', host: 'smtp.mail.yahoo.com', port: 465, security: 'ssl' },
  zoho: { label: 'Zoho Mail', host: 'smtp.zoho.com', port: 465, security: 'ssl' },
};

function EmailCard({ settings, onSaved }: { settings: AdminSettings; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const { me } = useAuth();
  const [provider, setProvider] = useState(settings.email.provider);
  const [fromName, setFromName] = useState(settings.email.from_name);
  const [fromEmail, setFromEmail] = useState(settings.email.from_email);
  const [apiKey, setApiKey] = useState('');
  const [smtpHost, setSmtpHost] = useState(settings.email.smtp_host ?? '');
  const [smtpPort, setSmtpPort] = useState(String(settings.email.smtp_port ?? 465));
  const [smtpSecurity, setSmtpSecurity] = useState<'ssl' | 'starttls' | 'none'>(settings.email.smtp_security ?? 'ssl');
  const [smtpUser, setSmtpUser] = useState(settings.email.smtp_user ?? '');
  const [smtpPassword, setSmtpPassword] = useState('');
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
      await put('/admin/settings/email', {
        provider,
        from_name: fromName.trim(),
        from_email: fromEmail.trim(),
        sendgrid_api_key: apiKey.trim() || undefined,
        smtp_host: smtpHost.trim(),
        smtp_port: Number(smtpPort),
        smtp_security: smtpSecurity,
        smtp_user: smtpUser.trim(),
        smtp_password: smtpPassword || undefined,
      });
      setApiKey('');
      setSmtpPassword('');
      toast(t('account.settings.emailSaved'));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Quick setup for common mailboxes (fills the server fields; the username defaults to the sender address).
  const applyPreset = (preset: string) => {
    const p = SMTP_PRESETS[preset];
    if (!p) return;
    setSmtpHost(p.host);
    setSmtpPort(String(p.port));
    setSmtpSecurity(p.security);
    if (!smtpUser.trim() && fromEmail.trim()) setSmtpUser(fromEmail.trim());
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
          {provider === 'default' && (
            <>
              <p className="muted small">{t('account.settings.smtpHint')}</p>
              <Field label={t('account.settings.fromName')}>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={100} />
              </Field>
              <Field label={t('account.settings.fromEmail')} hint={t('account.settings.smtpFromHint')}>
                <Input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} required={Boolean(smtpHost.trim())} />
              </Field>
              <Field label={t('account.settings.smtpPreset')}>
                <Select value="" onChange={(e) => applyPreset(e.target.value)}>
                  <option value="">{t('account.settings.smtpPresetChoose')}</option>
                  {Object.entries(SMTP_PRESETS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
                </Select>
              </Field>
              <div className="form-grid">
                <Field label={t('account.settings.smtpHost')}>
                  <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" spellCheck={false} />
                </Field>
                <Field label={t('account.settings.smtpPort')}>
                  <Input type="number" min={1} max={65535} value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
                </Field>
              </div>
              <Field label={t('account.settings.smtpSecurity')} hint={t('account.settings.smtpPortHint')}>
                <Select value={smtpSecurity} onChange={(e) => {
                  const v = e.target.value as 'ssl' | 'starttls' | 'none';
                  setSmtpSecurity(v);
                  if (v === 'ssl' && smtpPort === '587') setSmtpPort('465');
                  if (v === 'starttls' && smtpPort === '465') setSmtpPort('587');
                }}>
                  <option value="ssl">{t('account.settings.smtpSsl')}</option>
                  <option value="starttls">{t('account.settings.smtpStarttls')}</option>
                  <option value="none">{t('account.settings.smtpNone')}</option>
                </Select>
              </Field>
              <Field label={t('account.settings.smtpUser')}>
                <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} autoComplete="off" spellCheck={false} />
              </Field>
              <Field
                label={t('account.settings.smtpPassword')}
                hint={settings.smtp_password_set ? t('account.settings.smtpPasswordSaved') : t('account.settings.smtpPasswordHint')}
              >
                <Input
                  type="password"
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.target.value)}
                  placeholder={settings.smtp_password_set ? '••••••••' : ''}
                  autoComplete="new-password"
                  required={Boolean(smtpUser.trim()) && !settings.smtp_password_set}
                />
              </Field>
            </>
          )}
          {provider === 'sendgrid' && (
            <>
              {!settings.sendgrid_key_set && <Alert tone="warning">{t('account.settings.sendgridKeyMissing')}</Alert>}
              <Field
                label={t('account.settings.sendgridKey')}
                hint={settings.sendgrid_key_set
                  ? t(settings.sendgrid_key_source === 'settings' ? 'account.settings.sendgridKeySaved' : 'account.settings.sendgridKeyFromEnv', { last4: settings.sendgrid_key_hint ?? '' })
                  : t('account.settings.sendgridKeyHint')}
              >
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings.sendgrid_key_set ? `SG.••••${settings.sendgrid_key_hint ?? ''}` : 'SG.…'}
                  autoComplete="off"
                  spellCheck={false}
                  required={!settings.sendgrid_key_set}
                />
              </Field>
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
