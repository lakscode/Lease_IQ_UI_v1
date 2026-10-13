// Lease Assistant: private conversations, scope (all / lease / document), cited answers and token usage.
// Deep links: /assistant?leaseId=&documentId=&q=  (q starts a new conversation and sends the question).
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { get, patch, post, del } from '../../api/client.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import {
  Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, useConfirm, useToast,
} from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDateTime, formatTokens } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import {
  AiNotConfigured, PageLink, errorText, isAiNotConfigured, leaseLabel, type LeaseDocumentOption, type LeaseOption,
} from './shared.tsx';

interface Conversation {
  id: string;
  title: string | null;
  lease_id: string | null;
  document_id: string | null;
  lease_name?: string | null;
  document_title?: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  created_at: string;
  updated_at: string;
}

interface Source { document_id: string; lease_id: string | null; title: string; page: number; quote: string }
interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
interface Message { id: number | string; role: 'user' | 'assistant'; content: string; citations: Source[] | null; usage: Usage | null; created_at: string }

const SUGGESTIONS: Record<'all' | 'lease' | 'document', string[]> = {
  all: ['intel.chat.suggest.all1', 'intel.chat.suggest.all2', 'intel.chat.suggest.all3', 'intel.chat.suggest.all4'],
  lease: ['intel.chat.suggest.lease1', 'intel.chat.suggest.lease2', 'intel.chat.suggest.lease3', 'intel.chat.suggest.lease4'],
  document: ['intel.chat.suggest.doc1', 'intel.chat.suggest.doc2', 'intel.chat.suggest.doc3'],
};

const inputTokens = (u: Usage | null) => (u ? u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) : 0);

/** Render answer text, turning [n] markers into links to source n. */
function AnswerText({ text, sources }: { text: string; sources: Source[] }) {
  const parts: ReactNode[] = [];
  const re = /\[(\d{1,2})\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(m[1]);
    const src = sources[n - 1];
    if (!src) continue;
    parts.push(text.slice(last, m.index));
    parts.push(
      src.lease_id
        ? <Link key={m.index} className="intel-cite" to={`/leases/${src.lease_id}/details?tab=documents&doc=${src.document_id}&page=${src.page}`} title={`${src.title}\n“${src.quote}”`}>{n}</Link>
        : <span key={m.index} className="intel-cite" title={src.quote}>{n}</span>,
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}

function MessageView({ message }: { message: Message }) {
  const t = useT();
  const sources = message.citations ?? [];
  if (message.role === 'user') {
    return (
      <div className="intel-msg intel-msg-user">
        <div className="intel-bubble">{message.content}</div>
      </div>
    );
  }
  return (
    <div className="intel-msg intel-msg-assistant">
      <div className="intel-bubble"><AnswerText text={message.content} sources={sources} /></div>
      {sources.length > 0 && (
        <div className="intel-sources">
          <span className="intel-source-label">{t('intel.chat.sources')}</span>
          <div className="intel-chips">
            {sources.map((s, i) => (s.lease_id
              ? <PageLink key={`${s.document_id}:${s.page}`} leaseId={s.lease_id} documentId={s.document_id} page={s.page} label={`${i + 1}. ${s.title}`} quote={s.quote} />
              : <span key={`${s.document_id}:${s.page}`} className="intel-chip" title={s.quote}>{i + 1}. {s.title}</span>))}
          </div>
        </div>
      )}
      {message.usage && (
        <span className="intel-usage">
          {t('intel.chat.usageAnswer', { input: formatTokens(inputTokens(message.usage)), output: formatTokens(message.usage.output_tokens) })}
        </span>
      )}
    </div>
  );
}

/** Lease + document pickers. Uses the leases area API; degrades to "all leases" if it is unavailable. */
function ScopePicker({ leaseId, documentId, onChange, disabled }: {
  leaseId: string; documentId: string; onChange: (leaseId: string, documentId: string) => void; disabled?: boolean;
}) {
  const t = useT();
  const leases = useAsync((signal) => get<LeaseOption[]>('/leases', undefined, signal), []);
  const detail = useAsync(
    (signal) => (leaseId ? get<{ documents: LeaseDocumentOption[] }>(`/leases/${leaseId}`, undefined, signal) : Promise.resolve(null)),
    [leaseId],
  );
  const docs = detail.data?.documents ?? [];
  const scope = documentId ? 'document' : leaseId ? 'lease' : 'all';
  return (
    <div className="intel-scope">
      <Field label={t('intel.chat.scope')}>
        <Select
          value={scope}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'all') onChange('', '');
            else if (v === 'lease') onChange(leaseId || leases.data?.[0]?.id || '', '');
            else onChange(leaseId || leases.data?.[0]?.id || '', documentId || docs[0]?.id || '');
          }}
        >
          <option value="all">{t('intel.chat.scopeAll')}</option>
          <option value="lease" disabled={!leases.data?.length}>{t('intel.chat.scopeLease')}</option>
          <option value="document" disabled={!leases.data?.length}>{t('intel.chat.scopeDocument')}</option>
        </Select>
      </Field>
      {scope !== 'all' && (
        <Field label={t('intel.chat.lease')} hint={leases.error ? t('intel.chat.leasesUnavailable') : undefined}>
          <Select value={leaseId} disabled={disabled || !leases.data} onChange={(e) => onChange(e.target.value, '')}>
            {!leases.data?.some((l) => l.id === leaseId) && <option value={leaseId}>{leaseId ? leaseId.slice(0, 8) : '—'}</option>}
            {(leases.data ?? []).map((l) => <option key={l.id} value={l.id}>{leaseLabel(l)}</option>)}
          </Select>
        </Field>
      )}
      {scope === 'document' && (
        <Field label={t('intel.chat.document')}>
          <Select value={documentId} disabled={disabled || detail.loading} onChange={(e) => onChange(leaseId, e.target.value)}>
            {!docs.some((d) => d.id === documentId) && <option value={documentId}>{documentId ? documentId.slice(0, 8) : '—'}</option>}
            {docs.map((d) => <option key={d.id} value={d.id}>{d.title ?? t(`intel.docType.${d.doc_type}`)}</option>)}
          </Select>
        </Field>
      )}
    </div>
  );
}

