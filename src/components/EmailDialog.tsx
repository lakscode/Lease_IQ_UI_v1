// Shared "send by email" dialog (PDF reports, CSV exports). Up to 10 recipients plus a message.
import { useState, type ReactNode } from 'react';
import { Alert, Button, Field, Input, Modal, Textarea } from './ui.tsx';
import { useT } from '../i18n/index.tsx';
import { useAuth } from '../auth/AuthProvider.tsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailDialog({ open, onClose, title, description, onSend }: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  onSend: (recipients: string[], message: string) => Promise<void>;
}) {
  const t = useT();
  const { config } = useAuth();
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const recipients = to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (recipients.length === 0 || recipients.some((r) => !EMAIL_RE.test(r))) return setError(t('email.invalid'));
    if (recipients.length > 10) return setError(t('email.tooMany'));
    setSending(true);
    setError(null);
    try {
      await onSend(recipients, message);
      setTo('');
      setMessage('');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t('email.dialogTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} loading={sending} disabled={config?.email === false}>
            {sending ? t('common.sending') : t('common.send')}
          </Button>
        </>
      }
    >
      <div className="form">
        {config?.email === false && <Alert tone="warning">Email is not configured. A super admin can set up SendGrid in Settings.</Alert>}
        {description && <p className="muted">{description}</p>}
        <Field label={t('common.recipients')} hint={t('email.recipientsHint')}>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" autoFocus />
        </Field>
        <Field label={t('common.message')}>
          <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}
