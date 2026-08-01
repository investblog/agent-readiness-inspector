// Auto-scan's cooldown cache (plan m3.5).
//
// It MUST outlive the service worker. MV3 stops the SW ~30s after the last
// event, so a module-level Map is empty again by the next tab switch: the "one
// scan per site, then ten quiet minutes" that the settings hint promises would
// have been "one scan per tab switch" — real traffic to third-party sites at a
// multiple of what the user agreed to.
//
// storage.session is the right home: it needs no permission beyond `storage`,
// it never reaches disk (a cache derived from browsing must not be persisted)
// and it dies with the browser session. Both engines we ship to have it
// (Chrome 102+, Firefox 115+ against a 140 floor), so the in-memory fallback is
// unreachable in production — it exists so the module is usable without a
// browser at all, which is also why the singleton imports wxt/browser lazily.

export interface CachedScore {
  composite: number;
  level: number;
  levelName: string;
  at: number;
}

export const SCORE_TTL_MS = 10 * 60_000;
/** Bounded like every other store here; oldest entries go first. */
export const MAX_CACHED_ORIGINS = 100;

const KEY = 'scoreCache';

export interface SessionAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export class ScoreCache {
  private memory: Record<string, CachedScore> = {};

  constructor(
    private readonly area: SessionAreaLike | null,
    private readonly now: () => number = Date.now,
  ) {}

  private async read(): Promise<Record<string, CachedScore>> {
    if (!this.area) return this.memory;
    try {
      const { [KEY]: value } = await this.area.get(KEY);
      return (value as Record<string, CachedScore> | undefined) ?? {};
    } catch (error) {
      console.warn('[agent-readiness] score cache read failed', error);
      return this.memory;
    }
  }

  /** Undefined for a miss AND for an expired entry — callers only want fresh. */
  async get(origin: string): Promise<CachedScore | undefined> {
    const entry = (await this.read())[origin];
    if (!entry) return undefined;
    return this.now() - entry.at < SCORE_TTL_MS ? entry : undefined;
  }

  /**
   * Read-modify-write without the serialization StorageLayer uses: two scans
   * finishing together can drop one entry, and the cost of that is one extra
   * scan later. A queue would buy strictness this cache does not need.
   */
  async put(origin: string, score: Omit<CachedScore, 'at'>): Promise<void> {
    const entries = await this.read();
    entries[origin] = { ...score, at: this.now() };
    const pruned = Object.entries(entries)
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, MAX_CACHED_ORIGINS);
    const next = Object.fromEntries(pruned);
    this.memory = next;
    if (!this.area) return;
    try {
      await this.area.set({ [KEY]: next });
    } catch (error) {
      console.warn('[agent-readiness] score cache write failed', error);
    }
  }
}

let instancePromise: Promise<ScoreCache> | undefined;

/**
 * Lazy singleton over browser.storage.session (extension contexts only).
 * The dynamic import is what keeps this module unit-testable — same pattern as
 * the storage layer.
 */
export function scoreCache(): Promise<ScoreCache> {
  instancePromise ??= (async () => {
    const { browser } = await import('wxt/browser');
    const area = (browser.storage as unknown as { session?: SessionAreaLike }).session ?? null;
    return new ScoreCache(area);
  })();
  return instancePromise;
}
