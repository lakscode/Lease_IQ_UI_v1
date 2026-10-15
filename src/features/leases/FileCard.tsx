// One uploaded file on the Leases page: status, documents found, badges, token use and actions.
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, Badge, Button, Modal, Spinner, ErrorState } from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { useAuth } from '../../auth/useAuth.ts';
import { del, get, post } from '../../api/client.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { formatBytes, formatDateTime, formatTokens } from '../../lib/format.ts';
import { DocTypeBadge, FileStatusBadge } from './shared.tsx';
import { errorText, stepLabel } from './labels.ts';
import { openSignedUrl } from './open-signed-url.ts';
import type { LeaseFile, PipelineStep, ProcessingLog } from './types.ts';

export function StepList({ steps }: { steps: PipelineStep[] }) {
  const t = useT();
  return (
    <ol className="lw-steps">
      {steps.map((s) => (
        <li key={s.name} className={`lw-step lw-step-${s.status}`}>
          <span className="lw-step-dot" aria-hidden="true" />
          <div>
            <div className="lw-step-name">
              {stepLabel(t, s.name)} <span className="muted small">· {t(`leases.stepStatus.${s.status}`)}</span>
            </div>
            {s.detail && <div className="muted small lw-break">{s.detail}</div>}
            {s.finished_at && <div className="muted small">{formatDateTime(s.finished_at)}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ProcessingLogModal({ fileId, onClose }: { fileId: string; onClose: () => void }) {
  const t = useT();
  const { data, error, loading, reload } = useAsync(
    (signal) => get<{ file: { file_name: string; status: string; error: string | null }; steps: PipelineStep[]; logs: ProcessingLog[] }>(`/files/${fileId}/logs`, undefined, signal),
    [fileId],
  );
  return (
    <Modal open wide title={t('leases.files.logTitle')} onClose={onClose} footer={<Button onClick={reload}>{t('leases.files.refresh')}</Button>}>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="stack">
          <strong>{data.file.file_name}</strong>
          {data.file.error && <Alert tone="danger">{data.file.error}</Alert>}
          <StepList steps={data.steps} />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>{t('leases.files.time')}</th><th>{t('leases.files.step')}</th><th>{t('leases.files.message')}</th></tr>
              </thead>
              <tbody>
                {data.logs.map((l) => (
                  <tr key={l.id} className={l.level === 'error' ? 'lw-log-error' : l.level === 'warn' ? 'lw-log-warn' : undefined}>
                    <td className="lw-nowrap small">{formatDateTime(l.created_at)}</td>
                    <td className="small">{l.step ? stepLabel(t, l.step) : '—'}</td>
                    <td className="small lw-break">{l.message}</td>
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

export default function FileCard({ file, onChanged }: { file: LeaseFile; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const active = file.status === 'queued' || file.status === 'processing';
  const done = file.steps.filter((s) => s.status === 'done').length;
  const leaseIds = [...new Set(file.documents.map((d) => d.lease_id).filter(Boolean))];

  async function act(name: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(name);
    try {
      await fn();
      if (success) toast(success, 'success');
      onChanged();
    } catch (err) {
      toast(errorText(t, err), 'danger');
    } finally {
      setBusy(null);
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: t('leases.files.deleteTitle'),
      message: t('leases.files.deleteBody', { name: file.file_name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (ok) act('delete', () => del(`/files/${file.id}`), t('leases.files.deleted'));
  };

  const reanalyze = async () => {
    const ok = await confirm({ title: t('leases.files.reanalyzeTitle'), message: t('leases.files.reanalyzeBody'), confirmLabel: t('leases.files.reanalyze') });
    if (ok) act('reanalyze', () => post(`/files/${file.id}/reanalyze`), t('leases.files.reanalyzeStarted'));
  };

  return (
    <article className="card lw-file">
      <div className="lw-file-head">
        <div className="lw-file-title">
          <span className="lw-file-icon" aria-hidden="true">📄</span>
          <div>
            <div className="cell-title lw-break">{file.file_name}</div>
            <div className="cell-sub">
              {formatDateTime(file.created_at)}
              {file.uploaded_by_name ? ` · ${file.uploaded_by_name}` : ''}
              {file.file_size ? ` · ${formatBytes(file.file_size)}` : ''}
              {file.source !== 'computer' ? ` · ${t(`leases.source.${file.source}`)}` : ''}
            </div>
          </div>
        </div>
        <div className="row">
          <FileStatusBadge status={file.status} />
          {file.is_scanned !== null && <Badge tone={file.is_scanned ? 'warning' : 'neutral'}>{file.is_scanned ? t('leases.files.scanned') : t('leases.files.digital')}</Badge>}
          {file.page_count != null && <Badge>{t('leases.files.pages', { count: file.page_count })}</Badge>}
          {file.target_lease_id && <Badge tone="info">{t('leases.files.amendmentUpload')}</Badge>}
        </div>
      </div>

      {active && (
        <div className="lw-file-progress">
          <div className="progress"><div className="progress-bar" style={{ width: `${file.steps.length ? Math.max(5, (done / file.steps.length) * 100) : 5}%` }} /></div>
          <span className="muted small">
            {(() => {
              const current = file.steps.find((s) => s.status === 'running' || s.status === 'pending');
              return current ? stepLabel(t, current.name) : t('leases.fileStatus.queued');
            })()}
          </span>
        </div>
      )}

      {file.status === 'failed' && file.error && <Alert tone="danger" title={t('leases.files.failed')}>{file.error}</Alert>}

      {file.documents.length > 0 && (
        <div className="lw-file-docs">
          <div className="muted small">{t('leases.files.documentsFound', { count: file.documents.length })}</div>
          <ul>
            {file.documents.map((d) => (
              <li key={d.id}>
                <DocTypeBadge type={d.doc_type} />
                {d.lease_id ? (
                  <Link to={`/leases/${d.lease_id}/details?tab=documents&doc=${d.id}`} className="lw-break">{d.title || t(`leases.docType.${d.doc_type}`)}</Link>
                ) : (
                  <span className="lw-break">{d.title || t(`leases.docType.${d.doc_type}`)}</span>
                )}
                <span className="muted small">
                  {d.page_start != null ? t('leases.files.pageRange', { from: d.page_start, to: d.page_end ?? d.page_start }) : ''}
                  {d.tenant_name ? ` · ${d.tenant_name}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {file.status === 'completed' && file.documents.length === 0 && <Alert tone="warning">{t('leases.files.noDocuments')}</Alert>}

      <div className="lw-file-foot">
        <div className="row lw-tokens">
          {file.tokens.length === 0 ? (
            <span className="muted small">{t('leases.files.noTokens')}</span>
          ) : (
            file.tokens.map((r) => (
              <span key={r.process} className="lw-chip" title={t('leases.files.tokenDetail', { input: r.input_tokens, output: r.output_tokens, calls: r.calls })}>
                {t(`leases.process.${r.process}`)}: {formatTokens(r.total_tokens)} {t('leases.files.tokens')}
              </span>
            ))
          )}
        </div>
        <div className="row">
          {leaseIds.length === 1 && <Link className="btn btn-sm btn-ghost" to={`/leases/${leaseIds[0]}`}>{t('leases.files.openLease')}</Link>}
          <Button size="sm" variant="ghost" onClick={() => openSignedUrl(() => get(`/files/${file.id}/pdf`), (m) => toast(m, 'danger'))}>{t('leases.files.openPdf')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowLog(true)}>{t('leases.files.log')}</Button>
          {canEdit && file.status === 'failed' && (
            <Button size="sm" loading={busy === 'retry'} onClick={() => act('retry', () => post(`/files/${file.id}/retry`), t('leases.files.retryStarted'))}>{t('common.retry')}</Button>
          )}
          {canEdit && (file.status === 'completed' || file.status === 'failed') && (
            <Button size="sm" loading={busy === 'reanalyze'} onClick={reanalyze}>{t('leases.files.reanalyze')}</Button>
          )}
          {canEdit && file.status === 'completed' && file.documents.length > 0 && (
            <Button size="sm" loading={busy === 'sig'} onClick={() => act('sig', () => post(`/files/${file.id}/signatures`), t('leases.files.signaturesStarted'))}>{t('leases.files.checkSignatures')}</Button>
          )}
          {canEdit && <Button size="sm" variant="danger" disabled={active && file.locked} loading={busy === 'delete'} onClick={remove}>{t('common.delete')}</Button>}
        </div>
      </div>
      {showLog && <ProcessingLogModal fileId={file.id} onClose={() => setShowLog(false)} />}
    </article>
  );
}
