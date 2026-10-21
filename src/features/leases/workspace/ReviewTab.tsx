// Review after abstraction: did the AI find the basic fields and the expected clauses, and are they right?
// Shows automatic checks and the optional AI check next to each item; editors mark each one and can correct a
// field value in place. The checklist comes from the API (lib/review-checklist.json).
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, Badge, Button, Card, ErrorState, Input, Select, Spinner, StatTile, Textarea } from '../../../components/ui.tsx';
import { cx, type Tone } from '../../../components/ui-utils.ts';
import { useConfirm, useToast } from '../../../components/feedback.ts';
import { useT, type TFunction } from '../../../i18n/index.tsx';
import { useAuth } from '../../../auth/useAuth.ts';
import { get, patch, post, put } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';
import { formatDateTime } from '../../../lib/format.ts';
import { errorText, formatFieldValue } from '../labels.ts';
import type { CheckStatus, LeaseDetail, ReviewCheck, ReviewClauseItem, ReviewFieldItem, ReviewResponse } from '../types.ts';

type Filter = 'all' | 'attention' | 'unreviewed';

const CHECK_TONE: Record<CheckStatus, Tone> = {
  ok: 'success', missing: 'danger', invalid: 'danger', warning: 'warning', low_confidence: 'warning', not_found: 'neutral',
};
const ISSUES: CheckStatus[] = ['missing', 'invalid', 'warning', 'low_confidence'];

function CheckBadge({ check }: { check: ReviewCheck }) {
  const t = useT();
  return (
    <div className="lw-review-check">
      <Badge tone={CHECK_TONE[check.status]}>{t(`leases.review.status.${check.status}`)}</Badge>
      {check.messages.filter((m) => m.code !== 'missing' && m.code !== 'notFound' && m.code !== 'clauseMissing').map((m) => (
        <span key={m.code} className="small muted">{t(`leases.review.check.${m.code}`, m.params)}</span>
      ))}
    </div>
  );
}

function VerdictButtons<V extends string>({ options, value, disabled, onChange }: {
  options: V[];
  value: V | null;
  disabled: boolean;
  onChange: (v: V | null) => void;
}) {
  const t = useT();
  return (
    <div className="lw-verdicts" role="group" aria-label={t('leases.review.yourReview')}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={cx('lw-verdict', `lw-verdict-${o}`, value === o && 'lw-verdict-on')}
          aria-pressed={value === o}
          disabled={disabled}
          onClick={() => onChange(value === o ? null : o)}
        >
          {t(`leases.review.verdict.${o}`)}
        </button>
      ))}
    </div>
  );
}

function pageLink(docId: string | null, page: number | null) {
  return docId ? `?tab=documents&doc=${docId}${page ? `&page=${page}` : ''}` : null;
}

function needsAttention(item: ReviewFieldItem | ReviewClauseItem): boolean {
  if (ISSUES.includes(item.auto.status)) return true;
  if (item.verdict === 'incorrect' || item.verdict === 'missing') return true;
  if ('kind' in item) return item.ai?.status === 'incorrect';
  return item.ai !== null && item.ai.present !== item.found > 0;
}

function reviewedBy(t: TFunction, item: { reviewed_by_name: string | null; reviewed_at: string | null }) {
  if (!item.reviewed_at) return null;
  return <div className="small muted">{t('leases.review.by', { name: item.reviewed_by_name ?? '—', date: formatDateTime(item.reviewed_at) })}</div>;
}

/** Note on a negative verdict; saved when the box loses focus. */
function NoteBox({ value, disabled, onSave }: { value: string | null; disabled: boolean; onSave: (note: string) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(value ?? '');
  return (
    <Input
      className="lw-review-note"
      placeholder={t('leases.review.notePlaceholder')}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== (value ?? '') && onSave(draft.trim())}
    />
  );
}

