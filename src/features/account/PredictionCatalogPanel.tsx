// Super admin: what the predictions use — abstract fields extracted by AI, the two clause taxonomies (with SVM
// training data and quality), and which clause classifier each organization uses.
import { useMemo, useState } from 'react';
import { get } from '../../api/client.ts';
import { Badge, Card, ErrorState, Input, Spinner } from '../../components/ui.tsx';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatPercent } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import type { PredictionCatalog } from './types.ts';

/** Classifiers that use each taxonomy. */
const LEASE_TAXONOMY = ['svm', 'langchain', 'llama'];

function F1Badge({ value }: { value: number | null }) {
  const t = useT();
  if (value === null) return <span className="muted small">{t('account.catalog.notTested')}</span>;
  const tone = value >= 0.85 ? 'success' : value >= 0.6 ? 'warning' : 'danger';
  return <Badge tone={tone}>{formatPercent(value)}</Badge>;
}

export function PredictionCatalogPanel() {
  const t = useT();
  const { data, error, loading, reload } = useAsync((signal) => get<PredictionCatalog>('/admin/prediction-catalog', undefined, signal));
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const leaseClauses = useMemo(
    () => (data?.lease_clauses ?? []).filter((c) => !query || c.name.toLowerCase().includes(query) || c.id.includes(query))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [data, query],
  );
  const standard = useMemo(() => (data?.standard_clauses ?? []).filter((n) => !query || n.toLowerCase().includes(query)), [data, query]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const untrained = data.lease_clauses.filter((c) => c.examples === 0).length;
  const usersOf = (taxonomy: 'lease' | 'standard') =>
    data.orgs.filter((o) => (taxonomy === 'lease') === LEASE_TAXONOMY.includes(o.classifier)).map((o) => o.name);

  return (
    <div className="stack">
      <Card title={t('account.catalog.orgsTitle')} padded={false}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('account.org.name')}</th><th>{t('account.orgs.classifierLabel')}</th><th>{t('account.catalog.taxonomy')}</th></tr></thead>
            <tbody>
              {data.orgs.map((o) => (
                <tr key={o.id}>
                  <td className="cell-title">{o.name}</td>
                  <td>{t(`account.orgs.classifier.${o.classifier}`)}{o.model ? <span className="muted small"> · {o.model}</span> : null}</td>
                  <td className="small">{t(LEASE_TAXONOMY.includes(o.classifier) ? 'account.catalog.leaseTitle' : 'account.catalog.standardTitle')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`${t('account.catalog.fieldsTitle')} (${data.fields.length})`} padded={false}>
        <div className="card-body"><p className="muted small">{t('account.catalog.fieldsHint')}</p></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('account.catalog.field')}</th><th>{t('account.catalog.key')}</th><th>{t('account.catalog.kind')}</th><th>{t('account.catalog.group')}</th></tr></thead>
            <tbody>
              {data.fields.map((f) => (
                <tr key={f.key}>
                  <td className="cell-title">{t(`leases.field.${f.key}`)}{f.lease_column && <> <Badge tone="info" title={t('account.catalog.leaseColumnHint')}>{t('account.catalog.leaseColumn')}</Badge></>}</td>
                  <td><code>{f.key}</code></td>
                  <td className="small">{t(`account.catalog.kind.${f.kind}`)}</td>
                  <td className="small">{t(`leases.group.${f.group}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="row-between">
        <span className="muted small">{t('account.catalog.filterHint')}</span>
        <Input type="search" placeholder={t('account.catalog.filter')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('account.catalog.filter')} />
      </div>

      <Card title={`${t('account.catalog.leaseTitle')} (${data.lease_clauses.length})`} padded={false}>
        <div className="card-body stack">
          <p className="muted small">
            {t('account.catalog.leaseHint')}{' '}
            {data.svm.accuracy !== null && t('account.catalog.svmQuality', {
              accuracy: formatPercent(data.svm.accuracy), examples: data.svm.cv_examples ?? 0, date: formatDate(data.svm.trained_at),
            })}
          </p>
          {untrained > 0 && <p className="small">{t('account.catalog.untrained', { count: untrained })}</p>}
          <p className="muted small">{t('account.catalog.usedBy', { orgs: usersOf('lease').join(', ') || '—' })}</p>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('account.catalog.clause')}</th><th>{t('account.catalog.id')}</th><th className="num">{t('account.catalog.examples')}</th><th>{t('account.catalog.svmF1')}</th></tr></thead>
            <tbody>
              {leaseClauses.map((c) => (
                <tr key={c.id}>
                  <td className="cell-title">{c.name}</td>
                  <td><code className="small">{c.id}</code></td>
                  <td className="num">{c.examples || <Badge tone="warning">{t('account.catalog.noData')}</Badge>}</td>
                  <td>{c.examples ? <F1Badge value={c.svm_f1} /> : <span className="muted small">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`${t('account.catalog.standardTitle')} (${data.standard_clauses.length})`}>
        <div className="stack">
          <p className="muted small">{t('account.catalog.standardHint')}</p>
          <p className="muted small">{t('account.catalog.usedBy', { orgs: usersOf('standard').join(', ') || '—' })}</p>
          <div className="acct-chips">{standard.map((n) => <Badge key={n}>{n}</Badge>)}</div>
        </div>
      </Card>
    </div>
  );
}
