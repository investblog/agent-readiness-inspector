// Typed storage layer (M2-a, plan m2-dashboard.md) — schema v1, shared by the
// dashboard (M2) and watch mode (M3). chrome.storage.local via an injectable
// area so the layer is unit-testable without a browser.
//
// Privacy rule (plan §3): scan history is recorded ONLY for explicitly saved
// sites — the user's browsing never accumulates silently.

import type { CheckId, CheckStatus } from '@/checks';

/** v1: sites/history/settings. v2: + watch fields (M3). v3: + alert inbox and
 * browsing/badge settings (M3.5). Every bump so far added OPTIONAL keys only. */
export const SCHEMA_VERSION = 3;
/** FIFO retention per site — keeps ~100 sites × 50 snapshots well under the
 * ~10MB storage.local quota without the unlimitedStorage permission (spec §10). */
export const MAX_SNAPSHOTS_PER_SITE = 50;
/** FIFO retention for the alert inbox — an inbox, not an audit log. */
export const MAX_ALERTS = 50;

export interface SiteMeta {
  addedAt: number;
  lastScanAt?: number;
  /** v2: rescan this site on the watch schedule (spec §7). */
  watch?: boolean;
  /** v2: signature of the last announced regression — deduplicates alerts. */
  lastAlertSignature?: string;
  lastAlertAt?: number;
}

/** Compact history record: statuses only — evidence is heavy and reproducible
 * by a rescan; the M3 diff works on statuses. */
export interface ScanSnapshot {
  scannedAt: number;
  composite: number;
  level: number;
  statuses: Partial<Record<CheckId, CheckStatus>>;
}

export interface WatchSettings {
  /** Hours between watch cycles; the UI clamps to >= 1 (spec §7 / alarms floor). */
  intervalHours: number;
  /** Show a browser notification on regression (needs the optional permission). */
  notify: boolean;
}

export const DEFAULT_WATCH: WatchSettings = { intervalHours: 24, notify: true };

/**
 * v3: what the extension does while the user simply browses (M3.5).
 *
 * `autoScan` is OFF by default on purpose: it sends the same requests a manual
 * scan does, once per site the user opens — exactly the silent accumulation the
 * project's privacy rule forbids doing without an explicit choice.
 */
export interface BrowsingSettings {
  /** Scan the active tab on navigation so the icon shows a score unprompted. */
  autoScan: boolean;
  /** Paint the current tab's score on the toolbar icon. */
  scoreBadge: boolean;
  /** Paint the unread watch-alert count on the toolbar icon. */
  alertBadge: boolean;
}

export const DEFAULT_BROWSING: BrowsingSettings = { autoScan: false, scoreBadge: true, alertBadge: true };

/**
 * One recorded regression (v3). Written by the watch cycle regardless of the
 * notifications permission — the inbox is the surface for everyone who declined
 * it, so it must not depend on it.
 */
export interface WatchAlert {
  /** `${origin}|${signature}` — the same identity the watch cycle deduplicates on. */
  id: string;
  origin: string;
  at: number;
  signature: string;
  levelDelta: number;
  compositeDelta: number;
  regressions: CheckId[];
  /** Unset = unread; the badge counts these. */
  readAt?: number;
}

export interface Settings {
  /** Per-check enable/disable on top of defaultEnabled (llmsTxt/a2a toggles). */
  checkOverrides?: Partial<Record<CheckId, boolean>>;
  cfAccountId?: string;
  cfToken?: string;
  /** v2 (M3). */
  watch?: WatchSettings;
  /** v3 (M3.5). */
  browsing?: Partial<BrowsingSettings>;
  /** The 301.st block was folded away; unset means "never folded". */
  promoCollapsed?: boolean;
}

/** Cursor state so a watch cycle can span several alarm firings (SW 5-min cap). */
export interface WatchState {
  cursor?: string;
  lastRunAt?: number;
}

/** Minimal storage-area contract (browser.storage.local satisfies it). */
export interface AreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

const KEY_VERSION = 'schemaVersion';
const KEY_SITES = 'sites';
const KEY_SETTINGS = 'settings';
const KEY_WATCH_STATE = 'watchState';
const KEY_ALERTS = 'alerts';
const historyKey = (origin: string): string => `history:${origin}`;

export class StorageLayer {
  constructor(private readonly area: AreaLike) {}

