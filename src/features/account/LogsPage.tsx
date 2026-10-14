// Super admin Logs page: the error log, also readable from the API at GET /api/logs.
import { PageHeader } from '../../components/ui.tsx';
import { apiUrl } from '../../api/client.ts';
import { useT } from '../../i18n/index.tsx';
import { AdminErrorLogPanel } from './AdminErrorLogPanel.tsx';

export default function LogsPage() {
  const t = useT();
  return (
    <div className="page">
      <PageHeader
        title={t('nav.logs')}
        subtitle={<>{t('account.errors.apiHint')} <code>GET {apiUrl('/logs')}</code></>}
      />
      <AdminErrorLogPanel />
    </div>
  );
}
