// System record comparison for one lease (embedded in the lease workspace): the newest matched rent roll row
// shown next to the lease terms, with mismatches highlighted.
import { Link } from 'react-router';
import { get } from '../../api/client.ts';
import { useAuth } from '../../auth/AuthProvider.tsx';
import { Alert, Badge, Card, EmptyState, ErrorState, Spinner } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import type { SystemRecordResponse } from './types.ts';
import './analytics.css';

const DATE_FIELDS = new Set(['start_date', 'end_date', 'next_escalation_date']);
const MONEY_FIELDS = new Set(['monthly_base_rent', 'security_deposit', 'next_escalation_rent']);

export default function SystemRecordTab({ leaseId }: { leaseId: string }) {
  const t = useT();
  const { currency } = useAuth();
  const { data, error, loading, reload } = useAsync((signal) => get<SystemRecordResponse>(`/imports/records/by-lease/${leaseId}`, undefined, signal), [leaseId]);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  if (!data.record || !data.import) {
    return (
      <EmptyState icon="🗂️" title={t('analytics.sys.emptyTitle')} action={<Link className="btn btn-primary" to="/import">{t('analytics.sys.importLink')}</Link>}>
        {t('analytics.sys.emptyBody')}
      </EmptyState>
    );
  }

  const fmt = (field: string, v: string | number | null) => {
    if (v === null || v === undefined || v === '') return '—';
    if (DATE_FIELDS.has(field)) return formatDate(String(v));
    if (MONEY_FIELDS.has(field)) return formatMoney(Number(v), currency, 2);
    if (field === 'area') return `${formatNumber(Number(v))} ${t('analytics.sqft')}`;
    return String(v);
  };
  const mismatches = data.comparison.filter((c) => c.match === false).length;
  const r = data.record;
  const extras: [string, string][] = [];
  if (r.external_id) extras.push([t('analytics.rr.external_id'), r.external_id]);
  if (r.status) extras.push([t('analytics.rr.status'), r.status]);
  for (const k of ['cam', 'tax', 'insurance', 'other_charges'] as const) {
    if (r[k] !== null) extras.push([t(`analytics.rr.${k}`), formatMoney(r[k], currency, 2)]);
  }
  for (const [k, v] of Object.entries(r.charge_codes ?? {})) extras.push([k, formatMoney(v, currency, 2)]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Alert tone={mismatches ? 'warning' : 'success'} title={mismatches ? t('analytics.sys.mismatches', { n: mismatches }) : t('analytics.sys.allMatch')}>
        {t('analytics.sys.source', {
          source: t(`analytics.imp.src.${data.import.source}`),
          file: data.import.file_name ?? '—',
          date: formatDateTime(data.import.created_at),
        })}{' '}
        <Link to={`/import?import=${data.import.id}`}>{t('analytics.sys.viewImport')}</Link>
      </Alert>

      <Card title={t('analytics.sys.title')} padded={false}>
        <div className="table-wrap">
          <table className="table an-compare">
            <thead>
              <tr>
                <th>{t('analytics.sys.field')}</th>
                <th>{t('analytics.sys.lease')}</th>
                <th>{t('analytics.sys.system')}</th>
                <th>{t('analytics.sys.result')}</th>
              </tr>
            </thead>
            <tbody>
              {data.comparison.map((c) => (
                <tr key={c.field} className={c.match === false ? 'mismatch' : undefined}>
                  <td>{t(`analytics.sys.f.${c.field}`)}</td>
                  <td>{fmt(c.field, c.lease_value)}</td>
                  <td className="sys">{fmt(c.field, c.system_value)}</td>
                  <td>
                    {c.match === true && <Badge tone="success"><span className="an-match-icon" aria-hidden="true">✓</span>{t('analytics.sys.match')}</Badge>}
                    {c.match === false && <Badge tone="danger"><span className="an-match-icon" aria-hidden="true">≠</span>{t('analytics.sys.mismatch')}</Badge>}
                    {c.match === null && <Badge>{t('analytics.sys.notComparable')}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {extras.length > 0 && (
        <Card title={t('analytics.sys.otherCharges')}>
          <dl className="dl">
            {extras.map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  );
}
