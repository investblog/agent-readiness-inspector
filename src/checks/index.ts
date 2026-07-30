import { robotsTxt } from './robots';
import type { Check, CheckContext, CheckResult } from './types';

// Registry of all checks (spec §3). M0 fills this out check by check.
export const checks: Check[] = [robotsTxt];

export function runChecks(ctx: CheckContext): CheckResult[] {
  return checks.map((check) => check(ctx));
}

export type { Category, Check, CheckContext, CheckResult, CheckStatus, ProbeResponse } from './types';
