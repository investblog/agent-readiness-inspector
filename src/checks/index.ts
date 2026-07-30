import type { CheckId } from './config';
import { checkMeta, MATRIX } from './config';
import { fixPrompt } from './prompts';
import { robotsTxt } from './robots';
import type { CheckContext, CheckFn, CheckResult } from './types';

// Implementation registry — filled out check by check through M0.
const IMPLEMENTATIONS: Partial<Record<CheckId, CheckFn>> = {
  robotsTxt,
};

export function implementedIds(): CheckId[] {
  return Object.keys(IMPLEMENTATIONS) as CheckId[];
}

/** Ids run when no explicit selection is given (spec §3: A2A/llms.txt are off). */
export function defaultCheckIds(): CheckId[] {
  return MATRIX.filter((m) => m.defaultEnabled).map((m) => m.id);
}

export interface RunOptions {
  /** Explicit check selection; defaults to all default-enabled checks. */
  include?: readonly CheckId[];
}

export function runChecks(ctx: CheckContext, opts: RunOptions = {}): CheckResult[] {
  const ids = opts.include ?? defaultCheckIds();
  const results: CheckResult[] = [];
  for (const id of ids) {
    const impl = IMPLEMENTATIONS[id];
    if (!impl) continue; // not yet implemented — absent from results, not `na`
    const meta = checkMeta(id);
    const verdict = impl(ctx);
    results.push({
      id,
      category: meta.category,
      standard: meta.standard,
      scored: meta.scored,
      docUrl: meta.docUrl,
      fixPrompt: fixPrompt(id),
      ...verdict,
    });
  }
  return results;
}

export type { CategoryId, CheckId, CheckMeta, LevelBand, ProbeKey } from './config';
export { checkMeta, LEVELS, MATRIX, MATRIX_VERSION, PROBE } from './config';
export type { CategoryScore, Scorecard } from './scoring';
export { levelFor, scoreResults } from './scoring';
export type { CheckContext, CheckFn, CheckResult, CheckStatus, ProbeResponse, Verdict } from './types';
