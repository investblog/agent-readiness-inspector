// check-engine core types — spec §3/§5. Pure TS: no DOM, no chrome.*, no fetch.
// A check consumes probe results and returns a CheckResult; all browser I/O
// lives in the probe layer.

export type Category = 'discoverability' | 'content' | 'bot-access' | 'capabilities' | 'commerce';

export type CheckStatus = 'pass' | 'fail' | 'na';

export interface CheckResult {
  id: string;
  category: Category;
  standard: string;
  status: CheckStatus;
  /** Raw fact backing the verdict: status code, header excerpt, etc. */
  evidence: string;
  /** Ready-to-paste prompt for a coding agent to fix the failure. */
  fixPrompt: string;
  /** Link to the standard / spec behind the check. */
  docUrl: string;
}

/** What the probe layer hands to a check: one fetched resource, framework-free. */
export interface ProbeResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface CheckContext {
  /** Origin under audit, e.g. https://example.com */
  origin: string;
  /** Probe responses keyed by request path (e.g. '/robots.txt'). */
  responses: Map<string, ProbeResponse>;
}

export type Check = (ctx: CheckContext) => CheckResult;
