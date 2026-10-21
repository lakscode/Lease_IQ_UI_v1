// Super admin: retrain the local clause SVM with users' clauses (added on the PDF, re-typed or verified) on top of the
// training data, compare it with the active model, and publish it. Training runs in this browser (svm-train.worker.ts);
// the API serves the data and stores the published model.
import { useEffect, useRef, useState } from 'react';
import { get, post } from '../../api/client.ts';
import { Alert, Badge, Button, Card, ErrorState, Spinner, StatTile } from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDateTime, formatNumber, formatPercent } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import type { TrainMessage, TrainOutput, TrainRequest } from './svm-train.worker.ts';

interface ModelSummary {
  id: string;
  created_at: string;
  created_by_name: string | null;
  trained_at: string;
  examples: number;
  feedback_examples: number;
  metrics: { accuracy: number; macro_f1: number } | null;
  active: boolean;
}

interface SvmStatus {
  active: {
    source: 'bundled' | 'retrained';
    model_id: string | null;
    trained_at: string;
    clause_types: number;
    examples: number;
    accuracy: number | null;
    macro_f1: number | null;
    feedback_examples: number;
  };
  built_in: { trained_at: string; clause_types: number; examples: number; accuracy: number | null; macro_f1: number | null };
  models: ModelSummary[];
  feedback: { usable: number; added: number; retyped: number; verified: number; new_since_active: number; unmapped: number };
}

interface TrainingData extends TrainRequest { feedback_through: string | null }

type Phase = { kind: 'idle' } | { kind: 'loading' } | { kind: 'training'; step: number; steps: number; stage: string } | { kind: 'done'; result: TrainOutput; through: string | null };

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatPercent(v, 1));

