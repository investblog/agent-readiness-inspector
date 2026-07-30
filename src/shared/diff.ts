// Inside-vs-outside diff (M2-c, spec §5): our in-browser verdicts against the
// Cloudflare URL Scanner's external view. Shared shape with the calibration
// harness — CF reports {category:{checkId:{status}}} in both surfaces.
//
// The expected-divergence list mirrors scripts/calibrate.mts ALLOWLIST: those
// four are deliberate, documented differences (spec §3), not findings.

import type { CheckId, CheckResult, CheckStatus } from '@/checks';
import type { CfAgentReadiness, CfCheck } from './cf-api';

export type DiffKind = 'match' | 'expected' | 'divergent' | 'onlyOurs' | 'onlyTheirs';

export interface DiffRow {
  id: string;
  kind: DiffKind;
  ours?: CheckStatus;
  theirs?: string;
  /** i18n key explaining a deliberate divergence, when kind === 'expected'. */
  reasonKey?: string;
  ourEvidence?: string;
  theirMessage?: string;
}

export interface DiffSummary {
  rows: DiffRow[];
  matches: number;
  divergences: number;
  expected: number;
}

/**
 * Deliberate divergences: id → { our status that is expected, reason key }.
 * Single source of truth — scripts/calibrate.mts imports this instead of
 * keeping its own copy (the list is exactly what the plan flags as drift-prone).
 */
export const EXPECTED_DIVERGENCES: Partial<Record<CheckId, { ours: CheckStatus; reasonKey: string }>> = {
  dnsAid: { ours: 'na', reasonKey: 'diffReasonDns' },
  webMcp: { ours: 'na', reasonKey: 'diffReasonWebMcp' },
  mcpServerCard: { ours: 'pass', reasonKey: 'diffReasonMcp' },
  a2aAgentCard: { ours: 'pass', reasonKey: 'diffReasonA2a' },
};

/** CF reports skipped checks as `neutral`; our equivalent is `na`. */
export function normalizeCfStatus(status: string): string {
  return status === 'neutral' ? 'na' : status;
}

function flattenCfChecks(readiness: CfAgentReadiness): Map<string, CfCheck> {
  const flat = new Map<string, CfCheck>();
  for (const group of Object.values(readiness.checks ?? {})) {
    for (const [id, check] of Object.entries(group ?? {})) flat.set(id, check);
  }
  return flat;
}

export function diffScans(ours: readonly CheckResult[], theirs: CfAgentReadiness): DiffSummary {
  const theirChecks = flattenCfChecks(theirs);
  const ourById = new Map(ours.map((r) => [r.id as string, r]));
  const rows: DiffRow[] = [];

  for (const [id, our] of ourById) {
    const their = theirChecks.get(id);
    if (!their) {
      rows.push({ id, kind: 'onlyOurs', ours: our.status, ourEvidence: our.evidence });
      continue;
    }
    const theirStatus = normalizeCfStatus(their.status);
    if (our.status === theirStatus) {
      rows.push({ id, kind: 'match', ours: our.status, theirs: their.status });
      continue;
    }
    const expected = EXPECTED_DIVERGENCES[id as CheckId];
    rows.push({
      id,
      // directional, like the calibration allowlist: only the documented
      // direction is "expected" — the opposite way round is a real finding
      kind: expected && expected.ours === our.status ? 'expected' : 'divergent',
      ours: our.status,
      theirs: their.status,
      reasonKey: expected?.ours === our.status ? expected.reasonKey : undefined,
      ourEvidence: our.evidence,
      theirMessage: their.message,
    });
  }

  for (const [id, their] of theirChecks) {
    if (!ourById.has(id)) rows.push({ id, kind: 'onlyTheirs', theirs: their.status, theirMessage: their.message });
  }

  return {
    rows,
    matches: rows.filter((r) => r.kind === 'match').length,
    divergences: rows.filter((r) => r.kind === 'divergent').length,
    expected: rows.filter((r) => r.kind === 'expected').length,
  };
}
