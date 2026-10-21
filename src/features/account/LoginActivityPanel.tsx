// Sign-in history: every session's sign-in (who, when, how, from where, last seen, signed out), with summaries by user
// and by organization. scope 'all' = super admins (Logs page, any organization); 'org' = org admins (Organization page,
// members of the current organization).
import { useEffect, useState } from 'react';
import { get } from '../../api/client.ts';
import { Badge, Card, EmptyState, ErrorState, Input, Select, Spinner, StatTile, Tabs } from '../../components/ui.tsx';
import { useT, type TFunction } from '../../i18n/index.tsx';
import { formatDateTime, formatNumber } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import type { AdminOrg } from './types.ts';

interface LoginEvent {
  id: number;
  user_id: string;
  name: string | null;
  email: string | null;
  method: string | null;
  provider: string | null;
  ip: string | null;
  user_agent: string | null;
  orgs: { id: string; name: string }[];
  signed_in_at: string;
  last_seen_at: string;
  signed_out_at: string | null;
}

interface LoginReport {
  days: number;
  truncated: boolean;
  totals: { logins: number; users: number; today: number; active_sessions: number };
  events: LoginEvent[];
  by_user: { user_id: string; name: string | null; email: string | null; logins: number; last_login: string; last_seen: string; methods: string[]; ips: number }[];
  by_org: { org_id: string; name: string; logins: number; users: number; last_login: string }[];
}

type View = 'events' | 'users' | 'orgs';

