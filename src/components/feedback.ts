// Confirm-dialog and toast contexts and hooks. The providers (ConfirmProvider, ToastProvider) are components in
// ui.tsx; this module exports no components (React Fast Refresh).
import { createContext, useContext, type ReactNode } from 'react';
import type { Tone } from './ui-utils.ts';

/** Promise-based confirm dialog: `const confirm = useConfirm(); if (await confirm({...})) ...` */
export interface ConfirmOptions { title: ReactNode; message?: ReactNode; confirmLabel?: string; danger?: boolean }
export const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

export const ToastContext = createContext<((message: ReactNode, tone?: Tone) => void) | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