function scopeText(t: ReturnType<typeof useT>, c: Pick<Conversation, 'lease_id' | 'document_id' | 'lease_name' | 'document_title'>): string {
  if (c.document_id) return `${t('intel.chat.scopeDocument')}: ${c.document_title ?? '—'}`;
  if (c.lease_id) return `${t('intel.chat.scopeLease')}: ${c.lease_name ?? '—'}`;
  return t('intel.chat.scopeAll');
}

export default function AssistantPage() {
  const t = useT();
  const { config } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const [params, setParams] = useSearchParams();
  const aiOff = config ? !config.ai : false;

  const list = useAsync((signal) => get<Conversation[]>('/chat/conversations', undefined, signal), []);
  const detail = useAsync(
    (signal) => (conversationId ? get<{ conversation: Conversation; messages: Message[] }>(`/chat/conversations/${conversationId}`, undefined, signal) : Promise.resolve(null)),
    [conversationId],
  );

  // New-chat scope (from deep link or picker).
  const [scope, setScope] = useState({ leaseId: params.get('leaseId') ?? '', documentId: params.get('documentId') ?? '' });
  const [draft, setDraft] = useState(params.get('q') ?? '');
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);

  const conversation = detail.data?.conversation ?? null;
  const messages = useMemo(() => detail.data?.messages ?? [], [detail.data]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending]);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;
    setSending(true);
    setSendError(null);
    setPending(question);
    setDraft('');
    let convId = conversationId;
    try {
      if (!convId) {
        const created = await post<Conversation>('/chat/conversations', { lease_id: scope.leaseId || null, document_id: scope.documentId || null });
        convId = created.id;
        list.setData((l) => [created, ...(l ?? [])]);
        navigate(`/assistant/${created.id}`, { replace: false });
      }
      const res = await post<{ conversation: Conversation; messages: Message[] }>(`/chat/conversations/${convId}/messages`, { content: question });
      if (convId === conversationId) {
        detail.setData((d) => (d && d.conversation.id === convId
          ? { conversation: { ...d.conversation, ...res.conversation }, messages: [...d.messages, ...res.messages] }
          : d));
      } else {
        detail.reload(); // the new conversation's page may have loaded before the answer was stored
      }
      list.reload();
    } catch (err) {
      setDraft(question);
      setSendError(errorText(t, err));
      if (!isAiNotConfigured(err)) toast(errorText(t, err), 'danger');
      if (convId !== conversationId) detail.reload();
    } finally {
      setPending(null);
      setSending(false);
    }
  }, [conversationId, detail, list, navigate, scope, sending, t, toast]);

  // Deep link with ?q= → start a new conversation and send it once.
  useEffect(() => {
    const q = params.get('q');
    if (!q || autoSent.current || conversationId || !config) return;
    autoSent.current = true;
    setParams({}, { replace: true });
    if (config.ai) void send(q);
  }, [params, conversationId, config, send, setParams]);

  const newChat = () => {
    setScope({ leaseId: '', documentId: '' });
    setDraft('');
    setSendError(null);
    navigate('/assistant');
  };

  const remove = async (c: Conversation) => {
    if (!(await confirm({ title: t('intel.chat.deleteTitle'), message: t('intel.chat.deleteBody', { title: c.title ?? t('intel.chat.untitled') }), confirmLabel: t('common.delete'), danger: true }))) return;
    try {
      await del(`/chat/conversations/${c.id}`);
      list.setData((l) => (l ?? []).filter((x) => x.id !== c.id));
      if (c.id === conversationId) navigate('/assistant');
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const saveRename = async () => {
    if (!renaming || !renameValue.trim()) return;
    try {
      const updated = await patch<Conversation>(`/chat/conversations/${renaming.id}`, { title: renameValue.trim() });
      list.setData((l) => (l ?? []).map((x) => (x.id === updated.id ? { ...x, title: updated.title } : x)));
      detail.setData((d) => (d && d.conversation.id === updated.id ? { ...d, conversation: { ...d.conversation, title: updated.title } } : d));
      setRenaming(null);
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const activeScope = conversation
    ? (conversation.document_id ? 'document' : conversation.lease_id ? 'lease' : 'all')
    : (scope.documentId ? 'document' : scope.leaseId ? 'lease' : 'all');

  const composer = aiOff ? (
    <div className="intel-composer"><AiNotConfigured /></div>
  ) : (
    <form className="intel-composer" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
      {sendError && <div className="field-error" role="alert">{sendError}</div>}
      <div className="intel-composer-row">
        <Textarea
          value={draft}
          rows={2}
          maxLength={4000}
          placeholder={t('intel.chat.placeholder')}
          aria-label={t('intel.chat.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
        />
        <Button type="submit" variant="primary" loading={sending} disabled={!draft.trim()}>{t('intel.chat.send')}</Button>
      </div>
      <span className="intel-usage">{t('intel.chat.hint')}</span>
    </form>
  );

  return (
    <div className="page">
      <PageHeader title={t('intel.chat.title')} subtitle={t('intel.chat.subtitle')} actions={<Button variant="primary" onClick={newChat}>{t('intel.chat.new')}</Button>} />
      <div className="intel-assistant">
        <Card className="intel-convs" title={t('intel.chat.conversations')} padded={false}>
          {list.loading && !list.data ? <div className="card-body"><Spinner /></div>
            : list.error ? <div className="card-body"><ErrorState error={list.error} onRetry={list.reload} /></div>
              : !list.data?.length ? <p className="card-body muted small">{t('intel.chat.noConversations')}</p>
                : (
                  <ul className="intel-conv-list">
                    {list.data.map((c) => (
                      <li key={c.id} className={`intel-conv-item${c.id === conversationId ? ' active' : ''}`}>
                        <Link className="intel-conv-link" to={`/assistant/${c.id}`}>
                          <span className="intel-conv-title">{c.title ?? t('intel.chat.untitled')}</span>
                          <span className="intel-conv-sub">{scopeText(t, c)} · {formatDateTime(c.updated_at)}</span>
                        </Link>
                        <span className="intel-conv-actions">
                          <button type="button" className="icon-btn" aria-label={t('intel.chat.rename')} title={t('intel.chat.rename')} onClick={() => { setRenaming(c); setRenameValue(c.title ?? ''); }}>✎</button>
                          <button type="button" className="icon-btn" aria-label={t('common.delete')} title={t('common.delete')} onClick={() => void remove(c)}>🗑</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
        </Card>

        <section className="card intel-chat">
          {conversationId ? (
            detail.error ? <div className="card-body"><ErrorState error={detail.error} onRetry={detail.reload} /></div>
              : !conversation ? <div className="card-body"><Spinner /></div>
                : (
                  <>
                    <div className="intel-chat-header">
                      <div>
                        <h2>{conversation.title ?? t('intel.chat.untitled')}</h2>
                        <span className="intel-usage">{scopeText(t, conversation)}</span>
                      </div>
                      <span className="intel-usage">
                        {t('intel.chat.usageChat', { input: formatTokens(conversation.total_input_tokens), output: formatTokens(conversation.total_output_tokens) })}
                      </span>
                    </div>
                    <div className="intel-thread" ref={threadRef}>
                      {messages.length === 0 && !pending && (
                        <div className="intel-welcome">
                          <p className="muted">{t('intel.chat.emptyThread')}</p>
                          {!aiOff && (
                            <div className="intel-suggestions">
                              {SUGGESTIONS[activeScope].map((k) => (
                                <button key={k} type="button" className="intel-suggestion" onClick={() => void send(t(k))}>{t(k)}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {messages.map((m) => <MessageView key={m.id} message={m} />)}
                      {pending && (
                        <>
                          <div className="intel-msg intel-msg-user"><div className="intel-bubble">{pending}</div></div>
                          <div className="intel-msg intel-msg-assistant"><Spinner label={t('intel.chat.thinking')} /></div>
                        </>
                      )}
                    </div>
                    {composer}
                  </>
                )
          ) : (
            <>
              <div className="intel-thread" ref={threadRef}>
                {pending ? (
                  <>
                    <div className="intel-msg intel-msg-user"><div className="intel-bubble">{pending}</div></div>
                    <div className="intel-msg intel-msg-assistant"><Spinner label={t('intel.chat.thinking')} /></div>
                  </>
                ) : (
                  <div className="intel-welcome">
                    <EmptyState icon="💬" title={t('intel.chat.welcomeTitle')}>{t('intel.chat.welcomeBody')}</EmptyState>
                    <ScopePicker
                      leaseId={scope.leaseId}
                      documentId={scope.documentId}
                      disabled={sending}
                      onChange={(leaseId, documentId) => setScope({ leaseId, documentId })}
                    />
                    {!aiOff && (
                      <div className="intel-suggestions">
                        {SUGGESTIONS[activeScope].map((k) => (
                          <button key={k} type="button" className="intel-suggestion" onClick={() => void send(t(k))}>{t(k)}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {composer}
            </>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(renaming)}
        title={t('intel.chat.rename')}
        onClose={() => setRenaming(null)}
        footer={<><Button onClick={() => setRenaming(null)}>{t('common.cancel')}</Button><Button variant="primary" disabled={!renameValue.trim()} onClick={() => void saveRename()}>{t('common.save')}</Button></>}
      >
        <form onSubmit={(e) => { e.preventDefault(); void saveRename(); }}>
          <Field label={t('intel.chat.titleLabel')}>
            <Input value={renameValue} maxLength={120} autoFocus onChange={(e) => setRenameValue(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
