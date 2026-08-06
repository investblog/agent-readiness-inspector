// Seeding the toolbar score from what is already in storage (plan
// backlog-cleanup.md, B1).
//
// The icon used to say nothing until something scanned the tab, and with
// auto-scan off — the default — the only thing that ever did was the side panel
// being open. Outside, that reads as "the counter only works with the panel
// open".
//
// The seed costs no request: it is the user's own last recorded scan. It is
// limited to SAVED sites for the same reason auto-scan is off by default —
// reading history for every origin visited would make the icon a record of
// browsing, which the privacy rule forbids.

import { levelFor } from '@/checks';
import type { StorageLayer } from '@/shared/storage';
import { type CachedScore, SCORE_TTL_MS } from './score-cache';

/**
 * True when a score is old enough that it cannot have come from this session's
 * cache (which drops entries past the TTL), i.e. it was seeded from history.
 * Callers use it to date the tooltip — an undated old number is exactly the
 * "stale is worse than none" case badge.ts warns about.
 */
export function isFromHistory(score: CachedScore, now: number = Date.now()): boolean {
  return now - score.at >= SCORE_TTL_MS;
}

/** Last recorded score for a saved site, or undefined for anything else. */
export async function storedScore(store: StorageLayer, origin: string): Promise<CachedScore | undefined> {
  if (!(await store.isSaved(origin))) return undefined;
  const last = (await store.getHistory(origin)).at(-1);
  if (!last) return undefined;
  // Level and name both derived from the stored composite rather than taking
  // the level from the snapshot and the name from the bands: if the bands ever
  // move, a recomputed name beside a recorded level is an inconsistent pair,
  // and the pair is the whole tooltip.
  const band = levelFor(last.composite);
  return { composite: last.composite, level: band.level, levelName: band.name, at: last.scannedAt };
}
