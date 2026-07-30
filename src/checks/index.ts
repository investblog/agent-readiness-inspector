import { contentSignals, robotsTxtAiRules, webBotAuth } from './bot-access';
import { acp, ap2, mpp, ucp, x402 } from './commerce';
import type { CheckId } from './config';
import { checkMeta, MATRIX } from './config';
import { llmsTxt, markdownNegotiation } from './content';
import { dnsAid, linkHeaders, sitemap } from './discoverability';
import {
  a2aAgentCard,
  agentSkills,
  apiCatalog,
  authMd,
  mcpServerCard,
  oauthDiscovery,
  oauthProtectedResource,
  webMcp,
} from './discovery';
import { fixPrompt } from './prompts';
import { robotsTxt } from './robots';
import type { CheckContext, CheckFn, CheckResult } from './types';

// Implementation registry — all 22 matrix checks (M0-3 complete).
const IMPLEMENTATIONS: Record<CheckId, CheckFn> = {
  robotsTxt,
  sitemap,
  linkHeaders,
  dnsAid,
  markdownNegotiation,
  llmsTxt,
  contentSignals,
  robotsTxtAiRules,
  webBotAuth,
  agentSkills,
  apiCatalog,
  authMd,
  a2aAgentCard,
  mcpServerCard,
  oauthDiscovery,
  oauthProtectedResource,
  webMcp,
  x402,
  ucp,
  acp,
  ap2,
  mpp,
};

/** Ids run when no explicit selection is given (spec §3: A2A/llms.txt are off). */
export function defaultCheckIds(): CheckId[] {
  return MATRIX.filter((m) => m.defaultEnabled).map((m) => m.id);
}

/** Default set adjusted by user toggles (settings.checkOverrides, M2). */
export function resolveCheckIds(overrides?: Partial<Record<CheckId, boolean>>): CheckId[] {
  return MATRIX.filter((m) => overrides?.[m.id] ?? m.defaultEnabled).map((m) => m.id);
}

export interface RunOptions {
  /** Explicit check selection; defaults to all default-enabled checks. */
  include?: readonly CheckId[];
}

export function runChecks(ctx: CheckContext, opts: RunOptions = {}): CheckResult[] {
  const ids = opts.include ?? defaultCheckIds();
  const results: CheckResult[] = [];
  for (const id of ids) {
    const meta = checkMeta(id);
    const verdict = IMPLEMENTATIONS[id](ctx);
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
