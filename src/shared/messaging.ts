// Panel ⇄ background messaging protocol. One request type for M1: scan an
// origin. The engine runs in the background (single source of verdicts); the
// panel only renders.

import type { CheckId, CheckResult, Scorecard, SessionVerdict, StackId } from '@/checks';

export interface ScanRequest {
  type: 'scan';
  /** http(s) origin to audit, e.g. https://example.com */
  origin: string;
  /**
   * Explicit check selection. Omit for the user's configured set, which is what
   * every caller does today — the external-scan diff that used to pass the full
   * matrix is gone. Kept because `handleScan` still branches on it to skip
   * caching and badge painting for a scan the user did not initiate.
   */
  include?: CheckId[];
  /**
   * Tab this scan describes, when there is one. The background paints the
   * score on that tab's toolbar badge; batch and watch scans omit it.
   */
  tabId?: number;
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
   * Whether your session changed what the audit saw (spec §11 honesty). The
   * panel tells you the page is fetched with your cookies; this is the check on
   * that claim, made by asking the same URL again without them.
   */
  session: SessionVerdict;
  /**
   * What the site looks like it runs on, from headers we already read. Drives
   * which repair recipe the panel shows; all matches are carried, because a
   * platform behind a CDN is genuinely both.
   */
  stacks: StackId[];
}

export interface ScanFailure {
  ok: false;
  error: string;
}

export type ScanResponse = ScanSuccess | ScanFailure;

/**
 * Asks the background to re-read watch settings and fix its alarm. The
 * background owns the alarm outright — two contexts creating/clearing it can
 * race and silently kill watch mode.
 */
export interface RescheduleWatchRequest {
  type: 'rescheduleWatch';
}

export function isRescheduleWatchRequest(msg: unknown): msg is RescheduleWatchRequest {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'rescheduleWatch';
}

/**
 * Switches the 301.sh feed on or off. Like the watch alarm, the background owns
 * the news alarm outright — and enabling has to seed the seen-set before the
 * first tick, which is background work, not a settings write the UI can do.
 */
export interface SetNewsEnabledRequest {
  type: 'setNewsEnabled';
  enabled: boolean;
}

export function isSetNewsEnabledRequest(msg: unknown): msg is SetNewsEnabledRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'setNewsEnabled' &&
    typeof (msg as { enabled?: unknown }).enabled === 'boolean'
  );
}

export function isScanRequest(msg: unknown): msg is ScanRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'scan' &&
    typeof (msg as { origin?: unknown }).origin === 'string'
  );
}