/** "Chrome on Windows" from a user agent (enough to recognise a device; not exhaustive). */
export function deviceOf(ua: string | null): string {
  if (!ua) return '—';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /node|undici|curl|python|axios/i.test(ua) ? 'Script' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

function methodLabel(t: TFunction, method: string | null, provider: string | null): string {
  if (provider && provider !== 'email') {
    const key = `account.logins.provider.${provider}`;
    const text = t(key);
    return text === key ? provider : text;
  }
  const key = `account.logins.method.${method ?? 'password'}`;
  const text = t(key);
  return text === key ? (method ?? '—') : text;
}

function SessionState({ e }: { e: LoginEvent }) {
  const t = useT();
  if (e.signed_out_at) return <span className="small muted">{t('account.logins.signedOutAt', { date: formatDateTime(e.signed_out_at) })}</span>;
  const recent = Date.now() - Date.parse(e.last_seen_at) < 24 * 3_600_000;
  return <Badge tone={recent ? 'success' : 'neutral'}>{recent ? t('account.logins.active') : t('account.logins.idle')}</Badge>;
}

export function LoginActivityPanel({ scope }: { scope: 'all' | 'org' }) {
  const t = useT();
  const [days, setDays] = useState('30');
  const [orgId, setOrgId] = useState('');
  const [user, setUser] = useState<{ id: string; label: string } | null>(null);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('events');

  useEffect(() => {
    const h = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(h);
  }, [qInput]);

  const path = scope === 'all' ? '/admin/logins' : '/orgs/current/logins';
  const report = useAsync(
    (signal) => get<LoginReport>(path, { days, q, ...(user ? { user_id: user.id } : {}), ...(scope === 'all' && orgId ? { org_id: orgId } : {}) }, signal),
    [path, days, q, user?.id, orgId],
  );
  const orgs = useAsync((signal) => (scope === 'all' ? get<AdminOrg[]>('/admin/orgs', undefined, signal) : Promise.resolve([] as AdminOrg[])), [scope]);

  const pickUser = (id: string, label: string) => {
    setUser({ id, label });
    setView('events');
  };
  const d = report.data;
  const views: View[] = scope === 'all' && !orgId ? ['events', 'users', 'orgs'] : ['events', 'users'];

  return (
    <div className="stack">
      <Card>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Select value={days} onChange={(e) => setDays(e.target.value)} aria-label={t('account.logins.period')}>
            {['1', '7', '30', '90', '365'].map((n) => <option key={n} value={n}>{t('account.logins.lastDays', { n })}</option>)}
          </Select>
          {scope === 'all' && (
            <Select value={orgId} onChange={(e) => { setOrgId(e.target.value); if (view === 'orgs') setView('events'); }} aria-label={t('account.logins.org')}>
              <option value="">{t('account.logins.allOrgs')}</option>
              {(orgs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          )}
          <Input type="search" placeholder={t('account.logins.search')} value={qInput} onChange={(e) => setQInput(e.target.value)} aria-label={t('common.search')} />
          {user && (
            <button type="button" className="badge badge-info" onClick={() => setUser(null)} title={t('account.logins.clearUser')}>
              {user.label} ✕
            </button>
          )}
        </div>
      </Card>

      {report.loading && !d && <Spinner />}
      {report.error && <ErrorState error={report.error} onRetry={report.reload} />}
      {d && (
        <>
          <div className="tiles">
            <StatTile label={t('account.logins.tileLogins')} value={formatNumber(d.totals.logins)} />
            <StatTile label={t('account.logins.tileUsers')} value={formatNumber(d.totals.users)} onClick={() => setView('users')} />
            <StatTile label={t('account.logins.tileToday')} value={formatNumber(d.totals.today)} />
            <StatTile label={t('account.logins.tileActive')} value={formatNumber(d.totals.active_sessions)} hint={t('account.logins.tileActiveHint')} />
          </div>
          {d.truncated && <p className="small muted">{t('account.logins.truncated')}</p>}

          <Tabs<View> items={views.map((v) => ({ key: v, label: t(`account.logins.view.${v}`) }))} active={view} onChange={setView} />

          {d.totals.logins === 0 ? (
            <EmptyState icon="🔑" title={t('account.logins.empty')}>{t('account.logins.emptyHint')}</EmptyState>
          ) : view === 'events' ? (
            <Card padded={false}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('account.logins.colTime')}</th>
                      <th>{t('account.logins.colUser')}</th>
                      <th>{t('account.logins.colMethod')}</th>
                      {scope === 'all' && <th>{t('account.logins.colOrgs')}</th>}
                      <th>{t('account.logins.colDevice')}</th>
                      <th>{t('account.logins.colIp')}</th>
                      <th>{t('account.logins.colLastSeen')}</th>
                      <th>{t('account.logins.colSession')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.events.map((e) => (
                      <tr key={e.id}>
                        <td className="small" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.signed_in_at)}</td>
                        <td>
                          <button type="button" className="acct-linkbtn" onClick={() => pickUser(e.user_id, e.name || e.email || e.user_id)}>{e.name || e.email}</button>
                          {e.name && <div className="small muted">{e.email}</div>}
                        </td>
                        <td className="small">{methodLabel(t, e.method, e.provider)}</td>
                        {scope === 'all' && <td className="small">{e.orgs.length ? e.orgs.map((o) => o.name).join(', ') : <span className="muted">{t('account.logins.noOrg')}</span>}</td>}
                        <td className="small" title={e.user_agent ?? undefined}>{deviceOf(e.user_agent)}</td>
                        <td className="small">{e.ip ?? '—'}</td>
                        <td className="small" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.last_seen_at)}</td>
                        <td><SessionState e={e} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.events.length < d.totals.logins && <p className="small muted card-body">{t('account.logins.showing', { n: d.events.length, total: d.totals.logins })}</p>}
            </Card>
          ) : view === 'users' ? (
            <Card padded={false}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('account.logins.colUser')}</th>
                      <th className="num">{t('account.logins.colLogins')}</th>
                      <th>{t('account.logins.colLastLogin')}</th>
                      <th>{t('account.logins.colLastSeen')}</th>
                      <th>{t('account.logins.colMethods')}</th>
                      <th className="num">{t('account.logins.colIps')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.by_user.map((u) => (
                      <tr key={u.user_id} className="clickable" onClick={() => pickUser(u.user_id, u.name || u.email || u.user_id)}>
                        <td>{u.name || u.email}{u.name && <div className="small muted">{u.email}</div>}</td>
                        <td className="num">{formatNumber(u.logins)}</td>
                        <td className="small">{formatDateTime(u.last_login)}</td>
                        <td className="small">{formatDateTime(u.last_seen)}</td>
                        <td className="small">{u.methods.map((m) => methodLabel(t, m, m)).join(', ')}</td>
                        <td className="num">{u.ips}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card padded={false}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('account.logins.org')}</th>
                      <th className="num">{t('account.logins.colLogins')}</th>
                      <th className="num">{t('account.logins.colUsers')}</th>
                      <th>{t('account.logins.colLastLogin')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.by_org.map((o) => (
                      <tr key={o.org_id} className="clickable" onClick={() => { setOrgId(o.org_id); setView('events'); }}>
                        <td>{o.name}</td>
                        <td className="num">{formatNumber(o.logins)}</td>
                        <td className="num">{formatNumber(o.users)}</td>
                        <td className="small">{formatDateTime(o.last_login)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
