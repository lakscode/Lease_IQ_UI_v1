// Follow-up tasks of a lease (Alerts tab): add a task with an optional due date, tick it off, or remove it.
// Tasks tracked from a supporting document's AI review link back to that document.
import { useState } from 'react';
import { Badge, Button, Card, ErrorState, Input, Spinner } from '../../../components/ui.tsx';
import { cx } from '../../../components/ui-utils.ts';
import { useConfirm, useToast } from '../../../components/feedback.ts';
import { useT } from '../../../i18n/index.tsx';
import { useAuth } from '../../../auth/useAuth.ts';
import { formatDate } from '../../../lib/format.ts';
import { errorText } from '../labels.ts';
import { daysUntil } from './attachments.ts';
import { useLeaseTasks, type LeaseTask } from './tasks.ts';

function DueBadge({ task }: { task: LeaseTask }) {
  const t = useT();
  if (!task.due_date) return null;
  if (task.done) return <span className="muted small">{formatDate(task.due_date)}</span>;
  const days = daysUntil(task.due_date);
  const tone = days < 0 ? 'danger' : days <= 14 ? 'warning' : 'neutral';
  const label = days < 0 ? t('leases.tasks.overdue', { date: formatDate(task.due_date) }) : t('leases.tasks.due', { date: formatDate(task.due_date) });
  return <Badge tone={tone}>{label}</Badge>;
}

export default function TasksCard({ leaseId, onChanged, onOpenAttachment }: { leaseId: string; onChanged: () => void; onOpenAttachment: (id: string) => void }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit } = useAuth();
  const tasks = useLeaseTasks(leaseId, onChanged);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const open = (tasks.data ?? []).filter((x) => !x.done);
  const done = (tasks.data ?? []).filter((x) => x.done);

  const add = async () => {
    if (!title.trim()) return;
    setAdding(true);
    try {
      await tasks.create({ title: title.trim(), due_date: due || null });
      setTitle('');
      setDue('');
    } catch (err) {
      toast(errorText(t, err), 'danger');
    } finally {
      setAdding(false);
    }
  };

  const run = (fn: () => Promise<void>) => fn().catch((err) => toast(errorText(t, err), 'danger'));

  const row = (task: LeaseTask) => (
    <li key={task.id} className={cx('lw-task', task.done && 'lw-task-done')}>
      <input
        type="checkbox"
        checked={task.done}
        disabled={!canEdit}
        aria-label={task.done ? t('leases.tasks.reopen') : t('leases.tasks.complete')}
        onChange={() => void run(() => tasks.update(task.id, { done: !task.done }))}
      />
      <div className="lw-task-body">
        <span className="lw-task-title">{task.title}</span>
        <span className="lw-task-meta">
          <DueBadge task={task} />
          {task.attachment_id && task.attachment_name && (
            <button type="button" className="lw-link" onClick={() => onOpenAttachment(task.attachment_id!)}>📎 {task.attachment_name}</button>
          )}
          {task.created_by_name && <span>{task.created_by_name}</span>}
        </span>
      </div>
      {canEdit && (
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('common.delete')}
          title={t('common.delete')}
          onClick={async () => {
            if (await confirm({ title: t('leases.tasks.deleteTitle'), message: task.title, confirmLabel: t('common.delete'), danger: true })) void run(() => tasks.remove(task.id));
          }}
        >
          ✕
        </Button>
      )}
    </li>
  );

  return (
    <Card title={<span>{t('leases.tasks.title')} {open.length > 0 && <span className="lw-docs-count">{open.length}</span>}</span>}>
      {canEdit && (
        <form className="lw-task-add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <Input value={title} maxLength={300} placeholder={t('leases.tasks.placeholder')} onChange={(e) => setTitle(e.target.value)} aria-label={t('leases.tasks.placeholder')} />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label={t('leases.tasks.dueDate')} title={t('leases.tasks.dueDate')} />
          <Button type="submit" variant="primary" loading={adding} disabled={!title.trim()}>{t('leases.tasks.add')}</Button>
        </form>
      )}
      {tasks.loading && !tasks.data && <Spinner />}
      {tasks.error && <ErrorState error={tasks.error} onRetry={tasks.reload} />}
      {tasks.data && !open.length && <p className="muted small">{t('leases.tasks.none')}</p>}
      {open.length > 0 && <ul className="lw-tasks">{open.map(row)}</ul>}
      {done.length > 0 && (
        <>
          <Button size="sm" variant="ghost" onClick={() => setShowDone((v) => !v)}>
            {showDone ? t('leases.tasks.hideDone') : t('leases.tasks.showDone', { count: done.length })}
          </Button>
          {showDone && <ul className="lw-tasks">{done.map(row)}</ul>}
        </>
      )}
    </Card>
  );
}
