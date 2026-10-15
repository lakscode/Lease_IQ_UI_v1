// Clauses of the lease family grouped by type, with source (Claude AI / SVM / Vercel AI), confidence, alternatives and location.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Badge, Card, EmptyState, ErrorState, Input, Select, Spinner } from '../../../components/ui.tsx';
import { useT } from '../../../i18n/index.tsx';
import { get } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';
import { formatPercent } from '../../../lib/format.ts';
import type { ClauseItem, ClauseSource } from '../types.ts';

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const tone = value >= 0.85 ? 'success' : value >= 0.6 ? 'warning' : 'danger';
  return <Badge tone={tone}>{formatPercent(value)}</Badge>;
}

const SOURCES: ClauseSource[] = ['claude', 'svm', 'gateway', 'langchain', 'llama'];
const SOURCE_TONE = { claude: 'neutral', svm: 'info', gateway: 'primary', langchain: 'warning', llama: 'success' } as const;
const SHOWS_MODEL = new Set<ClauseSource>(['gateway', 'langchain', 'llama']);

function SourceBadge({ source, model }: { source: ClauseSource; model: string | null }) {
  const t = useT();
  return (
    <Badge tone={SOURCE_TONE[source] ?? 'neutral'} title={t(`leases.clauses.sourceHint.${source}`, { model: model ?? '' }).replace(/\s*\(\)$/, '')}>
      {t(`leases.clauses.source.${source}`)}{SHOWS_MODEL.has(source) && model ? ` · ${model}` : ''}
    </Badge>
  );
}

export default function ClausesTab({ leaseId }: { leaseId: string }) {
  const t = useT();
  const [filter, setFilter] = useState('');
  const [source, setSource] = useState<'all' | ClauseSource>('all');
  const { data, error, loading, reload } = useAsync(
    (signal) => get<{ clause_type: string; clauses: ClauseItem[] }[]>(`/leases/${leaseId}/clauses`, undefined, signal),
    [leaseId],
  );
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (data ?? [])
      .map((g) => ({
        ...g,
        clauses: g.clauses.filter((c) =>
          (source === 'all' || (c.source ?? 'claude') === source) &&
          (!q || g.clause_type.toLowerCase().includes(q) || !!c.text?.toLowerCase().includes(q))),
      }))
      .filter((g) => g.clauses.length > 0);
  }, [data, filter, source]);
  const sourceCounts = useMemo(() => {
    const counts: Record<ClauseSource, number> = { claude: 0, svm: 0, gateway: 0, langchain: 0, llama: 0 };
    for (const g of data ?? []) for (const c of g.clauses) counts[c.source ?? 'claude']++;
    return counts;
  }, [data]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.length) return <EmptyState icon="§" title={t('leases.clauses.empty')} />;
  const total = data.reduce((n, g) => n + g.clauses.length, 0);

  return (
    <div className="stack">
      <div className="row-between">
        <span className="muted">{t('leases.clauses.summary', { count: total, types: data.length })}</span>
        <div className="row">
          <Select value={source} onChange={(e) => setSource(e.target.value as 'all' | ClauseSource)} aria-label={t('leases.clauses.sourceFilter')}>
            <option value="all">{t('leases.clauses.source.all')} ({SOURCES.reduce((n, src) => n + sourceCounts[src], 0)})</option>
            {SOURCES.filter((src) => sourceCounts[src] > 0 || src === source).map((src) => (
              <option key={src} value={src}>{t(`leases.clauses.source.${src}`)} ({sourceCounts[src]})</option>
            ))}
          </Select>
          <Input type="search" placeholder={t('leases.clauses.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('leases.clauses.filter')} />
        </div>
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
                  <SourceBadge source={c.source ?? 'claude'} model={c.model ?? null} />
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
