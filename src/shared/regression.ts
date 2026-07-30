// Snapshot-to-snapshot diff (M3-a, spec §7). Pure function over history
// records — no browser API — so both the dashboard ("what changed") and the
// watch alerts read the same verdict.

import type { CheckId, CheckStatus } from '@/checks';
import type { ScanSnapshot } from './storage';

/** Level-drop alerts need a real move, not band jitter (65↔64 flips L4↔L3). */
export const LEVEL_DROP_MIN_COMPOSITE_DROP = 5;

export interface SnapshotDiff {
  /** pass → fail: the site got worse in a way the user asked to hear about. */
  regressions: CheckId[];
  /** fail → pass: worth showing, never worth a notification. */
  improvements: CheckId[];
  /** Checks that appeared/disappeared between runs (settings or matrix change). */
  added: CheckId[];
  removed: CheckId[];
  compositeDelta: number;
  levelDelta: number;
}

export function diffSnapshots(previous: ScanSnapshot, next: ScanSnapshot): SnapshotDiff {
  const regressions: CheckId[] = [];
  const improvements: CheckId[] = [];
  const added: CheckId[] = [];
  const removed: CheckId[] = [];

  for (const [id, status] of Object.entries(next.statuses) as [CheckId, CheckStatus][]) {
    const before = previous.statuses[id];
    if (before === undefined) {
      added.push(id);
      continue;
    }
    // pass → na is NOT a regression: it usually means the check's semantics
    // changed (or it became inapplicable), not that the site broke.
    if (before === 'pass' && status === 'fail') regressions.push(id);
    else if (before === 'fail' && status === 'pass') improvements.push(id);
  }
  for (const id of Object.keys(previous.statuses) as CheckId[]) {
    if (next.statuses[id] === undefined) removed.push(id);
  }

  return {
    regressions,
    improvements,
    added,
    removed,
    compositeDelta: next.composite - previous.composite,
    levelDelta: next.level - previous.level,
  };
}

/**
 * True when the change deserves an alert (spec §7: regression or level drop).
 * A level drop must come with a real composite drop: without that, a site
 * sitting on a band edge (65↔64 = L4↔L3) would alert on every cycle.
 */
export function isAlertWorthy(diff: SnapshotDiff): boolean {
  if (diff.regressions.length > 0) return true;
  return diff.levelDelta < 0 && diff.compositeDelta <= -LEVEL_DROP_MIN_COMPOSITE_DROP;
}

/**
 * Baseline for comparison: the newest snapshot in which the check had a real
 * verdict. Without this, `pass → na → fail` never alerts — the site genuinely
 * broke, but each pairwise step is individually "not a regression".
 */
export function baselineStatus(history: readonly ScanSnapshot[], id: CheckId): CheckStatus | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const status = history[i].statuses[id];
    if (status !== undefined && status !== 'na') return status;
  }
  return undefined;
}

/**
 * Diff a fresh scan against history rather than against the single previous
 * snapshot: per-check the comparison uses the last non-`na` verdict, so a
 * check that drifted through `na` is still judged against its real past.
 * `history` must NOT include `next`.
 */
export function diffAgainstHistory(history: readonly ScanSnapshot[], next: ScanSnapshot): SnapshotDiff {
  const previous = history[history.length - 1];
  if (!previous) {
    return { regressions: [], improvements: [], added: [], removed: [], compositeDelta: 0, levelDelta: 0 };
  }
  const pairwise = diffSnapshots(previous, next);
  const regressions = new Set(pairwise.regressions);

  for (const [id, status] of Object.entries(next.statuses) as [CheckId, CheckStatus][]) {
    if (status !== 'fail' || regressions.has(id)) continue;
    // the immediate predecessor was `na` (or the check is new) — look further back
    if (previous.statuses[id] === undefined || previous.statuses[id] === 'na') {
      if (baselineStatus(history, id) === 'pass') regressions.add(id);
    }
  }

  return { ...pairwise, regressions: [...regressions].sort() };
}

/**
 * Stable signature of the current problem state, so the same unresolved
 * regression is not re-announced on every cycle. Changes when the set of
 * regressed checks or the level changes — i.e. when there is something new.
 */
export function regressionSignature(diff: SnapshotDiff, next: ScanSnapshot): string {
  return `${[...diff.regressions].sort().join(',')}|L${next.level}`;
}
