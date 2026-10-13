// Clauses of the lease family grouped by type, with confidence, alternatives and location.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Badge, Card, EmptyState, ErrorState, Input, Spinner } from '../../../components/ui.tsx';
import { useT } from '../../../i18n/index.tsx';
import { get } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';
import { formatPercent } from '../../../lib/format.ts';
import type { ClauseItem } from '../types.ts';

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const tone = value >= 0.85 ? 'success' : value >= 0.6 ? 'warning' : 'danger';
  return <Badge tone={tone}>{formatPercent(value)}</Badge>;
}

export default function ClausesTab({ leaseId }: { leaseId: string }) {
  const t = useT();
  const [filter, setFilter] = useState('');
  const { data, error, loading, reload } = useAsync(
    (signal) => get<{ clause_type: string; clauses: ClauseItem[] }[]>(`/leases/${leaseId}/clauses`, undefined, signal),
    [leaseId],
  );
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? [])
      .map((g) => ({ ...g, clauses: g.clause_type.toLowerCase().includes(q) ? g.clauses : g.clauses.filter((c) => c.text?.toLowerCase().includes(q)) }))
      .filter((g) => g.clauses.length > 0);
  }, [data, filter]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.length) return <EmptyState icon="§" title={t('leases.clauses.empty')} />;
  const total = data.reduce((n, g) => n + g.clauses.length, 0);

  return (
    <div className="stack">
      <div className="row-between">
        <span className="muted">{t('leases.clauses.summary', { count: total, types: data.length })}</span>
        <Input type="search" placeholder={t('leases.clauses.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('leases.clauses.filter')} />
      </div>
      <nav className="lw-clause-index" aria-label={t('leases.clauses.types')}>
        {groups.map((g) => (
          <a key={g.clause_type} href={`#clause-${encodeURIComponent(g.clause_type)}`} className="lw-chip">{g.clause_type} <span className="muted">{g.clauses.length}</span></a>
        ))}
      </nav>
      {groups.map((g) => (
        <Card key={g.clause_type} title={<span id={`clause-${encodeURIComponent(g.clause_type)}`}>{g.clause_type} <span className="muted small">({g.clauses.length})</span></span>}>
          <ul className="lw-clauses">
            {g.clauses.map((c) => (
              <li key={c.id}>
                <div className="row lw-clause-meta">
                  <ConfidenceBadge value={c.confidence} />
                  <span className="small">{c.document_title || t(`leases.docType.${c.doc_type ?? 'other'}`)}</span>
                  {c.section && <span className="muted small">§ {c.section}</span>}
                  {c.page != null && (
                    <Link className="small" to={`?tab=documents&doc=${c.document_id}&page=${c.page}`}>{t('leases.abstract.page', { page: c.page })}</Link>
                  )}
                  {c.paragraph != null && <span className="muted small">{t('leases.clauses.paragraph', { n: c.paragraph })}</span>}
                  {c.line != null && <span className="muted small">{t('leases.clauses.line', { n: c.line })}</span>}
                </div>
                {c.text && <blockquote className="lw-quote">{c.text}</blockquote>}
                {c.alt_types && c.alt_types.length > 0 && (
                  <div className="small muted">
                    {t('leases.clauses.alternatives')}: {c.alt_types.map((a) => `${a.type} (${formatPercent(a.confidence)})`).join(', ')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
