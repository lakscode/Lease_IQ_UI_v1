// Activity: processing timeline per file, abstract edits and AI usage per file.
import { Badge, Card, ErrorState, Spinner } from '../../../components/ui.tsx';
import { useT } from '../../../i18n/index.tsx';
import { get } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';
import { formatDateTime, formatNumber, formatTokens } from '../../../lib/format.ts';
import { FileStatusBadge } from '../shared.tsx';
import { StepList } from '../FileCard.tsx';
import { stepLabel } from '../labels.ts';
import { EditHistory } from './AbstractTab.tsx';
import type { ActivityResponse } from '../types.ts';

export default function ActivityTab({ leaseId, version }: { leaseId: string; version: number }) {
  const t = useT();
  const { data, error, loading, reload } = useAsync((signal) => get<ActivityResponse>(`/leases/${leaseId}/activity`, undefined, signal), [leaseId, version]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="stack">
      <Card title={t('leases.activity.processing')}>
        {data.files.length === 0 ? (
          <p className="muted">{t('leases.activity.noFiles')}</p>
        ) : (
          <div className="lw-activity-files">
            {data.files.map((f) => (
              <details key={f.id} className="lw-activity-file" open={data.files.length === 1}>
                <summary>
                  <span className="cell-title">{f.file_name}</span>
                  <FileStatusBadge status={f.status} />
                  <span className="muted small">{formatDateTime(f.created_at)}</span>
                </summary>
                {f.error && <p className="lw-err small">{f.error}</p>}
                <StepList steps={f.steps} />
                {f.logs.length > 0 && (
                  <ul className="lw-log-lines">
                    {f.logs.map((l) => (
                      <li key={l.id} className={`lw-log-${l.level}`}>
                        <span className="muted">{formatDateTime(l.created_at)}</span>{' '}
                        {l.step && <Badge>{stepLabel(t, l.step)}</Badge>} {l.message}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('leases.activity.usage')} padded={false}>
        {data.usage.length === 0 ? (
          <div className="card-body"><p className="muted">{t('leases.activity.noUsage')}</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('leases.activity.file')}</th><th>{t('leases.activity.process')}</th><th>{t('leases.activity.model')}</th>
                  <th className="num">{t('leases.activity.calls')}</th><th className="num">{t('leases.activity.input')}</th>
                  <th className="num">{t('leases.activity.output')}</th><th className="num">{t('leases.activity.cache')}</th>
                  <th className="num">{t('leases.activity.seconds')}</th>
                </tr>
              </thead>
              <tbody>
                {data.usage.map((u, i) => (
                  <tr key={i}>
                    <td className="small">{u.file_name ?? '—'}</td>
                    <td className="small">{t(`leases.process.${u.process}`)}</td>
                    <td className="small">{u.model}</td>
                    <td className="num">{u.calls}</td>
                    <td className="num">{formatTokens(u.input_tokens)}</td>
                    <td className="num">{formatTokens(u.output_tokens)}</td>
                    <td className="num">{formatTokens(u.cache_tokens)}</td>
                    <td className="num">{formatNumber(u.duration_ms / 1000, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t('leases.abstract.history')}>
        <EditHistory leaseId={leaseId} version={version} />
      </Card>
    </div>
  );
}
