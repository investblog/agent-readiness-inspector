// Watch mode (M3-b, spec §7): scheduled rescans of flagged sites with
// regression alerts. Lives in the background — the dashboard may be closed.
//
// SW-lifetime rule (plan §4): one alarm firing scans a BOUNDED batch and stores
// a cursor, so a long watch list spans several firings instead of running into
// the 5-minute event cap.

import { diffAgainstHistory, isAlertWorthy, regressionSignature, type SnapshotDiff } from '@/shared/regression';
import type { ScanSnapshot, StorageLayer } from '@/shared/storage';
import { storage } from '@/shared/storage';

export const WATCH_ALARM = 'agent-readiness:watch';
/**
 * Sites per firing. Worst case per scan ≈ 4 probe waves × 15s = 60s against a
 * fully hanging target, so 4 sites ≈ 240s — under the 5-minute event cap even
 * without relying on the keepalive in handleScan.
 */
export const WATCH_BATCH_SIZE = 4;
/** chrome.alarms floors at 30s; hourly is the lowest that makes sense here. */
export const MIN_INTERVAL_HOURS = 1;
/** First cycle after enabling: soon enough to be visible, not instant. */
const FIRST_DELAY_MINUTES = 1;
/** Sentinel meaning "nothing announced right now" (a real signature is never ''). */
const NO_ALERT = '';

export interface WatchScanner {
  /** Runs a scan and returns the snapshot that was recorded, or null on failure. */
  scan(origin: string): Promise<ScanSnapshot | null>;
}

/** The slice of chrome.alarms this module needs — injectable for tests. */
export interface AlarmsLike {
  get(name: string): Promise<{ periodInMinutes?: number } | undefined>;
  create(name: string, info: { periodInMinutes?: number; delayInMinutes?: number }): Promise<void> | void;
  clear(name: string): Promise<boolean> | boolean;
}

export interface WatchDeps {
  store: StorageLayer;
  scanner: WatchScanner;
  notify: (origin: string, diff: SnapshotDiff) => Promise<void>;
  now?: () => number;
}

/**
 * (Re)creates the alarm from settings — call on SW start and on settings change.
 *
 * An MV3 service worker starts on every event, and `alarms.create` REPLACES an
 * alarm of the same name, restarting its countdown. Recreating unconditionally
 * would push a 24h cycle forward forever for anyone who uses the extension
 * daily, so an existing alarm with the right period is left alone; only an
 * interval change (or an absent alarm) re-creates it.
 */
export async function scheduleWatch(store?: StorageLayer, alarms?: AlarmsLike): Promise<void> {
  const api = alarms ?? ((await import('wxt/browser')).browser.alarms as unknown as AlarmsLike);
  const layer = store ?? (await storage());
  const watched = await layer.getWatchedOrigins();
  if (watched.length === 0) {
    await api.clear(WATCH_ALARM);
    return;
  }
  const { intervalHours } = await layer.getWatchSettings();
  const periodInMinutes = Math.max(MIN_INTERVAL_HOURS, intervalHours) * 60;
  const existing = await api.get(WATCH_ALARM);
  if (existing?.periodInMinutes === periodInMinutes) return; // keep the running clock
  await api.create(WATCH_ALARM, { periodInMinutes, delayInMinutes: FIRST_DELAY_MINUTES });
}

/**
 * One watch cycle: scans up to WATCH_BATCH_SIZE watched origins starting at the
 * stored cursor, alerts on regressions, and parks the cursor for the next
 * firing. Exported for tests — the alarm handler is a thin wrapper.
 */
export async function runWatchCycle(deps: WatchDeps): Promise<{ scanned: string[]; alerted: string[] }> {
  const { store, scanner, notify, now = Date.now } = deps;
  const watched = await store.getWatchedOrigins();
  const scanned: string[] = [];
  const alerted: string[] = [];
  if (watched.length === 0) {
    await store.setWatchState({ cursor: undefined, lastRunAt: now() });
    return { scanned, alerted };
  }

  const { cursor } = await store.getWatchState();
  // resume at the first origin at-or-after the cursor: if the cursor site was
  // removed or unwatched, the pass continues where it left off instead of
  // restarting and starving everything past the first batch (the list is sorted)
  const resumeAt = cursor ? watched.findIndex((origin) => origin >= cursor) : 0;
  const startIndex = resumeAt < 0 ? 0 : resumeAt;
  const batch = watched.slice(startIndex, startIndex + WATCH_BATCH_SIZE);
  const nextIndex = startIndex + batch.length;
  const nextCursor = nextIndex < watched.length ? watched[nextIndex] : undefined;

  for (const origin of batch) {
    // history BEFORE the scan is the comparison baseline
    const history = await store.getHistory(origin);
    const snapshot = await scanner.scan(origin);
    if (!snapshot) continue; // scan failed — say nothing rather than cry wolf
    scanned.push(origin);
    if (history.length === 0) continue; // first data point: nothing to compare

    const diff = diffAgainstHistory(history, snapshot);
    const site = (await store.getSites())[origin];
    if (!site) continue;

    if (!isAlertWorthy(diff)) {
      // recovery: forget the announced problem so the SAME breakage alerts
      // again if it returns later (plan §4b). Only write when there is
      // something to clear — a quiet cycle must not touch storage.
      if (site.lastAlertSignature) await store.markAlerted(origin, NO_ALERT);
      continue;
    }
    const signature = regressionSignature(diff, snapshot);
    if (site.lastAlertSignature === signature) continue; // already announced, still broken
    try {
      await notify(origin, diff);
    } catch (error) {
      // alert delivery is best-effort: a failed notification must not abort the
      // batch and strand the cursor
      console.warn('[agent-readiness] watch notification failed', error);
    }
    await store.markAlerted(origin, signature, now());
    alerted.push(origin);
  }

  await store.setWatchState({ cursor: nextCursor, lastRunAt: now() });
  return { scanned, alerted };
}
