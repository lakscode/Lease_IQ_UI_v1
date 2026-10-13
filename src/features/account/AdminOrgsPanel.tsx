// Super admin organization management: create, rename, delete (only when empty), manage members.
import { useState } from 'react';
import { del, get, patch, post } from '../../api/client.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Spinner, useConfirm, useToast } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDate } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { MembersPanel } from './MembersPanel.tsx';
import { CURRENCIES, type AdminOrg } from './types.ts';
import './account.css';

const hasData = (o: AdminOrg) => o.lease_count + o.file_count + o.document_count > 0;

export function AdminOrgsPanel() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { refreshMe } = useAuth();
  const orgs = useAsync((signal) => get<AdminOrg[]>('/admin/orgs', undefined, signal));
  const [editing, setEditing] = useState<AdminOrg | 'new' | null>(null);
  const [membersOf, setMembersOf] = useState<AdminOrg | null>(null);

  const changed = () => {
    orgs.reload();
    refreshMe();
  };

  const remove = async (o: AdminOrg) => {
    if (!(await confirm({ title: t('account.orgs.deleteTitle'), message: t('account.orgs.deleteBody', { name: o.name }), confirmLabel: t('common.delete'), danger: true }))) return;
    try {
      await del(`/admin/orgs/${o.id}`);
      toast(t('account.orgs.deleted', { name: o.name }));
      changed();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  return (
    <Card
      title={t('account.orgs.title')}
      actions={<Button variant="primary" onClick={() => setEditing('new')}>{t('account.orgs.create')}</Button>}
      padded={false}
    >
      {orgs.loading && !orgs.data ? (
        <Spinner />
      ) : orgs.error ? (
        <div className="card-body"><ErrorState error={orgs.error} onRetry={orgs.reload} /></div>
      ) : !orgs.data?.length ? (
        <EmptyState icon="🏢" title={t('account.orgs.empty')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('account.org.name')}</th>
                <th>{t('account.org.currency')}</th>
                <th className="num">{t('account.org.members')}</th>
                <th className="num">{t('account.orgs.leases')}</th>
                <th>{t('account.settings.tabDomains')}</th>
                <th>{t('account.org.created')}</th>
                <th className="num">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {orgs.data.map((o) => (
                <tr key={o.id}>
                  <td className="cell-title">{o.name}</td>
                  <td>{o.currency}</td>
                  <td className="num">{o.member_count}</td>
                  <td className="num">{o.lease_count}</td>
                  <td>{o.domains.length ? <div className="acct-chips">{o.domains.map((d) => <Badge key={d}>{d}</Badge>)}</div> : <span className="muted">—</span>}</td>
                  <td className="acct-muted-cell">{formatDate(o.created_at)}</td>
                  <td className="num">
                    <div className="acct-actions">
                      <Button size="sm" onClick={() => setMembersOf(o)}>{t('account.orgs.members')}</Button>
                      <Button size="sm" onClick={() => setEditing(o)}>{t('common.edit')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(o)} disabled={hasData(o)} title={hasData(o) ? t('account.orgs.hasData') : undefined}>
                        {t('common.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <OrgModal org={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={changed} />}
      <Modal open={Boolean(membersOf)} wide title={t('account.orgs.membersTitle', { name: membersOf?.name ?? '' })} onClose={() => { setMembersOf(null); orgs.reload(); }}>
        {membersOf && <MembersPanel base={`/admin/orgs/${membersOf.id}`} protectSelf={false} />}
      </Modal>
    </Card>
  );
}

function OrgModal({ org, onClose, onDone }: { org: AdminOrg | null; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(org?.name ?? '');
  const [currency, setCurrency] = useState(org?.currency ?? 'USD');
  const [addMe, setAddMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (org) await patch(`/admin/orgs/${org.id}`, { name: name.trim(), currency });
      else await post('/admin/orgs', { name: name.trim(), currency, add_me: addMe });
      toast(org ? t('account.orgs.saved') : t('account.orgs.created', { name: name.trim() }));
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
      title={org ? t('account.orgs.editTitle') : t('account.orgs.create')}
      onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" type="submit" form="acct-org-form" loading={busy} disabled={!name.trim()}>{t('common.save')}</Button></>}
    >
      <form id="acct-org-form" className="form" onSubmit={submit}>
        <Field label={t('account.org.name')}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus /></Field>
        <Field label={t('account.org.currency')}>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        {!org && (
          <label className="checkbox"><input type="checkbox" className="acct-check" checked={addMe} onChange={(e) => setAddMe(e.target.checked)} />{t('account.orgs.addMe')}</label>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}
