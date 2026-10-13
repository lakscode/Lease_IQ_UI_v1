// Signatures (per document, with AI re-check) and Document of record (fingerprint, verify now, access log).
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Spinner, useToast } from '../../../components/ui.tsx';
import { useT } from '../../../i18n/index.tsx';
import { useAuth } from '../../../auth/AuthProvider.tsx';
import { get, post } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';
import { formatDate, formatDateTime } from '../../../lib/format.ts';
import { DocTypeBadge, documentName, errorText, SignatureBadge } from '../shared.tsx';
import type { AccessEntry, LeaseDetail } from '../types.ts';

export function SignaturesTab({ detail, onChanged }: { detail: LeaseDetail; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const { canEdit, config } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const recheck = async (docId: string) => {
    setBusy(docId);
    try {
      await post(`/leases/${detail.lease.id}/documents/${docId}/signature`);
      toast(t('leases.sig.rechecked'), 'success');
      onChanged();
    } catch (err) {
      toast(errorText(t, err), 'danger');
    } finally {
      setBusy(null);
    }
  };

  if (!detail.documents.length) return <EmptyState title={t('leases.overview.noDocuments')} />;
  return (
    <div className="stack">
      {detail.documents.map((d) => {
        const sig = d.signature;
        return (
          <Card
            key={d.id}
            title={<span className="row"><DocTypeBadge type={d.doc_type} /> {documentName(t, d)}</span>}
            actions={canEdit && (
              <Button size="sm" loading={busy === d.id} disabled={config?.ai === false} title={config?.ai === false ? t('leases.err.aiNotConfigured') : undefined} onClick={() => recheck(d.id)}>
                {t('leases.sig.recheck')}
              </Button>
            )}
          >
            <div className="row lw-sig-head">
              <SignatureBadge signature={sig} />
              {sig?.method && <Badge>{t(`leases.sigMethod.${sig.method}`)}</Badge>}
              {sig?.checked_at && <span className="muted small">{t('leases.sig.checkedAt', { date: formatDateTime(sig.checked_at) })}</span>}
            </div>
            {sig?.parties && sig.parties.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('leases.sig.party')}</th><th>{t('leases.sig.signer')}</th><th>{t('common.date')}</th></tr></thead>
                  <tbody>
                    {sig.parties.map((p, i) => (
                      <tr key={i}>
                        <td>{p.party}</td>
                        <td>{p.signer || <span className="lw-err">{t('leases.sig.notSigned')}</span>}</td>
                        <td>{p.date ? formatDate(p.date) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">{sig ? t('leases.sig.noParties') : t('leases.sig.notCheckedYet')}</p>
            )}
            {sig?.signature_pages && sig.signature_pages.length > 0 && (
              <p className="small">
                {t('leases.sig.pages')}:{' '}
                {sig.signature_pages.map((p, i) => (
                  <span key={p}>{i > 0 && ', '}<Link to={`?tab=documents&doc=${d.id}&page=${p}`}>{p}</Link></span>
                ))}
              </p>
            )}
            {sig?.notes && <p className="small muted lw-pre">{sig.notes}</p>}
          </Card>
        );
      })}
    </div>
  );
}

interface VerifyResult { result: 'unchanged' | 'changed' | 'missing'; expected: string | null; actual: string | null; checked_at: string }

export function RecordTab({ detail }: { detail: LeaseDetail }) {
  const t = useT();
  const toast = useToast();
  const leaseId = detail.lease.id;
  const [results, setResults] = useState<Record<string, VerifyResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const log = useAsync((signal) => get<AccessEntry[]>(`/leases/${leaseId}/access-log`, undefined, signal), [leaseId]);

  const verify = async (docId: string) => {
    setBusy(docId);
    try {
      const r = await post<VerifyResult>(`/leases/${leaseId}/documents/${docId}/verify`);
      setResults((m) => ({ ...m, [docId]: r }));
      log.reload();
    } catch (err) {
      toast(errorText(t, err), 'danger');
    } finally {
      setBusy(null);
    }
  };
  const docTitle = (id: string | null) => {
    const d = detail.documents.find((x) => x.id === id);
    return d ? documentName(t, d) : null;
  };

  return (
    <div className="stack">
      <Card title={t('leases.record.title')}>
        <p className="muted small">{t('leases.record.intro')}</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('leases.abstract.document')}</th><th>{t('leases.record.fingerprint')}</th><th>{t('leases.record.result')}</th><th /></tr></thead>
            <tbody>
              {detail.documents.map((d) => {
                const r = results[d.id];
                return (
                  <tr key={d.id}>
                    <td><div className="cell-title">{documentName(t, d)}</div><div className="cell-sub">{t(`leases.docType.${d.doc_type}`)}</div></td>
                    <td className="lw-hash">{d.sha256 ?? <span className="muted">{t('leases.record.noFingerprint')}</span>}</td>
                    <td>
                      {r ? (
                        <>
                          <Badge tone={r.result === 'unchanged' ? 'success' : 'danger'}>{t(`leases.record.${r.result}`)}</Badge>
                          <div className="cell-sub">{formatDateTime(r.checked_at)}</div>
                          {r.result === 'changed' && r.actual && <div className="cell-sub lw-hash">{r.actual}</div>}
                        </>
                      ) : <span className="muted small">—</span>}
                    </td>
                    <td className="num"><Button size="sm" loading={busy === d.id} onClick={() => verify(d.id)}>{t('leases.record.verify')}</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('leases.record.accessLog')} padded={false}>
        {log.loading && !log.data && <div className="card-body"><Spinner /></div>}
        {log.error && <div className="card-body"><ErrorState error={log.error} onRetry={log.reload} /></div>}
        {log.data && log.data.length === 0 && <div className="card-body"><p className="muted">{t('leases.record.noAccess')}</p></div>}
        {log.data && log.data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('common.date')}</th><th>{t('leases.record.action')}</th><th>{t('leases.record.user')}</th><th>{t('leases.abstract.document')}</th><th>{t('leases.record.details')}</th></tr></thead>
              <tbody>
                {log.data.map((a) => (
                  <tr key={a.id}>
                    <td className="lw-nowrap small">{formatDateTime(a.created_at)}</td>
                    <td><Badge>{t(`leases.action.${a.action}`)}</Badge></td>
                    <td className="small">{a.user_name ?? '—'}</td>
                    <td className="small">{docTitle(a.document_id) ?? (a.document_id ? <span className="muted">{t('leases.record.deletedDoc')}</span> : '—')}</td>
                    <td className="small muted lw-break">{accessDetails(t, a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Alert tone="info">{t('leases.record.appendOnly')}</Alert>
    </div>
  );
}

function accessDetails(t: ReturnType<typeof useT>, a: AccessEntry): string {
  const d = a.details ?? {};
  if (a.action === 'edit') return `${t(`leases.field.${String(d.field)}`)}: ${d.old_value ?? '—'} → ${d.new_value ?? '—'}`;
  if (a.action === 'verify') return t(`leases.record.${String(d.result)}`);
  if (a.action === 'email' && Array.isArray(d.to)) return (d.to as string[]).join(', ');
  if (a.action === 'save') return t(`leases.source.${String(d.destination)}`);
  if (d.file_name) return String(d.file_name);
  if (d.filename) return String(d.filename);
  return '';
}
