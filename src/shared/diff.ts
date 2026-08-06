// Calibration vocabulary — CI only (scripts/calibrate.mts).
//
// The user-facing "compare against Cloudflare" feature is gone (2026-08-07):
// importing a competitor's verdict into our own report made their number the
// authority, and the source we would have imported is one our own write-ups
// document as probing paths the specification abandoned. What survives here is
// the part that was always for US — the vocabulary the weekly calibration job
// uses to notice when the upstream matrix drifts away from ours.

import type { CheckId, CheckStatus } from '@/checks';

/**
 * Deliberate, documented differences from the upstream tool (spec §3), not
 * findings. The calibration job treats these as expected and fails only on the
 * ones it cannot explain.
 */
export const EXPECTED_DIVERGENCES: Partial<Record<CheckId, { ours: CheckStatus; reasonKey: string }>> = {
  // NOTE: the dnsAid entry predates the DoH probe (2026-08-06). Our verdict is
  // no longer `na` in the normal case, so this line now matches almost nothing
  // — it is left exactly as it was rather than guessed at, because the right
  // new value is whatever the next calibration run actually observes.
  dnsAid: { ours: 'na', reasonKey: 'diffReasonDns' },
  webMcp: { ours: 'na', reasonKey: 'diffReasonWebMcp' },
  mcpServerCard: { ours: 'pass', reasonKey: 'diffReasonMcp' },
  a2aAgentCard: { ours: 'pass', reasonKey: 'diffReasonA2a' },
};

/** CF reports skipped checks as `neutral`; our equivalent is `na`. */
export function normalizeCfStatus(status: string): string {
  return status === 'neutral' ? 'na' : status;
}
