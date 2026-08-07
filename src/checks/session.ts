// Did your session change what we saw? (plan backlog-cleanup.md, B2)
//
// The panel claims that the page is fetched with your cookies, so a site behind
// a login is graded on what a logged-in client receives. That claim was never
// checked per scan — the protocol field was reserved and always answered
// `unknown`. An honesty claim nobody verifies is the kind of thing this whole
// tool exists to complain about.
//
// It is checked by asking the same URL twice, once with credentials and once
// without, and comparing. Deliberately NOT "are third-party cookies blocked":
// that question needs the `cookies` permission to answer properly, and the
// answer users care about is narrower — did it matter here.

import { BODY_CAP } from './config';
import type { ProbeResponse } from './types';

export type SessionState = 'active' | 'none' | 'unknown';

export interface SessionVerdict {
  state: SessionState;
  /** Why, in the same evidence-first style as a check. */
  evidence: string;
}

/**
 * Bodies of the same page differ between any two fetches — nonces, CSRF tokens,
 * timestamps, ads. So a size difference alone is weak evidence and needs to be
 * large before it counts; status and landing URL are the strong signals.
 */
const SIZE_DIFF_RATIO = 0.1;

export function sessionVerdict(
  credentialed: ProbeResponse | undefined,
  anonymous: ProbeResponse | undefined,
): SessionVerdict {
  if (!credentialed || !anonymous) {
    return { state: 'unknown', evidence: 'one of the two page fetches did not complete — nothing to compare' };
  }
  if (credentialed.status !== anonymous.status) {
    return {
      state: 'active',
      evidence: `with cookies → ${credentialed.status}, without → ${anonymous.status}`,
    };
  }
  if (credentialed.finalUrl !== anonymous.finalUrl) {
    return {
      state: 'active',
      evidence: `with cookies → ${credentialed.finalUrl}, without → ${anonymous.finalUrl}`,
    };
  }
  const a = credentialed.body.length;
  const b = anonymous.body.length;
  // Bodies are truncated at a cap by the probe layer. Two pages that both
  // exceed it arrive the same length whatever they contain, and a logged-in
  // dashboard is exactly the kind of page that does. Comparing sizes there
  // would answer "no session" with confidence we do not have.
  if (a >= BODY_CAP && b >= BODY_CAP) {
    return {
      state: 'unknown',
      evidence: `both responses hit the ${BODY_CAP}-character read limit — too truncated to compare`,
    };
  }
  const largest = Math.max(a, b);
  if (largest > 0 && Math.abs(a - b) / largest > SIZE_DIFF_RATIO) {
    return {
      state: 'active',
      evidence: `same status and address, but the body differs by ${Math.round((Math.abs(a - b) / largest) * 100)}% (${a} vs ${b} chars)`,
    };
  }
  // Same status, same landing URL, same size: either there is no session for
  // this site or it changed nothing here. Both mean the audit did not depend on
  // one, which is what the reader needs to know. Claiming "blocked" would be
  // inventing a cause we cannot see.
  return {
    state: 'none',
    evidence: 'the page answered the same with and without cookies — this audit did not depend on a session',
  };
}
