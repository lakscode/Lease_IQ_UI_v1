// Super admin Logs page: the error log (also readable from the API at GET /api/logs) and the sign-in history of
// every organization.
import { useState } from 'react';
import { PageHeader, Tabs } from '../../components/ui.tsx';
import { apiUrl } from '../../api/client.ts';
import { useT } from '../../i18n/index.tsx';
import { AdminErrorLogPanel } from './AdminErrorLogPanel.tsx';
import { LoginActivityPanel } from './LoginActivityPanel.tsx';

type Tab = 'errors' | 'logins';

export default function LogsPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('logins');
  return (
    <div className="page">
      <PageHeader
        title={t('nav.logs')}
        subtitle={tab === 'errors' ? <>{t('account.errors.apiHint')} <code>GET {apiUrl('/logs')}</code></> : t('account.logins.subtitle')}
      />
      <Tabs<Tab>
        items={[{ key: 'logins', label: t('account.logins.title') }, { key: 'errors', label: t('account.settings.tabErrors') }]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'logins' ? <LoginActivityPanel scope="all" /> : <AdminErrorLogPanel />}
    </div>
  );
}
