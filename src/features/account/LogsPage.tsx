// Super admin Logs page: sign-in history of every organization, API logs (every API request, success and error;
// GET /api/logs/api) and the error log (GET /api/logs).
import { useState } from 'react';
import { PageHeader, Tabs } from '../../components/ui.tsx';
import { apiUrl } from '../../api/client.ts';
import { useT } from '../../i18n/index.tsx';
import { AdminErrorLogPanel } from './AdminErrorLogPanel.tsx';
import { LoginActivityPanel } from './LoginActivityPanel.tsx';
import { ApiLogPanel } from './ApiLogPanel.tsx';

type Tab = 'errors' | 'logins' | 'api';

export default function LogsPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('logins');
  return (
    <div className="page">
      <PageHeader
        title={t('nav.logs')}
        subtitle={
          tab === 'errors' ? <>{t('account.errors.apiHint')} <code>GET {apiUrl('/logs')}</code></>
            : tab === 'api' ? <>{t('account.apiLogs.subtitle')} <code>GET {apiUrl('/logs/api')}</code></>
            : t('account.logins.subtitle')
        }
      />
      <Tabs<Tab>
        items={[
          { key: 'logins', label: t('account.logins.title') },
          { key: 'api', label: t('account.apiLogs.tab') },
          { key: 'errors', label: t('account.settings.tabErrors') },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'logins' ? <LoginActivityPanel scope="all" /> : tab === 'api' ? <ApiLogPanel /> : <AdminErrorLogPanel />}
    </div>
  );
}
