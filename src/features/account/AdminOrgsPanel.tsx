// Super admin organization management: create, rename, choose the clause classifier, delete (only when empty), manage members.
import { useState } from 'react';
import { del, get, patch, post } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Spinner } from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDate } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { MembersPanel } from './MembersPanel.tsx';
import { CURRENCIES, type AdminOrg, type ClauseClassifier, type ClauseClassifierInfo } from './types.ts';
import './account.css';

const hasData = (o: AdminOrg) => o.lease_count + o.file_count + o.document_count > 0;
const CLASSIFIERS: ClauseClassifier[] = ['claude', 'svm', 'gateway', 'langchain', 'llama'];
const usesModel = (c: ClauseClassifier) => c === 'gateway' || c === 'langchain' || c === 'llama';
const CLASSIFIER_TONE = { claude: 'neutral', svm: 'info', gateway: 'primary', langchain: 'warning', llama: 'success' } as const;
const isLlama = (m: string) => /^meta\/llama/i.test(m);
/** Configured but refusing requests (e.g. no credits): calls fall back to the SVM. */
const gatewayBlocked = (info: ClauseClassifierInfo | null | undefined, c: ClauseClassifier) =>
  Boolean(info && usesModel(c) && info.gateway_status.configured && !info.gateway_status.ready);

function ClassifierBadge({ org }: { org: AdminOrg }) {
  const t = useT();
  const kind = org.clause_classifier ?? 'svm';
  return (
    <Badge tone={CLASSIFIER_TONE[kind] ?? 'neutral'} title={org.clause_model ?? undefined}>
      {t(`account.orgs.classifier.${kind}`)}{usesModel(kind) && org.clause_model ? ` · ${org.clause_model}` : ''}
    </Badge>
  );
}

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
                <th>{t('account.orgs.classifierLabel')}</th>
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
                  <td><ClassifierBadge org={o} /></td>
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
  const [classifier, setClassifier] = useState<ClauseClassifier>(org?.clause_classifier ?? 'svm');
  const [model, setModel] = useState(org?.clause_model ?? '');
  const info = useAsync((signal) => get<ClauseClassifierInfo>('/admin/clause-classifiers', undefined, signal));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const clause = { clause_classifier: classifier, clause_model: usesModel(classifier) ? model.trim() || null : null };
      if (org) await patch(`/admin/orgs/${org.id}`, { name: name.trim(), currency, ...clause });
      else await post('/admin/orgs', { name: name.trim(), currency, add_me: addMe, ...clause });
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
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" type="submit" form="acct-org-form" loading={busy} disabled={!name.trim() || (classifier === 'gateway' && !model.trim())}>{t('common.save')}</Button></>}
    >
      <form id="acct-org-form" className="form" onSubmit={submit}>
        <Field label={t('account.org.name')}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus /></Field>
        <Field label={t('account.org.currency')}>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <ClassifierFields info={info.data} classifier={classifier} model={model} onClassifier={setClassifier} onModel={setModel} />
        {!org && (
          <label className="checkbox"><input type="checkbox" className="acct-check" checked={addMe} onChange={(e) => setAddMe(e.target.checked)} />{t('account.orgs.addMe')}</label>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}

function ClassifierFields({ info, classifier, model, onClassifier, onModel }: {
  info: ClauseClassifierInfo | null | undefined;
  classifier: ClauseClassifier;
  model: string;
  onClassifier: (c: ClauseClassifier) => void;
  onModel: (m: string) => void;
}) {
  const t = useT();
  const configured = info ? info[classifier].configured : true;
  const hint = classifier === 'claude'
    ? t('account.orgs.classifierHint.claude', { model: info?.claude.model ?? '' })
    : classifier === 'svm'
      ? t('account.orgs.classifierHint.svm', { types: info?.svm.clause_types ?? '', date: info ? formatDate(info.svm.trained_at) : '' })
      : t(`account.orgs.classifierHint.${classifier}`);
  const models = classifier === 'langchain' || classifier === 'llama' ? info?.[classifier].models : info?.gateway.models;
  const pick = (c: ClauseClassifier) => {
    onClassifier(c);
    // Pre-fill each classifier's default model when the current one doesn't fit it.
    if (c === 'llama' && !isLlama(model)) onModel(info?.llama.default_model ?? 'meta/llama-4-scout');
    else if (c === 'langchain' && !model) onModel(info?.langchain.default_model ?? 'openai/gpt-5.4-mini');
  };
  return (
    <>
      <Field label={t('account.orgs.classifierLabel')} hint={hint}>
        <Select value={classifier} onChange={(e) => pick(e.target.value as ClauseClassifier)}>
          {CLASSIFIERS.map((c) => (
            <option key={c} value={c}>
              {t(`account.orgs.classifier.${c}`)}
              {info && !info[c].configured ? ` (${t('account.orgs.classifierNotConfigured')})` : gatewayBlocked(info, c) ? ` (${t('account.orgs.gatewayNoCredits')})` : ''}
            </option>
          ))}
        </Select>
      </Field>
      {usesModel(classifier) && (
        <Field
          label={t(classifier === 'llama' ? 'account.orgs.llamaModel' : 'account.orgs.gatewayModel')}
          hint={models?.length ? undefined : t('account.orgs.gatewayModelHint')}
        >
          <Input
            value={model}
            onChange={(e) => onModel(e.target.value)}
            list="acct-gateway-models"
            placeholder={classifier === 'llama' ? 'meta/llama-4-scout' : classifier === 'langchain' ? 'openai/gpt-5.4-mini' : 'openai/gpt-5'}
            maxLength={120}
            required={classifier === 'gateway'}
          />
          <datalist id="acct-gateway-models">
            {(models ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </datalist>
        </Field>
      )}
      {!configured && <Alert tone="warning">{t(`account.orgs.classifierMissingKey.${classifier}`)}</Alert>}
      {gatewayBlocked(info, classifier) && (
        <Alert tone="warning" title={t('account.orgs.gatewayBlockedTitle')}>
          {info?.gateway_status.error ?? t('account.orgs.gatewayBlockedBody', { balance: info?.gateway_status.balance ?? '0' })}
        </Alert>
      )}
    </>
  );
}
