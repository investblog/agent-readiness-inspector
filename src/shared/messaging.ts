// Panel ⇄ background messaging protocol. One request type for M1: scan an
// origin. The engine runs in the background (single source of verdicts); the
// panel only renders.

import type { CheckResult, Scorecard } from '@/checks';

export interface ScanRequest {
  type: 'scan';
  /** http(s) origin to audit, e.g. https://example.com */
  origin: string;
}

export interface ScanSuccess {
  ok: true;
  origin: string;
  scannedAt: number;
  results: CheckResult[];
  scorecard: Scorecard;
  /** Probe keys that got no response (timeout/network) — shown as transparency. */
  unreachedProbes: string[];
  /**
   * Session state of the credentialed page refetch (spec §11 honesty):
   * 'unknown' until the 3P-cookie-block detection lands (M1-b/M1 debt) —
   * field reserved now to avoid a protocol rev.
   */
  session: 'unknown' | 'active' | 'blocked';
}

export interface ScanFailure {
  ok: false;
  error: string;
}

export type ScanResponse = ScanSuccess | ScanFailure;

export function isScanRequest(msg: unknown): msg is ScanRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'scan' &&
    typeof (msg as { origin?: unknown }).origin === 'string'
  );
}
