// Super admin user management: search, create, edit, organizations & roles, delete.
import { useEffect, useState } from 'react';
import { del, get, patch, post, put } from '../../api/client.ts';
import type { Role } from '../../api/types.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Spinner, useConfirm, useToast } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatDateTime } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { ROLES, type AdminOrg, type AdminUser } from './types.ts';
import './account.css';

export function AdminUsersPanel() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { me, refreshMe } = useAuth();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const users = useAsync((signal) => get<AdminUser[]>('/admin/users', { search: query }, signal), [query]);
  const orgs = useAsync((signal) => get<AdminOrg[]>('/admin/orgs', undefined, signal));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [orgsFor, setOrgsFor] = useState<AdminUser | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const remove = async (u: AdminUser) => {
    if (!(await confirm({ title: t('account.users.deleteTitle'), message: t('account.users.deleteBody', { email: u.email ?? '' }), confirmLabel: t('common.delete'), danger: true }))) return;
    try {
      await del(`/admin/users/${u.id}`);
      toast(t('account.users.deleted', { email: u.email ?? '' }));
      users.reload();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  const afterChange = (u: AdminUser) => {
    users.reload();
    if (u.id === me?.user.id) refreshMe();
  };

  return (
    <Card
      title={t('account.users.title')}
      actions={<Button variant="primary" onClick={() => setCreating(true)}>{t('account.users.create')}</Button>}
      padded={false}
    >
      <div className="card-body">
        <Input type="search" placeholder={t('account.users.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
      </div>
      {users.loading && !users.data ? (
        <Spinner />
      ) : users.error ? (
        <div className="card-body"><ErrorState error={users.error} onRetry={users.reload} /></div>
      ) : !users.data?.length ? (
        <EmptyState icon="👤" title={t('common.noResults')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('account.users.user')}</th>
                <th>{t('account.users.orgs')}</th>
                <th>{t('account.profile.signInMethods')}</th>
                <th>{t('account.profile.lastSignIn')}</th>
                <th className="num">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => {
                const self = u.id === me?.user.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-title">
                        {u.display_name || u.email}
                        {u.is_super_admin && <> <Badge tone="primary">{t('role.superAdmin')}</Badge></>}
                        {self && <> <Badge tone="info">{t('account.members.you')}</Badge></>}
                      </div>
                      <div className="cell-sub">
                        {u.display_name ? `${u.email} · ` : ''}{t('account.users.created', { date: formatDate(u.created_at) })}
                        {!u.email_confirmed && ` · ${t('account.users.unconfirmed')}`}
                      </div>
                    </td>
                    <td>
                      {u.orgs.length ? (
                        <div className="acct-chips">{u.orgs.map((o) => <Badge key={o.org_id}>{`${o.org_name} · ${t(`role.${o.role}`)}`}</Badge>)}</div>
                      ) : <span className="muted small">{t('account.users.noOrgs')}</span>}
                    </td>
                    <td className="acct-muted-cell">{u.providers.map((p) => t(`account.profile.provider.${p}`)).join(', ')}</td>
                    <td className="acct-muted-cell">{formatDateTime(u.last_sign_in_at)}</td>
                    <td className="num">
                      <div className="acct-actions">
                        <Button size="sm" onClick={() => setEditing(u)}>{t('common.edit')}</Button>
                        <Button size="sm" onClick={() => setOrgsFor(u)}>{t('account.users.orgs')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(u)} disabled={self} title={self ? t('account.users.cantDeleteSelf') : undefined}>{t('common.delete')}</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <CreateUserModal open={creating} orgs={orgs.data ?? []} onClose={() => setCreating(false)} onDone={() => users.reload()} />
      {editing && <EditUserModal user={editing} self={editing.id === me?.user.id} onClose={() => setEditing(null)} onDone={afterChange} />}
      {orgsFor && <UserOrgsModal user={orgsFor} orgs={orgs.data ?? []} onClose={() => setOrgsFor(null)} onDone={afterChange} />}
    </Card>
  );
}

function CreateUserModal({ open, orgs, onClose, onDone }: { open: boolean; orgs: AdminOrg[]; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [superAdmin, setSuperAdmin] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setEmail(''); setPassword(''); setName(''); setSuperAdmin(false); setOrgId(''); setRole('viewer'); setError(null);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError(t('account.password.tooShort'));
    setBusy(true);
    setError(null);
    try {
      await post('/admin/users', {
        email: email.trim(), password, display_name: name.trim() || null, is_super_admin: superAdmin,
        orgs: orgId ? [{ org_id: orgId, role }] : [],
      });
      toast(t('account.users.createdToast', { email: email.trim() }));
      onDone();
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('account.users.create')}
      onClose={close}
      footer={<><Button onClick={close}>{t('common.cancel')}</Button><Button variant="primary" type="submit" form="acct-create-user" loading={busy} disabled={!email.trim() || !password}>{t('account.users.create')}</Button></>}
    >
      <form id="acct-create-user" className="form" onSubmit={submit}>
        <Field label={t('auth.email')}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
        <Field label={t('auth.password')} hint={t('account.password.minLength')}><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required /></Field>
        <Field label={t('account.profile.displayName')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="form-grid">
          <Field label={t('account.users.initialOrg')}>
            <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">{t('common.none')}</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </Field>
          <Field label={t('common.role')}>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={!orgId}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
            </Select>
          </Field>
        </div>
        <label className="checkbox"><input type="checkbox" className="acct-check" checked={superAdmin} onChange={(e) => setSuperAdmin(e.target.checked)} />{t('role.superAdmin')}</label>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}

function EditUserModal({ user, self, onClose, onDone }: { user: AdminUser; self: boolean; onClose: () => void; onDone: (u: AdminUser) => void }) {
  const t = useT();
  const toast = useToast();
  const [email, setEmail] = useState(user.email ?? '');
  const [name, setName] = useState(user.display_name ?? '');
  const [password, setPassword] = useState('');
  const [superAdmin, setSuperAdmin] = useState(user.is_super_admin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password && password.length < 6) return setError(t('account.password.tooShort'));
    const body: Record<string, unknown> = {};
    if (email.trim().toLowerCase() !== (user.email ?? '').toLowerCase()) body.email = email.trim();
    if (name.trim() !== (user.display_name ?? '')) body.display_name = name.trim() || null;
    if (password) body.password = password;
    if (superAdmin !== user.is_super_admin) body.is_super_admin = superAdmin;
    if (!Object.keys(body).length) return onClose();
    setBusy(true);
    setError(null);
    try {
      const updated = await patch<AdminUser>(`/admin/users/${user.id}`, body);
      toast(t('account.users.saved'));
      onDone(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={t('account.users.editTitle', { email: user.email ?? '' })}
      onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" type="submit" form="acct-edit-user" loading={busy}>{t('common.save')}</Button></>}
    >
      <form id="acct-edit-user" className="form" onSubmit={submit}>
        <Field label={t('auth.email')} hint={user.providers.some((p) => p !== 'email') ? t('account.users.ssoEmailHint') : undefined}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={t('account.profile.displayName')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('account.users.newPassword')} hint={t('account.users.newPasswordHint')}>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <label className="checkbox" title={self ? t('account.users.cantDemoteSelf') : undefined}>
          <input type="checkbox" className="acct-check" checked={superAdmin} disabled={self} onChange={(e) => setSuperAdmin(e.target.checked)} />
          {t('role.superAdmin')}
        </label>
        {self && <p className="small muted">{t('account.users.cantDemoteSelf')}</p>}
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}

function UserOrgsModal({ user, orgs, onClose, onDone }: { user: AdminUser; orgs: AdminOrg[]; onClose: () => void; onDone: (u: AdminUser) => void }) {
  const t = useT();
  const toast = useToast();
  const [roles, setRoles] = useState<Record<string, Role | ''>>(() => Object.fromEntries(user.orgs.map((o) => [o.org_id, o.role])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const list = Object.entries(roles).filter(([, r]) => r).map(([org_id, role]) => ({ org_id, role }));
      const updated = await put<AdminUser>(`/admin/users/${user.id}/orgs`, { orgs: list });
      toast(t('account.users.saved'));
      onDone(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={t('account.users.orgsTitle', { email: user.email ?? '' })}
      onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" onClick={save} loading={busy}>{t('common.save')}</Button></>}
    >
      <div className="form">
        <p className="muted small">{t('account.users.orgsHint')}</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('account.usage.organization')}</th><th>{t('common.role')}</th></tr></thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className="cell-title">{o.name}</td>
                  <td>
                    <Select value={roles[o.id] ?? ''} onChange={(e) => setRoles((r) => ({ ...r, [o.id]: e.target.value as Role | '' }))} aria-label={`${o.name} ${t('common.role')}`}>
                      <option value="">{t('account.users.notMember')}</option>
                      {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}
