// Clauses of the lease family grouped by type, with source (Claude AI / SVM / Vercel AI / LangChain / Llama), confidence,
// alternatives and location. Editors can change a clause's type, mark it verified, or remove it (history: Activity tab).
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Select, Spinner } from '../../../components/ui.tsx';
import { useConfirm, useToast } from '../../../components/feedback.ts';
import { useAuth } from '../../../auth/useAuth.ts';
import { useT } from '../../../i18n/index.tsx';
import { del, get, patch } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';
import { formatPercent } from '../../../lib/format.ts';
import type { ClauseItem, ClauseSource } from '../types.ts';

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const tone = value >= 0.85 ? 'success' : value >= 0.6 ? 'warning' : 'danger';
  return <Badge tone={tone}>{formatPercent(value)}</Badge>;
}

const SOURCES: ClauseSource[] = ['claude', 'svm', 'gateway', 'langchain', 'llama', 'user'];
const SOURCE_TONE = { claude: 'neutral', svm: 'info', gateway: 'primary', langchain: 'warning', llama: 'success', user: 'primary' } as const;
const SHOWS_MODEL = new Set<ClauseSource>(['gateway', 'langchain', 'llama']);

function SourceBadge({ source, model }: { source: ClauseSource; model: string | null }) {
  const t = useT();
  return (
    <Badge tone={SOURCE_TONE[source] ?? 'neutral'} title={t(`leases.clauses.sourceHint.${source}`, { model: model ?? '' }).replace(/\s*\(\)$/, '')}>
      {source === 'user' ? '👤 ' : ''}{t(`leases.clauses.source.${source}`)}{(SHOWS_MODEL.has(source) || source === 'user') && model ? ` · ${model}` : ''}
    </Badge>
  );
}

/** Sources whose predictions use the lease_clauses.json taxonomy (others use the standard CLAUSE_TYPES). */
const LEASE_TAXONOMY = new Set<ClauseSource>(['svm', 'langchain', 'llama']);
interface Taxonomies { lease: string[]; standard: string[] }

function ClauseEditor({ clause, taxonomies, onSave, onCancel }: {
  clause: ClauseItem; taxonomies: Taxonomies | null; onSave: (type: string) => Promise<void>; onCancel: () => void;
}) {
  const t = useT();
  const [type, setType] = useState(clause.clause_type);
  const [busy, setBusy] = useState(false);
  const leaseFirst = LEASE_TAXONOMY.has(clause.source ?? 'claude');
  const groups = taxonomies
    ? (leaseFirst
      ? [['leases.clauses.typeLease', taxonomies.lease], ['leases.clauses.typeStandard', taxonomies.standard]]
      : [['leases.clauses.typeStandard', taxonomies.standard], ['leases.clauses.typeLease', taxonomies.lease]]) as [string, string[]][]
    : [];
  const save = async () => {
    setBusy(true);
    try {
      await onSave(type);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row lw-clause-editor">
      <Select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('leases.clauses.newType')} disabled={!taxonomies}>
        {!groups.some(([, list]) => list.includes(clause.clause_type)) && <option value={clause.clause_type}>{clause.clause_type}</option>}
        {groups.map(([label, list]) => (
          <optgroup key={label} label={t(label)}>
            {list.map((name) => <option key={name} value={name}>{name}</option>)}
          </optgroup>
        ))}
      </Select>
      <Button size="sm" variant="primary" onClick={save} loading={busy} disabled={type === clause.clause_type}>{t('common.save')}</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
    </div>
  );
}

export default function ClausesTab({ leaseId, onChanged }: { leaseId: string; onChanged?: () => void }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit } = useAuth();
  const [filter, setFilter] = useState('');
  const [source, setSource] = useState<'all' | ClauseSource>('all');
  const [showRemoved, setShowRemoved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(
    (signal) => get<{ clause_type: string; clauses: ClauseItem[] }[]>(`/leases/${leaseId}/clauses`, showRemoved ? { include_dismissed: 1 } : undefined, signal),
    [leaseId, showRemoved],
  );
  const taxonomies = useAsync((signal) => (canEdit ? get<Taxonomies>('/clauses/taxonomies', undefined, signal) : Promise.resolve(null)), [canEdit]);

  const update = async (c: ClauseItem, body: { clause_type?: string; verified?: boolean; dismissed?: boolean }) => {
    try {
      await patch(`/leases/${leaseId}/clauses/${c.id}`, body);
      toast(t('leases.clauses.saved'));
      setEditing(null);
      reload();
      onChanged?.();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };
  const remove = async (c: ClauseItem) => {
    if (!(await confirm({ title: t('leases.clauses.removeTitle'), message: t('leases.clauses.removeBody'), confirmLabel: t('leases.clauses.remove'), danger: true }))) return;
    await update(c, { dismissed: true });
  };
  // Clauses a user added are deleted outright (predictions are only removed, so a re-run can't bring them back).
  const deleteUserClause = async (c: ClauseItem) => {
    if (!(await confirm({ title: t('leases.clauses.deleteUserTitle'), message: t('leases.clauses.deleteUserBody'), confirmLabel: t('common.delete'), danger: true }))) return;
    try {
      await del(`/leases/${leaseId}/clauses/${c.id}`);
      toast(t('leases.clauses.saved'));
      reload();
      onChanged?.();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };
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
    const counts: Record<ClauseSource, number> = { claude: 0, svm: 0, gateway: 0, langchain: 0, llama: 0, user: 0 };
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
          <label className="checkbox small">
            <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />{t('leases.clauses.showRemoved')}
          </label>
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
              <li key={c.id} className={c.dismissed ? 'lw-clause-removed' : undefined}>
                <div className="row lw-clause-meta">
                  <SourceBadge source={c.source ?? 'claude'} model={c.source === 'user' ? c.created_by_name ?? null : c.model ?? null} />
                  <ConfidenceBadge value={c.confidence} />
                  {c.original_clause_type && (
                    <Badge tone="warning" title={t('leases.clauses.editedHint', { type: c.original_clause_type })}>{t('leases.clauses.edited')}</Badge>
                  )}
                  {c.verified && <Badge tone="success">✓ {t('leases.clauses.verified')}</Badge>}
                  {c.dismissed && <Badge tone="danger">{t('leases.clauses.removed')}</Badge>}
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
                {canEdit && (editing === c.id ? (
                  <ClauseEditor clause={c} taxonomies={taxonomies.data ?? null} onSave={(type) => update(c, { clause_type: type })} onCancel={() => setEditing(null)} />
                ) : (
                  <div className="row lw-clause-actions">
                    {c.dismissed ? (
                      <Button size="sm" variant="ghost" onClick={() => update(c, { dismissed: false })}>{t('leases.clauses.restore')}</Button>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c.id)}>{t('leases.clauses.changeType')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => update(c, { verified: !c.verified })}>
                          {c.verified ? t('leases.clauses.unverify') : t('leases.clauses.verify')}
                        </Button>
                        {c.source === 'user'
                          ? <Button size="sm" variant="ghost" onClick={() => deleteUserClause(c)}>{t('common.delete')}</Button>
                          : <Button size="sm" variant="ghost" onClick={() => remove(c)}>{t('leases.clauses.remove')}</Button>}
                      </>
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