  // Serializes MUTATING ops within this context: chrome.storage has no
  // transactions, and the M2-b batch (concurrency 2) would otherwise
  // interleave read-modify-write on the shared `sites` map. Cross-context
  // races (popup unsave vs background scan write) remain a documented
  // millisecond-window last-write-wins — see plan m2-dashboard.md.
  private queue: Promise<unknown> = Promise.resolve();

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op);
    this.queue = next.catch(() => {}); // one failed op must not poison the chain
    return next;
  }

  /**
   * Idempotent, stepwise: each version bump only ADDS what the new one needs.
   * v2 and v3 introduced only OPTIONAL fields, so there is nothing to rewrite —
   * the defaults are resolved on read (`getWatchSettings`, `getBrowsingSettings`),
   * which also keeps a fresh install and an upgraded store the same shape. An
   * upgraded store simply has no alert inbox until the watch cycle writes one.
   */
  async migrate(): Promise<void> {
    const { [KEY_VERSION]: stored, [KEY_SITES]: sites } = await this.area.get([KEY_VERSION, KEY_SITES]);
    if (stored === SCHEMA_VERSION) return;

    if (typeof stored === 'number' && stored > SCHEMA_VERSION) {
      // the user downgraded the extension: leave the newer data untouched
      console.warn(`[agent-readiness] storage schema v${stored} is newer than v${SCHEMA_VERSION}; not migrating`);
      return;
    }

    if (sites === undefined) {
      // genuinely empty store (a missing/corrupt version alone must never wipe data)
      await this.area.set({ [KEY_VERSION]: SCHEMA_VERSION, [KEY_SITES]: {} });
      return;
    }
    // v1 → v2 → v3: optional fields only; existing data stays as it is
    await this.area.set({ [KEY_VERSION]: SCHEMA_VERSION });
  }

  async getSites(): Promise<Record<string, SiteMeta>> {
    const { [KEY_SITES]: sites } = await this.area.get(KEY_SITES);
    return (sites as Record<string, SiteMeta> | undefined) ?? {};
  }

  async isSaved(origin: string): Promise<boolean> {
    return origin in (await this.getSites());
  }

  addSite(origin: string, now: number = Date.now()): Promise<void> {
    return this.enqueue(async () => {
      const sites = await this.getSites();
      if (origin in sites) return;
      sites[origin] = { addedAt: now };
      await this.area.set({ [KEY_SITES]: sites });
    });
  }

  /** Removes the site AND everything keyed to it — history and alerts alike. */
  removeSite(origin: string): Promise<void> {
    return this.enqueue(async () => {
      const sites = await this.getSites();
      delete sites[origin];
      await this.area.set({ [KEY_SITES]: sites });
      // remove history unconditionally: also sweeps a hypothetical orphan
      await this.area.remove(historyKey(origin));
      // alerts about a site the user deleted are noise, and their unread count
      // would keep the badge lit for something that no longer exists
      const alerts = await this.getAlerts();
      const kept = alerts.filter((alert) => alert.origin !== origin);
      if (kept.length !== alerts.length) await this.area.set({ [KEY_ALERTS]: kept });
    });
  }

  async getHistory(origin: string): Promise<ScanSnapshot[]> {
    const key = historyKey(origin);
    const { [key]: history } = await this.area.get(key);
    return (history as ScanSnapshot[] | undefined) ?? [];
  }

  /**
   * Appends a snapshot for a SAVED site (no-op otherwise — the privacy rule
   * lives here, at the single write point) and prunes to the retention cap.
   * Returns true when recorded.
   */
  appendSnapshot(origin: string, snapshot: ScanSnapshot): Promise<boolean> {
    return this.enqueue(async () => {
      // saved-ness is re-read inside the queued op — shrinks the unsave-vs-
      // scan-write window to the set() call itself
      const sites = await this.getSites();
      const site = sites[origin];
      if (!site) return false;
      const history = await this.getHistory(origin);
      history.push(snapshot);
      const pruned = history.slice(-MAX_SNAPSHOTS_PER_SITE);
      site.lastScanAt = snapshot.scannedAt;
      await this.area.set({ [historyKey(origin)]: pruned, [KEY_SITES]: sites });
      return true;
    });
  }

  async getSettings(): Promise<Settings> {
    const { [KEY_SETTINGS]: settings } = await this.area.get(KEY_SETTINGS);
    return (settings as Settings | undefined) ?? {};
  }

  /** Watch settings with defaults applied — one shape for fresh and migrated stores. */
  async getWatchSettings(): Promise<WatchSettings> {
    const { watch } = await this.getSettings();
    return { ...DEFAULT_WATCH, ...watch };
  }

  /** Browsing/badge settings with defaults applied (same pattern as watch). */
  async getBrowsingSettings(): Promise<BrowsingSettings> {
    const { browsing } = await this.getSettings();
    return { ...DEFAULT_BROWSING, ...browsing };
  }

  // ---- Alert inbox (v3) ----

  async getAlerts(): Promise<WatchAlert[]> {
    const { [KEY_ALERTS]: alerts } = await this.area.get(KEY_ALERTS);
    return (alerts as WatchAlert[] | undefined) ?? [];
  }

  async countUnreadAlerts(): Promise<number> {
    return (await this.getAlerts()).filter((alert) => alert.readAt === undefined).length;
  }

  /**
   * Records a regression. An id that is already in the inbox is REPLACED by the
   * new (unread) entry rather than skipped: the watch cycle only re-announces a
   * signature after a recovery, so a repeat is a genuine re-occurrence and has
   * to surface again even if the earlier one was read.
   */
  addAlert(alert: WatchAlert): Promise<void> {
    return this.enqueue(async () => {
      const alerts = (await this.getAlerts()).filter((existing) => existing.id !== alert.id);
      alerts.push(alert);
      await this.area.set({ [KEY_ALERTS]: alerts.slice(-MAX_ALERTS) });
    });
  }

  /**
   * Marks alerts read ("read" = shown to the user, see plan m3.5). Returns how
   * many were still unread and got marked, so a caller can skip repainting the
   * badge when nothing changed.
   */
  markAlertsRead(ids?: string[], at: number = Date.now()): Promise<number> {
    return this.enqueue(async () => {
      const alerts = await this.getAlerts();
      const target = ids ? new Set(ids) : null;
      let marked = 0;
      for (const alert of alerts) {
        if (alert.readAt !== undefined) continue;
        if (target && !target.has(alert.id)) continue;
        alert.readAt = at;
        marked += 1;
      }
      if (marked > 0) await this.area.set({ [KEY_ALERTS]: alerts });
      return marked;
    });
  }

  dismissAlert(id: string): Promise<void> {
    return this.enqueue(async () => {
      const alerts = await this.getAlerts();
      const kept = alerts.filter((alert) => alert.id !== id);
      if (kept.length !== alerts.length) await this.area.set({ [KEY_ALERTS]: kept });
    });
  }

  clearAlerts(): Promise<void> {
    return this.enqueue(() => this.area.remove(KEY_ALERTS));
  }

  /** Sites flagged for scheduled rescans (spec §7). */
  async getWatchedOrigins(): Promise<string[]> {
    const sites = await this.getSites();
    return Object.entries(sites)
      .filter(([, meta]) => meta.watch === true)
      .map(([origin]) => origin)
      .sort();
  }

  setWatch(origin: string, watch: boolean): Promise<void> {
    return this.enqueue(async () => {
      const sites = await this.getSites();
      const site = sites[origin];
      if (!site) return;
      site.watch = watch;
      if (!watch) {
        site.lastAlertSignature = undefined;
        site.lastAlertAt = undefined;
      }
      await this.area.set({ [KEY_SITES]: sites });
    });
  }

  /**
   * Records that a regression was announced, so it is not repeated.
   * `at` is omitted when clearing after a recovery: `lastAlertAt` must keep
   * meaning "when we last alerted", not "when we last looked".
   */
  markAlerted(origin: string, signature: string, at?: number): Promise<void> {
    return this.enqueue(async () => {
      const sites = await this.getSites();
      const site = sites[origin];
      if (!site) return;
      site.lastAlertSignature = signature;
      if (at !== undefined) site.lastAlertAt = at;
      await this.area.set({ [KEY_SITES]: sites });
    });
  }

  async getWatchState(): Promise<WatchState> {
    const { [KEY_WATCH_STATE]: state } = await this.area.get(KEY_WATCH_STATE);
    return (state as WatchState | undefined) ?? {};
  }

  setWatchState(patch: Partial<WatchState>): Promise<void> {
    return this.enqueue(async () => {
      const merged = { ...(await this.getWatchState()), ...patch };
      await this.area.set({ [KEY_WATCH_STATE]: merged });
    });
  }

  updateSettings(patch: Partial<Settings>): Promise<Settings> {
    return this.enqueue(async () => {
      const merged = { ...(await this.getSettings()), ...patch };
      await this.area.set({ [KEY_SETTINGS]: merged });
      return merged;
    });
  }
}

let defaultLayerPromise: Promise<StorageLayer> | undefined;

/** Lazy singleton over browser.storage.local (extension contexts only).
 * Caches the PROMISE so concurrent first calls share one layer + one migrate. */
export function storage(): Promise<StorageLayer> {
  defaultLayerPromise ??= (async () => {
    const { browser } = await import('wxt/browser');
    const layer = new StorageLayer(browser.storage.local as unknown as AreaLike);
    await layer.migrate();
    return layer;
  })();
  return defaultLayerPromise;
}
