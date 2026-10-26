// Super admin API logs: every API request (success and error) from api_request_log, newest first, with counts.
import { useEffect, useState } from 'react';
import { get } from '../../api/client.ts';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Spinner, StatTile } from '../../components/ui.tsx';
import type { Tone } from '../../components/ui-utils.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDateTime, formatNumber } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import type { ApiRequestLog } from './types.ts';
import './account.css';

const OUTCOMES = ['success', 'error', 'client_error', 'server_error'] as const;
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
const REFRESH_MS = 15_000;

function statusTone(status: number): Tone {
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  return 'success';
}

export function ApiLogPanel() {
  const t = useT();
  const [outcome, setOutcome] = useState('');
  const [method, setMethod] = useState('');
  const [since, setSince] = useState('24h');
  const [slowOnly, setSlowOnly] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [userInput, setUserInput] = useState('');
  const [path, setPath] = useState('');
  const [user, setUser] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logs = useAsync(
    (signal) => get<ApiRequestLog>('/logs/api', { outcome, method, since, path, user, min_ms: slowOnly ? 1000 : null, limit: 300 }, signal),
    [outcome, method, since, path, user, slowOnly],
  );
  const { reload } = logs;

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, reload]);

  const applySearch = () => { setPath(pathInput.trim()); setUser(userInput.trim()); };
  const summary = logs.data?.summary;
  const rows = logs.data?.rows ?? [];
  // Requests matching every filter, including the outcome (the tiles ignore the outcome filter).
  const matching = !summary ? 0
    : outcome === 'success' ? summary.success
    : outcome === 'client_error' ? summary.client_errors
    : outcome === 'server_error' ? summary.server_errors
    : outcome === 'error' ? summary.client_errors + summary.server_errors
    : summary.total;

  return (
    <div className="stack acct-section-gap">
      {summary && (
        <div className="tiles">
          <StatTile label={t('account.apiLogs.total')} value={formatNumber(summary.total)} onClick={() => setOutcome('')} />
          <StatTile label={t('account.apiLogs.success')} value={formatNumber(summary.success)} tone="success" onClick={() => setOutcome('success')} />
          <StatTile label={t('account.apiLogs.clientErrors')} value={formatNumber(summary.client_errors)} tone={summary.client_errors ? 'warning' : 'neutral'} onClick={() => setOutcome('client_error')} />
          <StatTile label={t('account.apiLogs.serverErrors')} value={formatNumber(summary.server_errors)} tone={summary.server_errors ? 'danger' : 'neutral'} onClick={() => setOutcome('server_error')} />
          <StatTile
            label={t('account.apiLogs.avgTime')}
            value={summary.avg_ms === null ? '—' : t('account.apiLogs.ms', { n: formatNumber(summary.avg_ms) })}
            hint={summary.p95_ms === null ? undefined : t('account.apiLogs.p95', { n: formatNumber(summary.p95_ms), sample: formatNumber(summary.sample) })}
          />
        </div>
      )}

      <Card
        title={t('account.apiLogs.title')}
        padded={false}
        actions={
          <>
            <label className="checkbox">
              <input type="checkbox" className="acct-check" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              {t('account.apiLogs.autoRefresh')}
            </label>
            <Button onClick={reload} loading={logs.loading}>{t('account.errors.refresh')}</Button>
          </>
        }
      >
        <div className="card-body acct-toolbar">
          <Field label={t('account.apiLogs.outcome')}>
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {OUTCOMES.map((o) => <option key={o} value={o}>{t(`account.apiLogs.outcome.${o}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('account.apiLogs.method')}>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label={t('account.errors.since')}>
            <Select value={since} onChange={(e) => setSince(e.target.value)}>
              <option value="1h">{t('account.errors.last1h')}</option>
              <option value="24h">{t('account.errors.last24h')}</option>
              <option value="7d">{t('account.errors.last7d')}</option>
              <option value="30d">{t('account.errors.last30d')}</option>
            </Select>
          </Field>
          <form className="acct-toolbar" onSubmit={(e) => { e.preventDefault(); applySearch(); }}>
            <Field label={t('account.apiLogs.path')}>
              <Input type="search" value={pathInput} onChange={(e) => setPathInput(e.target.value)} onBlur={applySearch} placeholder="/api/leases" />
            </Field>
            <Field label={t('account.apiLogs.user')}>
              <Input type="search" value={userInput} onChange={(e) => setUserInput(e.target.value)} onBlur={applySearch} placeholder={t('account.apiLogs.userPlaceholder')} />
            </Field>
          </form>
          <label className="checkbox acct-api-slow">
            <input type="checkbox" className="acct-check" checked={slowOnly} onChange={(e) => setSlowOnly(e.target.checked)} />
            {t('account.apiLogs.slowOnly')}
          </label>
        </div>

        {logs.loading && !logs.data ? (
          <Spinner />
        ) : logs.error ? (
          <div className="card-body"><ErrorState error={logs.error} onRetry={reload} /></div>
        ) : !rows.length ? (
          <EmptyState icon="☰" title={t('account.apiLogs.empty')} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('account.errors.time')}</th>
                  <th>{t('account.apiLogs.request')}</th>
                  <th>{t('account.apiLogs.status')}</th>
                  <th className="num">{t('account.apiLogs.duration')}</th>
                  <th>{t('account.apiLogs.user')}</th>
                  <th>{t('account.errors.message')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="acct-muted-cell">{formatDateTime(r.created_at)}</td>
                    <td>
                      <div className="acct-api-req"><span className="acct-api-method">{r.method}</span> <code>{r.path}</code></div>
                      {r.query && <div className="cell-sub"><code>?{r.query}</code></div>}
                    </td>
                    <td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                    <td className={`num${r.duration_ms >= 1000 ? ' acct-api-slowcell' : ''}`}>{t('account.apiLogs.ms', { n: formatNumber(r.duration_ms) })}</td>
                    <td>
                      <div>{r.email ?? '—'}</div>
                      {r.org_name && <div className="cell-sub">{r.org_name}</div>}
                    </td>
                    <td>
                      {r.error_message ? <div>{r.error_message}</div> : <span className="muted">—</span>}
                      {r.error_code && <div className="cell-sub"><code>{r.error_code}</code></div>}
                      <details className="cell-sub">
                        <summary>{t('account.errors.details')}</summary>
                        <pre className="acct-error-details">{JSON.stringify({
                          ip: r.ip, user_agent: r.user_agent, runtime: r.runtime, user_id: r.user_id, org_id: r.org_id,
                        }, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && matching > rows.length && (
          <p className="muted small card-body">{t('account.apiLogs.showing', { shown: formatNumber(rows.length), total: formatNumber(matching) })}</p>
        )}
      </Card>
    </div>
  );
}
