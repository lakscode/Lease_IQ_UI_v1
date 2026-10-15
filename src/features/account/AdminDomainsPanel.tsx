// Super admin email domains: claim a company domain for an organization (join by domain).
import { useState } from 'react';
import { del, get, patch, post } from '../../api/client.ts';
import type { Role } from '../../api/types.ts';
import { Alert, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Spinner } from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { useAsync } from '../../lib/useAsync.ts';
import { ROLES, type AdminDomain, type AdminOrg } from './types.ts';
import './account.css';

interface ApplyResult { added: number; already_member: number; skipped_removed: number; skipped_unverified: number }

export function AdminDomainsPanel() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const domains = useAsync((signal) => get<AdminDomain[]>('/admin/domains', undefined, signal));
  const orgs = useAsync((signal) => get<AdminOrg[]>('/admin/orgs', undefined, signal));
  const [editing, setEditing] = useState<AdminDomain | 'new' | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  const apply = async (d: AdminDomain) => {
    setApplying(d.id);
    try {
      const r = await post<ApplyResult>(`/admin/domains/${d.id}/apply`);
      toast(t('account.domains.applied', { added: r.added, existing: r.already_member, removed: r.skipped_removed, unverified: r.skipped_unverified }), r.added ? 'success' : 'info');
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setApplying(null);
    }
  };

  const remove = async (d: AdminDomain) => {
    if (!(await confirm({ title: t('account.domains.deleteTitle'), message: t('account.domains.deleteBody', { domain: d.domain }), confirmLabel: t('common.delete'), danger: true }))) return;
    try {
      await del(`/admin/domains/${d.id}`);
      domains.reload();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  return (
    <Card
      title={t('account.domains.title')}
      actions={<Button variant="primary" onClick={() => setEditing('new')}>{t('account.domains.claim')}</Button>}
      padded={false}
    >
      <div className="card-body"><p className="muted small">{t('account.domains.hint')}</p></div>
      {domains.loading && !domains.data ? (
        <Spinner />
      ) : domains.error ? (
        <div className="card-body"><ErrorState error={domains.error} onRetry={domains.reload} /></div>
      ) : !domains.data?.length ? (
        <EmptyState icon="🌐" title={t('account.domains.empty')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('account.domains.domain')}</th>
                <th>{t('account.usage.organization')}</th>
                <th>{t('account.domains.defaultRole')}</th>
                <th>{t('account.domains.tenant')}</th>
                <th className="num">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {domains.data.map((d) => (
                <tr key={d.id}>
                  <td className="cell-title">{d.domain}</td>
                  <td>{d.org_name}</td>
                  <td>{t(`role.${d.default_role}`)}</td>
                  <td className="acct-muted-cell">{d.ms_tenant_id ? <code>{d.ms_tenant_id}</code> : t('account.domains.anyTenant')}</td>
                  <td className="num">
                    <div className="acct-actions">
                      <Button size="sm" onClick={() => apply(d)} loading={applying === d.id} title={t('account.domains.applyHint')}>{t('account.domains.apply')}</Button>
                      <Button size="sm" onClick={() => setEditing(d)}>{t('common.edit')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(d)}>{t('common.delete')}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <DomainModal domain={editing === 'new' ? null : editing} orgs={orgs.data ?? []} onClose={() => setEditing(null)} onDone={domains.reload} />
      )}
    </Card>
  );
}

function DomainModal({ domain, orgs, onClose, onDone }: { domain: AdminDomain | null; orgs: AdminOrg[]; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState(domain?.domain ?? '');
  const [orgId, setOrgId] = useState(domain?.org_id ?? orgs[0]?.id ?? '');
  const [role, setRole] = useState<Role>(domain?.default_role ?? 'viewer');
  const [tenant, setTenant] = useState(domain?.ms_tenant_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { org_id: orgId, default_role: role, ms_tenant_id: tenant.trim() || null };
      if (domain) await patch(`/admin/domains/${domain.id}`, body);
      else await post('/admin/domains', { ...body, domain: name.trim() });
      onDone();
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
      title={domain ? t('account.domains.editTitle', { domain: domain.domain }) : t('account.domains.claim')}
      onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" type="submit" form="acct-domain-form" loading={busy} disabled={!orgId || (!domain && !name.trim())}>{t('common.save')}</Button></>}
    >
      <form id="acct-domain-form" className="form" onSubmit={submit}>
        {!domain && (
          <Field label={t('account.domains.domain')} hint={t('account.domains.domainHint')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="acme.com" required autoFocus />
          </Field>
        )}
        <Field label={t('account.usage.organization')}>
          <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </Field>
        <Field label={t('account.domains.defaultRole')} hint={t(`account.roleHint.${role}`)}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('account.domains.tenant')} hint={t('account.domains.tenantHint')}>
          <Input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}
