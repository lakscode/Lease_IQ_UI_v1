// Super admin error log: failures reported by the UI and API (newest first).
import { useState } from 'react';
import { get } from '../../api/client.ts';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Spinner } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDateTime } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import type { ErrorLogEntry } from './types.ts';
import './account.css';

/** Areas that report errors so far; 'signup' also includes signup.sso and signup.oauth. */
const AREAS = ['signup', 'signup.sso', 'signup.oauth', 'auth.oauth'];

export function AdminErrorLogPanel() {
  const t = useT();
  const [area, setArea] = useState('');
  const [level, setLevel] = useState('');
  const [since, setSince] = useState('7d');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const logs = useAsync(
    (signal) => get<ErrorLogEntry[]>('/logs', { area, level, since, q: search }, signal),
    [area, level, since, search],
  );

  return (
    <Card
      title={t('account.errors.title')}
      actions={<Button onClick={logs.reload} loading={logs.loading}>{t('account.errors.refresh')}</Button>}
      padded={false}
    >
      <div className="card-body acct-toolbar">
        <Field label={t('account.errors.area')}>
          <Select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </Field>
        <Field label={t('account.errors.level')}>
          <Select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="error">{t('account.errors.levelError')}</option>
            <option value="warning">{t('account.errors.levelWarning')}</option>
          </Select>
        </Field>
        <Field label={t('account.errors.since')}>
          <Select value={since} onChange={(e) => setSince(e.target.value)}>
            <option value="1h">{t('account.errors.last1h')}</option>
            <option value="24h">{t('account.errors.last24h')}</option>
            <option value="7d">{t('account.errors.last7d')}</option>
            <option value="30d">{t('account.errors.last30d')}</option>
            <option value="">{t('common.all')}</option>
          </Select>
        </Field>
        <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }}>
          <Field label={t('account.errors.search')}>
            <Input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onBlur={() => setSearch(searchInput.trim())} placeholder={t('account.errors.searchPlaceholder')} />
          </Field>
        </form>
        <p className="muted small acct-toolbar-spacer">{t('account.errors.hint')}</p>
      </div>
      {logs.loading && !logs.data ? (
        <Spinner />
      ) : logs.error ? (
        <div className="card-body"><ErrorState error={logs.error} onRetry={logs.reload} /></div>
      ) : !logs.data?.length ? (
        <EmptyState icon="✓" title={t('account.errors.empty')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('account.errors.time')}</th>
                <th>{t('account.errors.area')}</th>
                <th>{t('account.errors.message')}</th>
                <th>{t('common.email')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.data.map((e) => (
                <tr key={e.id}>
                  <td className="acct-muted-cell">{formatDateTime(e.created_at)}</td>
                  <td>
                    <div className="cell-title">{e.area}</div>
                    <Badge tone={e.level === 'warning' ? 'warning' : 'danger'}>
                      {e.level === 'warning' ? t('account.errors.levelWarning') : t('account.errors.levelError')}
                    </Badge>
                  </td>
                  <td>
                    <div>{e.message}</div>
                    {e.code && <div className="cell-sub"><code>{e.code}</code></div>}
                    {(e.details || e.path || e.user_agent) && (
                      <details className="cell-sub">
                        <summary>{t('account.errors.details')}</summary>
                        <pre className="acct-error-details">{JSON.stringify({ path: e.path, details: e.details, user_agent: e.user_agent, user_id: e.user_id }, null, 2)}</pre>
                      </details>
                    )}
                  </td>
                  <td className="acct-muted-cell">{e.email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
