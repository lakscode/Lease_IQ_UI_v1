// Shared UI building blocks. Styling lives in styles.css (class names below).
// Only components are exported here (React Fast Refresh): helpers are in ui-utils.ts, hooks in feedback.ts.
import {
  useCallback, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { useT } from '../i18n/index.tsx';
import type { LeaseStatus } from '../api/types.ts';
import { cx, type Tone } from './ui-utils.ts';
import { ConfirmContext, ToastContext, type ConfirmOptions } from './feedback.ts';

// ---- Buttons ---------------------------------------------------------------------------------

export function Button({
  variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="spinner spinner-inline" aria-hidden="true" />}
      {children}
    </button>
  );
}

// ---- Layout ----------------------------------------------------------------------------------

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        {back && <div className="page-back">{back}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, padded = true }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <div className="card-header">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'card-body' : undefined}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint, tone = 'neutral', onClick }: {
  label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={cx('card stat-tile', `tone-${tone}`, onClick && 'clickable')} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </Tag>
  );
}

// ---- Feedback --------------------------------------------------------------------------------

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={cx('badge', `badge-${tone}`)} title={title}>{children}</span>;
}

const STATUS_TONE: Record<LeaseStatus, Tone> = {
  active: 'success', expiring: 'warning', expired: 'danger', renewed: 'info', unknown: 'neutral',
};

export function LeaseStatusBadge({ status }: { status: LeaseStatus }) {
  const t = useT();
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{t(`status.${status}`)}</Badge>;
}

export function Spinner({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

export function Alert({ tone = 'info', title, children, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx('alert', `alert-${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
      <div className="alert-body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {action && <div className="alert-action">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <Alert tone="danger" title={t('common.error')} action={onRetry && <Button size="sm" onClick={onRetry}>{t('common.retry')}</Button>}>
      {error}
    </Alert>
  );
}

export function EmptyState({ icon = '📄', title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

// ---- Forms -----------------------------------------------------------------------------------

export function Field({ label, hint, error, children, full }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; full?: boolean }) {
  return (
    <label className={cx('field', full && 'field-full')}>
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={cx('input', props.className)} />;
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={cx('input', props.className)} />;
export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className={cx('input', props.className)} />;

// ---- Tabs ------------------------------------------------------------------------------------

export function Tabs<K extends string>({ items, active, onChange }: { items: { key: K; label: ReactNode; count?: number }[]; active: K; onChange: (key: K) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={item.key === active}
          className={cx('tab', item.key === active && 'tab-active')}
          onClick={() => onChange(item.key)}
        >
          {item.label}
          {item.count !== undefined && <span className="tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---- Modal -----------------------------------------------------------------------------------

export function Modal({ open, title, onClose, children, footer, wide }: {
  open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', wide && 'modal-wide')} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Promise-based confirm dialog: `const confirm = useConfirm(); if (await confirm({...})) ...` */

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(state)}
        title={state?.title}
        onClose={() => close(false)}
        footer={
          <>
            <Button onClick={() => close(false)}>{t('common.cancel')}</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {state?.confirmLabel ?? t('common.confirm')}
            </Button>
          </>
        }
      >
        {state?.message}
      </Modal>
    </ConfirmContext.Provider>
  );
}

// ---- Toasts ----------------------------------------------------------------------------------

interface Toast { id: number; tone: Tone; message: ReactNode }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: ReactNode, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, tone, message }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), tone === 'danger' ? 7000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={cx('toast', `toast-${toast.tone}`)}>{toast.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---- Misc ------------------------------------------------------------------------------------

/** Clickable column header for sortable tables. */
export function SortHeader<K extends string>({ label, column, sort, onSort, align }: {
  label: ReactNode; column: K; sort: { key: K; dir: 'asc' | 'desc' }; onSort: (key: K) => void; align?: 'right';
}) {
  const active = sort.key === column;
  return (
    <th className={cx(align === 'right' && 'num')} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="sort-btn" onClick={() => onSort(column)}>
        {label}
        <span className="sort-ind" aria-hidden="true">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}
