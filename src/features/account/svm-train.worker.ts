// Web Worker: retrains the clause SVM in the super admin's browser (Settings → Train model). It runs the API's own
// trainer (API lib/clause-svm-train.ts, shared with `npm run svm:train`), so the model is built exactly as the bundled
// one, plus users' clauses. The deployed API can't train: Edge Functions limit CPU time per request.
import { prepareExamples, trainModel, type Example } from '../../../../API/supabase/functions/api/lib/clause-svm-train.ts';

export interface TrainRequest {
  clauses: Record<string, string>;
  base: [string, string][];
  feedback: [string, string, string][];
}

export type TrainMessage =
  | { type: 'progress'; step: number; steps: number; stage: string }
  | { type: 'done'; result: TrainOutput }
  | { type: 'error'; message: string };

export interface TrainOutput {
  model: ReturnType<typeof trainModel>['model'];
  calibration: ReturnType<typeof trainModel>['cross_validation']['calibration'];
  accuracy: number;
  macro_f1: number;
  cv_examples: number;
  examples: number;
  base_examples: number;
  /** Users' clauses that added a new example (not already in the training data). */
  feedback_examples: number;
  seconds: number;
}

self.onmessage = (e: MessageEvent<TrainRequest>) => {
  const started = performance.now();
  try {
    const { clauses, base, feedback } = e.data;
    const baseRows: Example[] = base.map(([text, label]) => ({ text, label }));
    const baseCount = prepareExamples(baseRows, clauses).examples.length;
    const { examples } = prepareExamples([...baseRows, ...feedback.map(([text, label]) => ({ text, label }))], clauses);
    const result = trainModel(examples, clauses, (p) => self.postMessage({ type: 'progress', ...p } satisfies TrainMessage));
    const output: TrainOutput = {
      model: result.model,
      calibration: result.cross_validation.calibration,
      accuracy: result.cross_validation.accuracy,
      macro_f1: result.cross_validation.macro_f1,
      cv_examples: result.cross_validation.examples,
      examples: examples.length,
      base_examples: baseCount,
      feedback_examples: examples.length - baseCount,
      seconds: Math.round((performance.now() - started) / 1000),
    };
    self.postMessage({ type: 'done', result: output } satisfies TrainMessage);
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message ?? String(err) } satisfies TrainMessage);
  }
};