function FieldRow({ item, detail, locked, onVerdict, onCorrected }: {
  item: ReviewFieldItem;
  detail: LeaseDetail;
  locked: boolean;
  onVerdict: (verdict: string | null, note?: string | null) => Promise<void>;
  onCorrected: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { currency } = useAuth();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const targetDoc = item.source_document_id ?? detail.lease.main_document_id ?? detail.documents[0]?.id ?? null;
  const valueLink = pageLink(item.source_document_id, item.page);
  const aiLink = item.ai ? pageLink(item.ai.document_id, item.ai.page) : null;

  const startCorrection = () => setDraft(item.ai?.correct_value ?? (item.value === null ? '' : String(item.value)));
  const saveCorrection = async () => {
    if (!targetDoc || draft === null) return;
    setSaving(true);
    try {
      await patch(`/leases/${detail.lease.id}/documents/${targetDoc}/abstract`, { field: item.key, value: draft.trim() === '' ? null : draft });
      await onVerdict('incorrect', item.note ?? t('leases.review.correctedNote', { value: item.value === null ? '—' : String(item.value) }));
      setDraft(null);
      toast(t('leases.review.corrected'), 'success');
      onCorrected();
    } catch (err) {
      toast(errorText(t, err), 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className={cx(needsAttention(item) && !item.verdict && 'lw-review-attn')}>
      <td>
        <div className="cell-title">{t(`leases.field.${item.key}`) === `leases.field.${item.key}` ? item.label : t(`leases.field.${item.key}`)}</div>
        {item.required && <span className="small muted">{t('leases.review.required')}</span>}
      </td>
      <td className="lw-review-value">
        <span className={cx('lw-pre', item.value === null && 'muted')}>{formatFieldValue(item.key, item.value, currency)}</span>
        {(item.source_title || valueLink) && (
          <div className="small muted">
            {item.source_title}
            {valueLink && item.page != null && <> · <Link to={valueLink}>{t('leases.abstract.page', { page: item.page })}</Link></>}
          </div>
        )}
      </td>
      <td>
        <CheckBadge check={item.auto} />
        {item.ai && (
          <div className="lw-review-ai">
            <Badge tone={item.ai.status === 'incorrect' ? 'danger' : item.ai.status === 'correct' ? 'success' : 'neutral'}>
              {t(`leases.review.ai.${item.ai.status}`)}
            </Badge>
            {item.ai.correct_value && <span className="small"><strong>{t('leases.review.aiSuggests')}</strong> {item.ai.correct_value}</span>}
            {item.ai.note && <span className="small muted">{item.ai.note}</span>}
            {aiLink && item.ai.page != null && <Link className="small" to={aiLink}>{t('leases.abstract.page', { page: item.ai.page })}</Link>}
          </div>
        )}
      </td>
      <td>
        <VerdictButtons options={['correct', 'incorrect', 'not_applicable']} value={item.verdict} disabled={locked} onChange={(v) => onVerdict(v)} />
        {item.verdict === 'incorrect' && !locked && (
          draft === null ? (
            <button type="button" className="lw-linkbtn small" onClick={startCorrection} disabled={!targetDoc}>{t('leases.review.fixValue')}</button>
          ) : (
            <div className="lw-review-fix">
              {item.kind === 'longtext' ? (
                <Textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
              ) : (
                <Input
                  type={item.kind === 'date' ? 'date' : item.kind === 'number' || item.kind === 'money' ? 'number' : 'text'}
                  step="any"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveCorrection(); if (e.key === 'Escape') setDraft(null); }}
                  autoFocus
                />
              )}
              <div className="row">
                <Button size="sm" variant="primary" loading={saving} onClick={saveCorrection}>{t('leases.review.saveFix')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
              </div>
            </div>
          )
        )}
        {item.verdict === 'incorrect' && <NoteBox value={item.note} disabled={locked} onSave={(note) => onVerdict('incorrect', note)} />}
        {reviewedBy(t, item)}
      </td>
    </tr>
  );
}

function ClauseRow({ item, locked, onVerdict }: {
  item: ReviewClauseItem;
  locked: boolean;
  onVerdict: (verdict: string | null, note?: string | null) => Promise<void>;
}) {
  const t = useT();
  const sample = item.samples[0];
  const aiLink = item.ai ? pageLink(item.ai.document_id, item.ai.page) : null;
  const negative = item.verdict === 'incorrect' || item.verdict === 'missing';
  return (
    <tr className={cx(needsAttention(item) && !item.verdict && 'lw-review-attn')}>
      <td>
        <div className="cell-title">{item.name}</div>
        {item.required && <span className="small muted">{t('leases.review.required')}</span>}
        <div className="small muted" title={item.match.join(', ')}>{t('leases.review.matches', { types: item.match.slice(0, 3).join(', ') + (item.match.length > 3 ? '…' : '') })}</div>
      </td>
      <td className="lw-review-value">
        {item.found ? (
          <>
            <div>
              {t('leases.review.foundCount', { count: item.found })}
              {item.best_confidence !== null && <span className="muted small"> · {t('leases.review.confidence', { pct: Math.round(item.best_confidence * 100) })}</span>}
              {item.verified > 0 && <span className="muted small"> · {t('leases.review.verifiedCount', { count: item.verified })}</span>}
            </div>
            {item.pages.length > 0 && <div className="small muted">{t('leases.review.pages', { pages: item.pages.join(', ') })}</div>}
            {sample && (
              <Link to={`?tab=documents&doc=${sample.document_id}${sample.page ? `&page=${sample.page}` : ''}`} className="lw-review-snippet small" title={sample.text}>
                <span className="muted">{sample.clause_type}:</span> {sample.text}
              </Link>
            )}
          </>
        ) : (
          <span className="muted">{t('leases.review.notPredicted')}</span>
        )}
      </td>
      <td>
        <CheckBadge check={item.auto} />
        {item.ai && (
          <div className="lw-review-ai">
            <Badge tone={item.ai.present === item.found > 0 ? 'success' : 'danger'}>
              {item.ai.present ? t('leases.review.ai.present') : t('leases.review.ai.absent')}
            </Badge>
            {item.ai.note && <span className="small muted">{item.ai.note}</span>}
            {aiLink && item.ai.page != null && <Link className="small" to={aiLink}>{t('leases.abstract.page', { page: item.ai.page })}</Link>}
          </div>
        )}
      </td>
      <td>
        <VerdictButtons options={['correct', 'incorrect', 'missing', 'not_applicable']} value={item.verdict} disabled={locked} onChange={(v) => onVerdict(v)} />
        {negative && <NoteBox value={item.note} disabled={locked} onSave={(note) => onVerdict(item.verdict, note)} />}
        {negative && !locked && <Link className="small" to="?tab=clauses">{t('leases.review.fixClauses')}</Link>}
        {reviewedBy(t, item)}
      </td>
    </tr>
  );
}

export default function ReviewTab({ detail, onChanged }: { detail: LeaseDetail; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit, config } = useAuth();
  const leaseId = detail.lease.id;
  const { data, error, loading, reload, setData } = useAsync((signal) => get<ReviewResponse>(`/leases/${leaseId}/review`, undefined, signal), [leaseId]);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const completed = data.review?.status === 'completed';
  const locked = !canEdit || completed;
  const s = data.summary;
  const judged = s.correct + s.incorrect;

  const run = async (name: string, fn: () => Promise<ReviewResponse>, success?: string) => {
    setBusy(name);
    try {
      setData(await fn());
      if (success) toast(success, 'success');
    } catch (err) {
      toast(errorText(t, err), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const setVerdict = (kind: 'field' | 'clause', key: string) => async (verdict: string | null, note?: string | null) => {
    try {
      setData(await put<ReviewResponse>(`/leases/${leaseId}/review/items`, { kind, key, verdict, note: note ?? null }));
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const complete = async () => {
    const open = s.total - s.reviewed;
    if (open > 0) {
      const ok = await confirm({ title: t('leases.review.completeTitle'), message: t('leases.review.completeOpen', { count: open }), confirmLabel: t('leases.review.complete') });
      if (!ok) return;
    }
    await run('complete', () => post(`/leases/${leaseId}/review/complete`), t('leases.review.completed'));
  };

  const markRestCorrect = async () => {
    const pending = [
      ...data.fields.filter((f) => !f.verdict && f.auto.status === 'ok' && f.ai?.status !== 'incorrect').map((f) => ({ kind: 'field' as const, key: f.key })),
      ...data.clauses.filter((c) => !c.verdict && c.auto.status === 'ok' && (!c.ai || c.ai.present)).map((c) => ({ kind: 'clause' as const, key: c.name })),
    ];
    if (!pending.length) return;
    const ok = await confirm({ title: t('leases.review.acceptTitle'), message: t('leases.review.acceptBody', { count: pending.length }), confirmLabel: t('leases.review.accept') });
    if (!ok) return;
    await run('accept', async () => {
      let last: ReviewResponse | null = null;
      for (const p of pending) last = await put<ReviewResponse>(`/leases/${leaseId}/review/items`, { ...p, verdict: 'correct' });
      return last!;
    });
  };

  const show = <T extends ReviewFieldItem | ReviewClauseItem>(items: T[]) =>
    items.filter((i) => filter === 'all' || (filter === 'unreviewed' ? !i.verdict : needsAttention(i)));
  const fields = show(data.fields);
  const clauses = show(data.clauses);

  return (
    <div className="stack lw-review" style={{ gap: 16 }}>
      <Card
        title={
          <span className="row">
            {t('leases.review.title')}
            <Badge tone={completed ? 'success' : data.review ? 'info' : 'neutral'}>
              {t(`leases.review.state.${data.review?.status ?? 'not_started'}`)}
            </Badge>
          </span>
        }
        actions={canEdit && (
          <div className="row">
            {!completed && (
              <Button
                size="sm"
                loading={busy === 'ai'}
                disabled={config?.ai === false || busy !== null}
                title={config?.ai === false ? t('leases.err.aiNotConfigured') : t('leases.review.aiHint')}
                onClick={() => run('ai', () => post(`/leases/${leaseId}/review/ai-check`), t('leases.review.aiDone'))}
              >
                {data.review?.ai_checked_at ? t('leases.review.aiRerun') : t('leases.review.aiRun')}
              </Button>
            )}
            {!completed && <Button size="sm" disabled={busy !== null} loading={busy === 'accept'} onClick={markRestCorrect}>{t('leases.review.accept')}</Button>}
            {completed ? (
              <Button size="sm" loading={busy === 'complete'} onClick={() => run('complete', () => post(`/leases/${leaseId}/review/complete`, { reopen: true }))}>{t('leases.review.reopen')}</Button>
            ) : (
              <Button size="sm" variant="primary" loading={busy === 'complete'} disabled={busy !== null} onClick={complete}>{t('leases.review.complete')}</Button>
            )}
          </div>
        )}
      >
        <p className="muted small lw-review-intro">{t('leases.review.intro')}</p>
        {completed && data.review?.completed_at && (
          <Alert tone="success">{t('leases.review.completedBy', { name: data.review.completed_by_name ?? '—', date: formatDateTime(data.review.completed_at) })}</Alert>
        )}
        {data.review?.ai_checked_at && <p className="small muted">{t('leases.review.aiCheckedAt', { date: formatDateTime(data.review.ai_checked_at) })}</p>}
        <div className="tiles">
          <StatTile label={t('leases.review.tile.fields')} value={`${s.fields_found}/${s.fields_total}`} hint={s.fields_required_missing ? t('leases.review.requiredMissing', { count: s.fields_required_missing }) : undefined} tone={s.fields_required_missing ? 'danger' : 'neutral'} />
          <StatTile label={t('leases.review.tile.clauses')} value={`${s.clauses_found}/${s.clauses_total}`} hint={s.clauses_required_missing ? t('leases.review.requiredMissing', { count: s.clauses_required_missing }) : undefined} tone={s.clauses_required_missing ? 'danger' : 'neutral'} />
          <StatTile label={t('leases.review.tile.issues')} value={s.issues + s.ai_disagreements} hint={s.ai_disagreements ? t('leases.review.aiDisagreements', { count: s.ai_disagreements }) : undefined} tone={s.issues + s.ai_disagreements ? 'warning' : 'success'} onClick={() => setFilter('attention')} />
          <StatTile label={t('leases.review.tile.reviewed')} value={`${s.reviewed}/${s.total}`} onClick={() => setFilter('unreviewed')} />
          <StatTile label={t('leases.review.tile.accuracy')} value={judged ? `${Math.round((s.correct / judged) * 100)}%` : '—'} hint={judged ? t('leases.review.accuracyHint', { correct: s.correct, total: judged }) : undefined} />
        </div>
        <div className="row lw-review-filter">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label={t('leases.review.filter')}>
            <option value="all">{t('leases.review.filterAll')}</option>
            <option value="attention">{t('leases.review.filterAttention')}</option>
            <option value="unreviewed">{t('leases.review.filterUnreviewed')}</option>
          </Select>
        </div>
      </Card>

      <Card title={t('leases.review.fieldsTitle')} padded={false}>
        {fields.length === 0 ? <p className="card-body muted">{t('leases.review.nothing')}</p> : (
          <div className="table-wrap">
            <table className="table lw-review-table">
              <thead>
                <tr><th>{t('leases.review.colField')}</th><th>{t('leases.review.colPredicted')}</th><th>{t('leases.review.colChecks')}</th><th>{t('leases.review.yourReview')}</th></tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <FieldRow key={f.key} item={f} detail={detail} locked={locked} onVerdict={setVerdict('field', f.key)} onCorrected={() => { reload(); onChanged(); }} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t('leases.review.clausesTitle')} padded={false} actions={<Link className="btn btn-sm btn-ghost" to="?tab=clauses">{t('leases.review.openClauses')}</Link>}>
        {clauses.length === 0 ? <p className="card-body muted">{t('leases.review.nothing')}</p> : (
          <div className="table-wrap">
            <table className="table lw-review-table">
              <thead>
                <tr><th>{t('leases.review.colClause')}</th><th>{t('leases.review.colPredicted')}</th><th>{t('leases.review.colChecks')}</th><th>{t('leases.review.yourReview')}</th></tr>
              </thead>
              <tbody>
                {clauses.map((c) => <ClauseRow key={c.name} item={c} locked={locked} onVerdict={setVerdict('clause', c.name)} />)}
              </tbody>
            </table>
          </div>
        )}
        {data.extra_clauses.length > 0 && (
          <div className="card-body lw-review-extra">
            <span className="small muted">{t('leases.review.otherClauses')}</span>
            {data.extra_clauses.map((e) => <span key={e.clause_type} className="lw-chip">{e.clause_type} ({e.count})</span>)}
          </div>
        )}
      </Card>
    </div>
  );
}
