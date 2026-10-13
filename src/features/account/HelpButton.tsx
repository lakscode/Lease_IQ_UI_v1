// Help menu in the top bar: ask the Lease Assistant, ask about the current lease, create a support ticket.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { post } from '../../api/client.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { Alert, Button, Field, Input, Modal, Select, Textarea, useToast } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import './account.css';

type TicketType = 'bug' | 'question' | 'feature';

export function HelpButton() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { config } = useAuth();
  const [open, setOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const leaseMatch = /^\/leases\/([^/]+)/.exec(location.pathname);
  const leaseId = leaseMatch ? decodeURIComponent(leaseMatch[1]) : null;
  const jira = Boolean(config?.jira);

  // Close when the page changes.
  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div className="acct-help" ref={ref}>
      <button
        type="button"
        className="acct-help-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('account.help.button')}
        title={t('account.help.button')}
      >
        ?
      </button>
      {open && (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" className="menu-item" onClick={() => go('/assistant')}>
            {t('account.help.askAssistant')}
          </button>
          {leaseId && (
            <button type="button" role="menuitem" className="menu-item" onClick={() => go(`/assistant?leaseId=${encodeURIComponent(leaseId)}`)}>
              {t('account.help.askLease')}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={!jira}
            onClick={() => { setOpen(false); setTicketOpen(true); }}
          >
            {t('account.help.ticket')}
            {!jira && <span className="acct-menu-hint">{t('account.help.ticketUnavailable')}</span>}
          </button>
        </div>
      )}
      <SupportTicketModal open={ticketOpen} onClose={() => setTicketOpen(false)} />
    </div>
  );
}

function SupportTicketModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const { activeOrg } = useAuth();
  const [type, setType] = useState<TicketType>('bug');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState('');

  useEffect(() => {
    if (open) setPageUrl(window.location.href);
  }, [open]);

  const close = () => {
    setType('bug');
    setSummary('');
    setDescription('');
    setError(null);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ key: string; url: string }>('/support/tickets', {
        type, summary: summary.trim(), description: description.trim(), page_url: pageUrl, org_name: activeOrg?.name ?? null,
      });
      toast(t('account.ticket.created', { key: res.key }));
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
      title={t('account.ticket.title')}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" form="acct-ticket-form" loading={busy} disabled={!summary.trim()}>{t('account.ticket.submit')}</Button>
        </>
      }
    >
      <form id="acct-ticket-form" className="form" onSubmit={submit}>
        <Field label={t('account.ticket.type')}>
          <Select value={type} onChange={(e) => setType(e.target.value as TicketType)}>
            <option value="bug">{t('account.ticket.type.bug')}</option>
            <option value="question">{t('account.ticket.type.question')}</option>
            <option value="feature">{t('account.ticket.type.feature')}</option>
          </Select>
        </Field>
        <Field label={t('account.ticket.summary')}>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={250} required autoFocus />
        </Field>
        <Field label={t('account.ticket.description')} hint={t(`account.ticket.descriptionHint.${type}`)}>
          <Textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t('account.ticket.page')} hint={t('account.ticket.pageHint')}>
          <Input value={pageUrl} readOnly />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}
