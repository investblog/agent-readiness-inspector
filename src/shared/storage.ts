// Typed storage layer (M2-a, plan m2-dashboard.md) — schema v1, shared by the
// dashboard (M2) and watch mode (M3). chrome.storage.local via an injectable
// area so the layer is unit-testable without a browser.
//
// Privacy rule (plan §3): scan history is recorded ONLY for explicitly saved
// sites — the user's browsing never accumulates silently.

import type { CheckId, CheckStatus } from '@/checks';

export const SCHEMA_VERSION = 1;
/** FIFO retention per site — keeps ~100 sites × 50 snapshots well under the
 * ~10MB storage.local quota without the unlimitedStorage permission (spec §10). */
export const MAX_SNAPSHOTS_PER_SITE = 50;

export interface SiteMeta {
  addedAt: number;
  lastScanAt?: number;
}

/** Compact history record: statuses only — evidence is heavy and reproducible
 * by a rescan; the M3 diff works on statuses. */
export interface ScanSnapshot {
  scannedAt: number;
  composite: number;
  level: number;
  statuses: Partial<Record<CheckId, CheckStatus>>;
}

export interface Settings {
  /** Per-check enable/disable on top of defaultEnabled (llmsTxt/a2a toggles). */
  checkOverrides?: Partial<Record<CheckId, boolean>>;
  cfAccountId?: string;
  cfToken?: string;
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

  /** Idempotent: stamps the schema version; future versions migrate stepwise here. */
  async migrate(): Promise<void> {
    const { [KEY_VERSION]: version } = await this.area.get(KEY_VERSION);
    if (version === undefined) {
      await this.area.set({ [KEY_VERSION]: SCHEMA_VERSION, [KEY_SITES]: {} });
      return;
    }
    // schemaVersion 1 is current — nothing to migrate yet
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

  /** Removes the site AND its history — no orphaned history keys. */
  removeSite(origin: string): Promise<void> {
    return this.enqueue(async () => {
      const sites = await this.getSites();
      delete sites[origin];
      await this.area.set({ [KEY_SITES]: sites });
      // remove history unconditionally: also sweeps a hypothetical orphan
      await this.area.remove(historyKey(origin));
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