export function ClauseTrainingPanel() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const status = useAsync((signal) => get<SvmStatus>('/admin/svm', undefined, signal));
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const train = async () => {
    setError(null);
    setPhase({ kind: 'loading' });
    try {
      const data = await get<TrainingData>('/admin/svm/training-data');
      workerRef.current?.terminate();
      const worker = new Worker(new URL('./svm-train.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent<TrainMessage>) => {
        const msg = e.data;
        if (msg.type === 'progress') setPhase({ kind: 'training', step: msg.step, steps: msg.steps, stage: msg.stage });
        else if (msg.type === 'done') { setPhase({ kind: 'done', result: msg.result, through: data.feedback_through }); worker.terminate(); }
        else { setError(msg.message); setPhase({ kind: 'idle' }); worker.terminate(); }
      };
      worker.onerror = (e) => { setError(e.message || t('common.error')); setPhase({ kind: 'idle' }); worker.terminate(); };
      worker.postMessage({ clauses: data.clauses, base: data.base, feedback: data.feedback } satisfies TrainRequest);
      setPhase({ kind: 'training', step: 0, steps: 6, stage: 'cv' });
    } catch (err) {
      setError((err as Error).message);
      setPhase({ kind: 'idle' });
    }
  };

  const cancel = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setPhase({ kind: 'idle' });
  };

  const publish = async (result: TrainOutput, through: string | null) => {
    setBusy('publish');
    try {
      await post('/admin/svm/models', {
        model: result.model,
        calibration: result.calibration,
        feedback_examples: result.feedback_examples,
        feedback_through: through,
        activate: true,
      });
      toast(t('account.train.published'), 'success');
      setPhase({ kind: 'idle' });
      status.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const activate = async (id: string | null) => {
    const ok = await confirm({
      title: id ? t('account.train.useTitle') : t('account.train.builtInTitle'),
      message: id ? t('account.train.useBody') : t('account.train.builtInBody'),
      confirmLabel: id ? t('account.train.use') : t('account.train.useBuiltIn'),
    });
    if (!ok) return;
    setBusy(id ?? 'built-in');
    try {
      await post(id ? `/admin/svm/models/${id}/activate` : '/admin/svm/use-built-in');
      toast(t('account.train.switched'), 'success');
      status.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (status.loading && !status.data) return <Spinner />;
  if (status.error) return <ErrorState error={status.error} onRetry={status.reload} />;
  const s = status.data;
  if (!s) return null;
  const running = phase.kind === 'loading' || phase.kind === 'training';

  return (
    <div className="stack">
      <Card
        title={t('account.train.title')}
        actions={
          running
            ? <Button onClick={cancel}>{t('common.cancel')}</Button>
            : <Button variant="primary" onClick={train} disabled={busy !== null}>{t('account.train.retrain')}</Button>
        }
      >
        <p className="muted small">{t('account.train.intro')}</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <Badge tone={s.active.source === 'retrained' ? 'info' : 'neutral'}>
            {s.active.source === 'retrained' ? t('account.train.activeRetrained') : t('account.train.activeBuiltIn')}
          </Badge>
          <span className="small">{t('account.train.activeDetail', {
            date: formatDateTime(s.active.trained_at),
            examples: formatNumber(s.active.examples),
            accuracy: pct(s.active.accuracy),
            f1: pct(s.active.macro_f1),
          })}</span>
          {s.active.feedback_examples > 0 && <span className="small muted">{t('account.train.includesFeedback', { count: formatNumber(s.active.feedback_examples) })}</span>}
        </div>
        <div className="tiles">
          <StatTile label={t('account.train.usable')} value={formatNumber(s.feedback.usable)} />
          <StatTile label={t('account.train.added')} value={formatNumber(s.feedback.added)} />
          <StatTile label={t('account.train.retyped')} value={formatNumber(s.feedback.retyped)} />
          <StatTile label={t('account.train.verified')} value={formatNumber(s.feedback.verified)} />
          <StatTile label={t('account.train.newSince')} value={formatNumber(s.feedback.new_since_active)} tone={s.feedback.new_since_active ? 'warning' : 'neutral'} />
        </div>
        {s.feedback.unmapped > 0 && <p className="small muted">{t('account.train.unmapped', { count: formatNumber(s.feedback.unmapped) })}</p>}
        {error && <Alert tone="danger">{error}</Alert>}

        {running && (
          <div className="stack" style={{ gap: 6, marginTop: 12 }}>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${phase.kind === 'training' ? Math.max(5, (phase.step / phase.steps) * 100) : 3}%` }} />
            </div>
            <span className="small muted">
              {phase.kind === 'loading' ? t('account.train.loading')
                : phase.stage === 'cv' ? t('account.train.fold', { n: phase.step + 1, total: phase.steps - 1 })
                : t('account.train.final')}
            </span>
            <span className="small muted">{t('account.train.keepOpen')}</span>
          </div>
        )}
      </Card>

      {phase.kind === 'done' && (
        <Card title={t('account.train.resultTitle')}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th /><th className="num">{t('account.train.current')}</th><th className="num">{t('account.train.new')}</th></tr></thead>
              <tbody>
                <tr><td>{t('account.train.examples')}</td><td className="num">{formatNumber(s.active.examples)}</td><td className="num">{formatNumber(phase.result.examples)}</td></tr>
                <tr><td>{t('account.train.feedbackIncluded')}</td><td className="num">{formatNumber(s.active.feedback_examples)}</td><td className="num">{formatNumber(phase.result.feedback_examples)}</td></tr>
                <tr><td>{t('account.train.clauseTypes')}</td><td className="num">{s.active.clause_types}</td><td className="num">{phase.result.model.classes.length}</td></tr>
                <tr><td>{t('account.train.accuracy')}</td><td className="num">{pct(s.active.accuracy)}</td><td className="num"><strong>{pct(phase.result.accuracy)}</strong></td></tr>
                <tr><td>{t('account.train.macroF1')}</td><td className="num">{pct(s.active.macro_f1)}</td><td className="num"><strong>{pct(phase.result.macro_f1)}</strong></td></tr>
              </tbody>
            </table>
          </div>
          <p className="small muted">{t('account.train.resultNote', { seconds: phase.result.seconds })}</p>
          {phase.result.feedback_examples === 0 && <Alert tone="info">{t('account.train.noFeedback')}</Alert>}
          <div className="form-actions">
            <Button onClick={() => setPhase({ kind: 'idle' })}>{t('account.train.discard')}</Button>
            <Button variant="primary" loading={busy === 'publish'} onClick={() => publish(phase.result, phase.through)}>{t('account.train.publish')}</Button>
          </div>
        </Card>
      )}

      <Card
        title={t('account.train.historyTitle')}
        padded={false}
        actions={s.active.source === 'retrained' && (
          <Button size="sm" loading={busy === 'built-in'} disabled={busy !== null || running} onClick={() => activate(null)}>{t('account.train.useBuiltIn')}</Button>
        )}
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('account.train.trained')}</th>
                <th>{t('account.train.by')}</th>
                <th className="num">{t('account.train.examples')}</th>
                <th className="num">{t('account.train.feedbackIncluded')}</th>
                <th className="num">{t('account.train.accuracy')}</th>
                <th className="num">{t('account.train.macroF1')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.models.map((m) => (
                <tr key={m.id}>
                  <td className="small">{formatDateTime(m.created_at)}</td>
                  <td className="small">{m.created_by_name ?? '—'}</td>
                  <td className="num">{formatNumber(m.examples)}</td>
                  <td className="num">{formatNumber(m.feedback_examples)}</td>
                  <td className="num">{pct(m.metrics?.accuracy)}</td>
                  <td className="num">{pct(m.metrics?.macro_f1)}</td>
                  <td>
                    {m.active
                      ? <Badge tone="success">{t('account.train.active')}</Badge>
                      : <Button size="sm" variant="ghost" loading={busy === m.id} disabled={busy !== null || running} onClick={() => activate(m.id)}>{t('account.train.use')}</Button>}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="small">{formatDateTime(s.built_in.trained_at)}</td>
                <td className="small">{t('account.train.builtIn')}</td>
                <td className="num">{formatNumber(s.built_in.examples)}</td>
                <td className="num">0</td>
                <td className="num">{pct(s.built_in.accuracy)}</td>
                <td className="num">{pct(s.built_in.macro_f1)}</td>
                <td>{s.active.source === 'bundled' && <Badge tone="success">{t('account.train.active')}</Badge>}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
