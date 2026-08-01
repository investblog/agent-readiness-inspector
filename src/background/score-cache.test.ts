import { describe, expect, it } from 'vitest';
import { MAX_CACHED_ORIGINS, SCORE_TTL_MS, ScoreCache, type SessionAreaLike } from './score-cache';

/** Stands in for storage.session: shared by every "service worker" below. */
function fakeSession(): SessionAreaLike & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key) => ({ [key]: data.get(key) }),
    set: async (items) => {
      for (const [key, value] of Object.entries(items)) data.set(key, value);
    },
  };
}

const ORIGIN = 'https://example.com';
const SCORE = { composite: 42, level: 2, levelName: 'Bot-Aware' };

describe('ScoreCache', () => {
  it('survives a service-worker restart (the whole point of not using a Map)', async () => {
    const area = fakeSession();
    let now = 1000;
    await new ScoreCache(area, () => now).put(ORIGIN, SCORE);
    now += 60_000;
    // a brand-new instance = the SW was stopped and started again
    expect(await new ScoreCache(area, () => now).get(ORIGIN)).toMatchObject({ composite: 42 });
  });

  it('expires at the TTL so a stale score never stands in for a scan', async () => {
    const area = fakeSession();
    let now = 1000;
    const cache = new ScoreCache(area, () => now);
    await cache.put(ORIGIN, SCORE);
    now += SCORE_TTL_MS - 1;
    expect(await cache.get(ORIGIN)).toBeDefined();
    now += 2;
    expect(await cache.get(ORIGIN)).toBeUndefined();
  });

  it('keeps the newest MAX_CACHED_ORIGINS entries', async () => {
    const area = fakeSession();
    let now = 0;
    const cache = new ScoreCache(area, () => now);
    for (let i = 0; i < MAX_CACHED_ORIGINS + 5; i++) {
      now += 1;
      await cache.put(`https://site${i}.example`, SCORE);
    }
    const stored = area.data.get('scoreCache') as Record<string, unknown>;
    expect(Object.keys(stored)).toHaveLength(MAX_CACHED_ORIGINS);
    expect(stored['https://site0.example']).toBeUndefined();
    expect(stored[`https://site${MAX_CACHED_ORIGINS + 4}.example`]).toBeDefined();
  });

  it('falls back to memory where storage.session does not exist (older Firefox)', async () => {
    const cache = new ScoreCache(null);
    await cache.put(ORIGIN, SCORE);
    expect(await cache.get(ORIGIN)).toMatchObject({ composite: 42 });
  });

  it('a failing session area degrades to memory instead of throwing at the caller', async () => {
    const broken: SessionAreaLike = {
      get: () => Promise.reject(new Error('session unavailable')),
      set: () => Promise.reject(new Error('session unavailable')),
    };
    const cache = new ScoreCache(broken);
    await expect(cache.put(ORIGIN, SCORE)).resolves.toBeUndefined();
    // worst case it behaves like the plain Map it replaced — never worse
    expect(await cache.get(ORIGIN)).toMatchObject({ composite: 42 });
  });
});
