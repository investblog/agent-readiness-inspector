// Shared fixture helpers for check tests (not a test file itself).

import type { CheckId } from './config';
import { runChecks } from './index';
import type { CheckContext, CheckResult, ProbeResponse } from './types';

export function ctx(responses: Record<string, Partial<ProbeResponse>>): CheckContext {
  const map = new Map<string, ProbeResponse>();
  for (const [key, res] of Object.entries(responses)) {
    map.set(key, { url: `https://example.com${key}`, status: 200, headers: {}, body: '', ...res });
  }
  return { origin: 'https://example.com', responses: map };
}

/** Run a single check by id over fabricated probe responses. */
export function run(id: CheckId, responses: Record<string, Partial<ProbeResponse>>): CheckResult {
  const result = runChecks(ctx(responses), { include: [id] }).find((r) => r.id === id);
  if (!result) throw new Error(`${id} check missing from registry`);
  return result;
}
