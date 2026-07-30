// check-engine core types — spec §3/§5. Pure TS: no DOM, no chrome.*, no fetch.
// A check consumes probe results and returns a verdict; all browser I/O lives
// in the probe layer.

import type { CategoryId, CheckId } from './config';

export type CheckStatus = 'pass' | 'fail' | 'na';

/** What the probe layer hands to a check: one fetched resource, framework-free. */
export interface ProbeResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  /** Where the response actually came from after redirects (res.url). */
  finalUrl?: string;
  /** True when the response was reached via redirect(s) — evidence honesty. */
  redirected?: boolean;
}

/**
 * Non-HTTP detection results supplied by the probe layer (spec §3): WebMCP is
 * detected by a MAIN-world in-page script, not an HTTP probe. `not-detectable`
 * = the detection could not run (origin-trial browser without the API, script
 * not injected) — which must NOT read as "site is not agent-ready".
 */
export interface ProbeSignals {
  webMcp?: 'detected' | 'not-detected' | 'not-detectable';
}

export interface CheckContext {
  /** Origin under audit, e.g. https://example.com */
  origin: string;
  /** Probe responses keyed by probe key (see PROBE in config). */
  responses: Map<string, ProbeResponse>;
  /** In-page detection signals; absent = detection layer did not run. */
  signals?: ProbeSignals;
}

/** What a check implementation returns; metadata is merged in by the engine. */
export interface Verdict {
  status: CheckStatus;
  /** Raw fact backing the verdict: status code, header excerpt, etc. */
  evidence: string;
}

export type CheckFn = (ctx: CheckContext) => Verdict;

export interface CheckResult extends Verdict {
  id: CheckId;
  category: CategoryId;
  standard: string;
  /** Whether the check counts toward the composite score (spec §4). */
  scored: boolean;
  /** Ready-to-paste prompt for a coding agent to fix the failure. */
  fixPrompt: string;
  /** Link to the standard / spec behind the check. */
  docUrl: string;
}
