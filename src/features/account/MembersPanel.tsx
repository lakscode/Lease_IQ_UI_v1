// Members, roles, invitations and CSV import for one organization.
// base = '/orgs/current' (org admins, active org) or '/admin/orgs/:id' (super admins).
import { useMemo, useState } from 'react';
import { del, get, getBlob, patch, post, saveBlob } from '../../api/client.ts';
import type { Role } from '../../api/types.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Spinner } from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatDateTime } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { ROLES, type ImportResponse, type Invite, type InviteResult, type Member } from './types.ts';
import './account.css';

export function MembersPanel({ base, protectSelf = true }: { base: string; protectSelf?: boolean }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { me } = useAuth();
  const selfId = me?.user.id;

  const members = useAsync((signal) => get<Member[]>(`${base}/members`, undefined, signal), [base]);
  const invites = useAsync((signal) => get<Invite[]>(`${base}/invites`, undefined, signal), [base]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<Role>('viewer');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [linkResult, setLinkResult] = useState<InviteResult | null>(null);
  const [showAllInvites, setShowAllInvites] = useState(false);

  const isLocked = (m: Member) => protectSelf && m.user_id === selfId;
  const list = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (members.data ?? []).filter((m) => !q || (m.email ?? '').toLowerCase().includes(q) || (m.display_name ?? '').toLowerCase().includes(q));
  }, [members.data, filter]);
  const selectable = list.filter((m) => !isLocked(m));
  const allSelected = selectable.length > 0 && selectable.every((m) => selected.has(m.user_id));

  const reloadAll = () => {
    members.reload();
    invites.reload();
  };

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast(success);
      setSelected(new Set());
      reloadAll();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = (m: Member, role: Role) =>
    run(() => patch(`${base}/members/${m.user_id}`, { role }), t('account.members.roleChanged', { email: m.email ?? '' }));

  const remove = async (m: Member) => {
    if (!(await confirm({ title: t('account.members.removeTitle'), message: t('account.members.removeBody', { email: m.email ?? '' }), confirmLabel: t('common.remove'), danger: true }))) return;
    run(() => del(`${base}/members/${m.user_id}`), t('account.members.removed', { n: 1 }));
  };

  const bulkChangeRole = () =>
    run(() => patch(`${base}/members`, { user_ids: [...selected], role: bulkRole }), t('account.members.bulkRoleChanged', { n: selected.size }));

  const bulkRemove = async () => {
    const n = selected.size;
    if (!(await confirm({ title: t('account.members.removeTitle'), message: t('account.members.bulkRemoveBody', { n }), confirmLabel: t('common.remove'), danger: true }))) return;
    run(() => post(`${base}/members/remove`, { user_ids: [...selected] }), t('account.members.removed', { n }));
  };

  const resend = async (inv: Invite) => {
    setBusy(true);
    try {
      const result = await post<InviteResult>(`${base}/invites/${inv.id}/resend`);
      if (result.link) setLinkResult(result);
      else toast(t('account.invites.resent', { email: inv.email }));
      invites.reload();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (inv: Invite) => {
    if (!(await confirm({ title: t('account.invites.revokeTitle'), message: t('account.invites.revokeBody', { email: inv.email }), confirmLabel: t('account.invites.revoke'), danger: true }))) return;
    run(() => del(`${base}/invites/${inv.id}`), t('account.invites.revoked'));
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const inviteRows = (invites.data ?? []).filter((i) => showAllInvites || i.status === 'pending' || i.status === 'expired');

  return (
    <div className="acct-section-gap">
      <Card
        title={t('account.members.title', { n: members.data?.length ?? 0 })}
        actions={
          <>
            <Button onClick={() => setImportOpen(true)}>{t('account.import.button')}</Button>
            <Button variant="primary" onClick={() => setAddOpen(true)}>{t('account.members.add')}</Button>
          </>
        }
        padded={false}
      >
        <div className="card-body acct-section-gap">
          <div className="acct-toolbar">
            <Input type="search" placeholder={t('account.members.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 320 }} />
          </div>
          {selected.size > 0 && (
            <div className="acct-bulkbar">
              <strong>{t('account.members.selected', { n: selected.size })}</strong>
              <Select value={bulkRole} onChange={(e) => setBulkRole(e.target.value as Role)} aria-label={t('common.role')}>
                {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
              </Select>
              <Button size="sm" onClick={bulkChangeRole} disabled={busy}>{t('account.members.applyRole')}</Button>
              <Button size="sm" variant="danger" onClick={bulkRemove} disabled={busy}>{t('common.remove')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t('account.members.clearSelection')}</Button>
            </div>
          )}
        </div>
        {members.loading && !members.data ? (
          <Spinner />
        ) : members.error ? (
          <div className="card-body"><ErrorState error={members.error} onRetry={members.reload} /></div>
        ) : list.length === 0 ? (
          <EmptyState icon="👥" title={t('account.members.empty')} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="acct-col-check">
                    <input
                      type="checkbox"
                      className="acct-check"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((m) => m.user_id)))}
                      aria-label={t('account.members.selectAll')}
                    />
                  </th>
                  <th>{t('account.members.member')}</th>
                  <th>{t('common.role')}</th>
                  <th>{t('account.members.added')}</th>
                  <th className="num">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.user_id}>
                    <td>
                      <input type="checkbox" className="acct-check" checked={selected.has(m.user_id)} disabled={isLocked(m)} onChange={() => toggle(m.user_id)} aria-label={m.email ?? m.user_id} />
                    </td>
                    <td>
                      <div className="cell-title">
                        {m.display_name || m.email}
                        {m.user_id === selfId && <> <Badge tone="info">{t('account.members.you')}</Badge></>}
                        {m.is_super_admin && <> <Badge tone="primary">{t('role.superAdmin')}</Badge></>}
                      </div>
                      {m.display_name && <div className="cell-sub">{m.email}</div>}
                    </td>
                    <td>
                      <Select
                        className="input acct-role-select"
                        value={m.role}
                        disabled={isLocked(m) || busy}
                        title={isLocked(m) ? t('account.members.selfLocked') : undefined}
                        onChange={(e) => changeRole(m, e.target.value as Role)}
                        aria-label={t('common.role')}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                      </Select>
                    </td>
                    <td className="acct-muted-cell">{formatDate(m.created_at)}</td>
                    <td className="num">
                      <Button size="sm" variant="ghost" disabled={isLocked(m) || busy} onClick={() => remove(m)} title={isLocked(m) ? t('account.members.selfLocked') : undefined}>
                        {t('common.remove')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title={t('account.invites.title')}
        actions={
          <label className="checkbox">
            <input type="checkbox" className="acct-check" checked={showAllInvites} onChange={(e) => setShowAllInvites(e.target.checked)} />
            {t('account.invites.showAll')}
          </label>
        }
        padded={false}
      >
        {invites.loading && !invites.data ? (
          <Spinner />
        ) : invites.error ? (
          <div className="card-body"><ErrorState error={invites.error} onRetry={invites.reload} /></div>
        ) : inviteRows.length === 0 ? (
          <EmptyState icon="✉️" title={t('account.invites.empty')}>{t('account.invites.emptyHint')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('auth.email')}</th>
                  <th>{t('common.role')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('account.invites.expires')}</th>
                  <th>{t('account.invites.invitedBy')}</th>
                  <th className="num">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {inviteRows.map((inv) => (
                  <tr key={inv.id}>
                    <td className="cell-title">{inv.email}</td>
                    <td>{t(`role.${inv.role}`)}</td>
                    <td>
                      <InviteStatusBadge status={inv.status} />
                      {inv.status === 'pending' && !inv.email_sent && <div className="cell-sub">{t('account.invites.notEmailed')}</div>}
                    </td>
                    <td className="acct-muted-cell">{inv.status === 'accepted' ? formatDateTime(inv.accepted_at) : formatDateTime(inv.expires_at)}</td>
                    <td className="acct-muted-cell">{inv.invited_by ?? '—'}</td>
                    <td className="num">
                      {inv.status !== 'accepted' && (
                        <div className="acct-actions">
                          <Button size="sm" onClick={() => resend(inv)} disabled={busy}>{t('account.invites.resend')}</Button>
                          {inv.status === 'pending' && (
                            <Button size="sm" variant="ghost" onClick={() => revoke(inv)} disabled={busy}>{t('account.invites.revoke')}</Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddMemberModal open={addOpen} base={base} onClose={() => setAddOpen(false)} onDone={(r) => { reloadAll(); if (r.link) setLinkResult(r); }} />
      <ImportModal open={importOpen} base={base} onClose={() => setImportOpen(false)} onDone={reloadAll} />
      <Modal open={Boolean(linkResult)} title={t('account.invites.linkTitle')} onClose={() => setLinkResult(null)} footer={<Button onClick={() => setLinkResult(null)}>{t('common.close')}</Button>}>
        {linkResult && <InviteLink result={linkResult} />}
      </Modal>
    </div>
  );
}

export function InviteStatusBadge({ status }: { status: Invite['status'] }) {
  const t = useT();
  const tone = status === 'pending' ? 'info' : status === 'accepted' ? 'success' : status === 'expired' ? 'warning' : 'neutral';
  return <Badge tone={tone}>{t(`account.invites.status.${status}`)}</Badge>;
}

function InviteLink({ result }: { result: InviteResult }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.link ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable: the field is selectable
    }
  };
  return (
    <div className="stack">
      <p>{t('account.invites.linkBody', { email: result.email })}</p>
      {result.email_error && <Alert tone="warning">{t('account.invites.emailFailed')}: {result.email_error}</Alert>}
      <div className="acct-link-box">
        <Input readOnly value={result.link ?? ''} onFocus={(e) => e.currentTarget.select()} aria-label={t('account.invites.link')} />
        <Button onClick={copy}>{copied ? t('common.copied') : t('common.copy')}</Button>
      </div>
      <p className="small muted">{t('account.invites.linkExpiry')}</p>
    </div>
  );
}

function AddMemberModal({ open, base, onClose, onDone }: { open: boolean; base: string; onClose: () => void; onDone: (r: InviteResult) => void }) {
  const t = useT();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setEmail('');
    setRole('viewer');
    setError(null);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await post<InviteResult>(`${base}/members`, { email: email.trim(), role });
      if (result.status === 'added') toast(t('account.members.addedNow', { email: result.email }));
      else if (result.status === 'already_member') toast(t('account.members.alreadyMember', { email: result.email }), 'info');
      else if (result.status === 'invited') toast(t('account.invites.sent', { email: result.email }));
      onDone(result);
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
      title={t('account.members.add')}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" form="acct-add-member" loading={busy} disabled={!email.trim()}>{t('account.members.addOrInvite')}</Button>
        </>
      }
    >
      <form id="acct-add-member" className="form" onSubmit={submit}>
        <p className="muted small">{t('account.members.addHint')}</p>
        <Field label={t('auth.email')}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label={t('common.role')} hint={t(`account.roleHint.${role}`)}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
          </Select>
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}

function ImportModal({ open, base, onClose, onDone }: { open: boolean; base: string; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const close = () => {
    setFile(null);
    setError(null);
    setResult(null);
    onClose();
  };

  const template = async () => {
    try {
      const { blob, filename } = await getBlob(`${base}/members/import-template`);
      saveBlob(blob, filename ?? 'members-template.csv');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const csv = await file.text();
      const res = await post<ImportResponse>(`${base}/members/import`, { csv });
      setResult(res);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const statusTone = (s: string) => (s === 'failed' ? 'danger' : s === 'added' ? 'success' : s === 'already_member' ? 'neutral' : s === 'invited' ? 'info' : 'warning');

  return (
    <Modal
      open={open}
      wide
      title={t('account.import.title')}
      onClose={close}
      footer={
        result ? (
          <Button onClick={close}>{t('common.close')}</Button>
        ) : (
          <>
            <Button onClick={close}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={submit} loading={busy} disabled={!file}>{t('account.import.run')}</Button>
          </>
        )
      }
    >
      {!result ? (
        <div className="form">
          <p className="muted">{t('account.import.hint')}</p>
          <div><Button size="sm" onClick={template}>{t('account.import.template')}</Button></div>
          <Field label={t('account.import.file')}>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      ) : (
        <div className="acct-section-gap">
          <div className="acct-chips">
            {(['added', 'invited', 'invited_no_email', 'already_member', 'failed'] as const).map((s) => (
              <Badge key={s} tone={statusTone(s)}>{t(`account.import.status.${s}`)}: {result.summary[s] ?? 0}</Badge>
            ))}
          </div>
          {result.summary.invited_no_email > 0 && <Alert tone="warning">{t('account.import.noEmailHint')}</Alert>}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>{t('auth.email')}</th>
                  <th>{t('common.role')}</th>
                  <th>{t('account.import.result')}</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={r.row}>
                    <td className="num">{r.row}</td>
                    <td>{r.email}</td>
                    <td>{r.role}</td>
                    <td>
                      <Badge tone={statusTone(r.status)}>{t(`account.import.status.${r.status}`)}</Badge>
                      {r.reason && <div className="cell-sub">{r.reason}</div>}
                      {r.link && <div className="cell-sub"><code>{r.link}</code></div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
