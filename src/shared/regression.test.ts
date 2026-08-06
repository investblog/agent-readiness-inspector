import { describe, expect, it } from 'vitest';
import type { CheckId } from '@/checks';
import {
  baselineStatus,
  diffAgainstHistory,
  diffSnapshots,
  isAlertWorthy,
  LEVEL_DROP_MIN_COMPOSITE_DROP,
  regressionSignature,
  type SnapshotDiff,
} from './regression';
import { DEFAULT_WATCH, SCHEMA_VERSION, type ScanSnapshot, StorageLayer } from './storage';
import { FakeArea } from './test-support';

function snap(partial: Partial<ScanSnapshot> & Pick<ScanSnapshot, 'statuses'>): ScanSnapshot {
  return { scannedAt: 1, composite: 50, level: 3, ...partial };
}

describe('diffSnapshots', () => {
  it('reports pass → fail as a regression and fail → pass as an improvement', () => {
    const diff = diffSnapshots(
      snap({ statuses: { robotsTxt: 'pass', sitemap: 'fail' } }),
      snap({ statuses: { robotsTxt: 'fail', sitemap: 'pass' } }),
    );
    expect(diff.regressions).toEqual(['robotsTxt']);
    expect(diff.improvements).toEqual(['sitemap']);
  });

  it('does NOT treat pass → na as a regression (semantics change, not breakage)', () => {
    const diff = diffSnapshots(snap({ statuses: { webBotAuth: 'pass' } }), snap({ statuses: { webBotAuth: 'na' } }));
    expect(diff.regressions).toEqual([]);
    expect(diff.improvements).toEqual([]);
  });

  it('tracks checks that appeared or disappeared between runs', () => {
    const diff = diffSnapshots(
      snap({ statuses: { robotsTxt: 'pass', llmsTxt: 'pass' } }),
      snap({ statuses: { robotsTxt: 'pass', a2aAgentCard: 'fail' } }),
    );
    expect(diff.added).toEqual(['a2aAgentCard']);
    expect(diff.removed).toEqual(['llmsTxt']);
    expect(diff.regressions).toEqual([]); // an added failing check is not a regression
  });

  it('reports nothing while a known failure stays failed (no re-alerting)', () => {
    const diff = diffSnapshots(snap({ statuses: { robotsTxt: 'fail' } }), snap({ statuses: { robotsTxt: 'fail' } }));
    expect(diff.regressions).toEqual([]);
    expect(diff.improvements).toEqual([]);
  });

  it('pairwise: na to fail is not a regression on its own', () => {
    const diff = diffSnapshots(snap({ statuses: { robotsTxt: 'na' } }), snap({ statuses: { robotsTxt: 'fail' } }));
    expect(diff.regressions).toEqual([]);
  });

  it('computes composite and level deltas', () => {
    const diff = diffSnapshots(
      snap({ composite: 75, level: 4, statuses: {} }),
      snap({ composite: 58, level: 3, statuses: {} }),
    );
    expect(diff.compositeDelta).toBe(-17);
    expect(diff.levelDelta).toBe(-1);
  });
});

/** Typed diff fixture — keeps CheckId literals out of every call site. */
function fakeDiff(patch: Partial<SnapshotDiff> = {}): SnapshotDiff {
  return {
    regressions: [],
    improvements: [],
    added: [],
    removed: [],
    compositeDelta: 0,
    levelDelta: 0,
    ...patch,
  };
}

describe('diffAgainstHistory (na must not hide a real breakage)', () => {
  it('catches pass -> na -> fail, which pairwise diffing misses', () => {
    const history = [
      snap({ scannedAt: 1, statuses: { robotsTxt: 'pass' } }),
      snap({ scannedAt: 2, statuses: { robotsTxt: 'na' } }),
    ];
    const next = snap({ scannedAt: 3, statuses: { robotsTxt: 'fail' } });
    expect(diffSnapshots(history[1], next).regressions).toEqual([]);
    expect(diffAgainstHistory(history, next).regressions).toEqual(['robotsTxt']);
  });

  it('does not invent a regression for a check that never passed', () => {
    const history = [snap({ statuses: { authMd: 'na' } })];
    expect(diffAgainstHistory(history, snap({ statuses: { authMd: 'fail' } })).regressions).toEqual([]);
  });

  it('is empty when there is no history to compare against', () => {
    expect(diffAgainstHistory([], snap({ statuses: { robotsTxt: 'fail' } })).regressions).toEqual([]);
  });

  it('baselineStatus finds the last real verdict, skipping na', () => {
    const history = [
      snap({ statuses: { robotsTxt: 'pass' } }),
      snap({ statuses: { robotsTxt: 'na' } }),
      snap({ statuses: { robotsTxt: 'na' } }),
    ];
    expect(baselineStatus(history, 'robotsTxt')).toBe('pass');
    expect(baselineStatus(history, 'sitemap')).toBeUndefined();
  });
});

describe('isAlertWorthy', () => {
  it('alerts on a regressed check, or on a level drop with a real score drop', () => {
    expect(isAlertWorthy(fakeDiff({ regressions: ['robotsTxt'] }))).toBe(true);
    expect(isAlertWorthy(fakeDiff({ levelDelta: -1, compositeDelta: -17 }))).toBe(true);
  });

  it('stays quiet on improvements, additions and score noise within a level', () => {
    expect(isAlertWorthy(fakeDiff({ improvements: ['sitemap'], compositeDelta: 8 }))).toBe(false);
    expect(isAlertWorthy(fakeDiff({ added: ['authMd'], compositeDelta: -3 }))).toBe(false);
  });

  it('ignores a level drop caused by band jitter (65 to 64 flips L4/L3)', () => {
    expect(isAlertWorthy(fakeDiff({ levelDelta: -1, compositeDelta: -1 }))).toBe(false);
    expect(isAlertWorthy(fakeDiff({ levelDelta: -1, compositeDelta: -LEVEL_DROP_MIN_COMPOSITE_DROP }))).toBe(true);
  });
});

describe('regressionSignature', () => {
  it('is stable for the same unresolved problem regardless of check order', () => {
    const next = snap({ level: 2, statuses: {} });
    const a = regressionSignature(fakeDiff({ regressions: ['sitemap', 'robotsTxt'], levelDelta: -1 }), next);
    const b = regressionSignature(fakeDiff({ regressions: ['robotsTxt', 'sitemap'], levelDelta: -1 }), next);
    expect(a).toBe(b);
  });

  it('changes when a new check regresses or the level moves', () => {
    const diff = fakeDiff({ regressions: ['robotsTxt'], levelDelta: -1 });
    const first = regressionSignature(diff, snap({ level: 3, statuses: {} }));
    const withMore: CheckId[] = ['robotsTxt', 'sitemap'];
    expect(
      regressionSignature(fakeDiff({ ...diff, regressions: withMore }), snap({ level: 3, statuses: {} })),
    ).not.toBe(first);
    expect(regressionSignature(diff, snap({ level: 2, statuses: {} }))).not.toBe(first);
  });
});

describe('storage migration v1 → v2', () => {
  it('keeps existing v1 data and adds watch defaults', async () => {
    const area = new FakeArea();
    // a realistic v1 store written by the previous release
    area.data.set('schemaVersion', 1);
    area.data.set('sites', { 'https://example.com': { addedAt: 10, lastScanAt: 20 } });
    area.data.set('history:https://example.com', [{ scannedAt: 20, composite: 40, level: 2, statuses: {} }]);
    // the credentials a v1 store would still carry — v4 must remove them
    area.data.set('settings', { checkOverrides: { llmsTxt: true }, cfAccountId: 'a'.repeat(32), cfToken: 'tok' });

    const store = new StorageLayer(area);
    await store.migrate();

    expect(area.data.get('schemaVersion')).toBe(SCHEMA_VERSION);
    expect(await store.getSites()).toEqual({ 'https://example.com': { addedAt: 10, lastScanAt: 20 } });
    expect(await store.getHistory('https://example.com')).toEqual([
      { scannedAt: 20, composite: 40, level: 2, statuses: {} },
    ]);
    const settings = await store.getSettings();
    expect(settings.checkOverrides?.llmsTxt).toBe(true); // v1 settings survive
    // ...but the retired feature's credentials do not
    expect('cfAccountId' in settings).toBe(false);
    expect('cfToken' in settings).toBe(false);
    expect(await store.getWatchSettings()).toEqual(DEFAULT_WATCH); // defaults resolve on read
  });

  it('removes the credentials even when the store has no sites at all', async () => {
    // connected an account, never saved a site: this store used to take the
    // empty-store branch and keep its token forever
    const area = new FakeArea();
    area.data.set('schemaVersion', 3);
    area.data.set('settings', { cfToken: 'tok', cfAccountId: 'a'.repeat(32) });

    await new StorageLayer(area).migrate();

    expect(area.data.get('settings')).toEqual({});
    expect(area.data.get('schemaVersion')).toBe(SCHEMA_VERSION);
  });

  it('does not overwrite watch settings the user already changed', async () => {
    const area = new FakeArea();
    area.data.set('schemaVersion', 1);
    area.data.set('sites', {});
    area.data.set('settings', { watch: { intervalHours: 6, notify: false } });
    const store = new StorageLayer(area);
    await store.migrate();
    expect(await store.getWatchSettings()).toEqual({ intervalHours: 6, notify: false });
  });

  it('resolves watch defaults identically on a fresh and a migrated store', async () => {
    const freshArea = new FakeArea();
    const fresh = new StorageLayer(freshArea);
    await fresh.migrate();
    const upgradedArea = new FakeArea();
    upgradedArea.data.set('schemaVersion', 1);
    upgradedArea.data.set('sites', {});
    const upgraded = new StorageLayer(upgradedArea);
    await upgraded.migrate();
    expect(await fresh.getWatchSettings()).toEqual(await upgraded.getWatchSettings());
    expect(await fresh.getWatchSettings()).toEqual(DEFAULT_WATCH);
  });

  it('never wipes data when the stored version is corrupt', async () => {
    const area = new FakeArea();
    area.data.set('schemaVersion', 'garbage');
    area.data.set('sites', { 'https://example.com': { addedAt: 1 } });
    const store = new StorageLayer(area);
    await store.migrate();
    expect(await store.isSaved('https://example.com')).toBe(true);
  });

  it('leaves a newer schema untouched (extension downgrade)', async () => {
    const area = new FakeArea();
    area.data.set('schemaVersion', 99);
    area.data.set('sites', { 'https://example.com': { addedAt: 1 } });
    const store = new StorageLayer(area);
    await store.migrate();
    expect(area.data.get('schemaVersion')).toBe(99);
    expect(await store.getSites()).toEqual({ 'https://example.com': { addedAt: 1 } });
  });

  it('keeps v2 watch flags across a repeat migrate', async () => {
    const store = new StorageLayer(new FakeArea());
    await store.migrate();
    await store.addSite('https://a.example');
    await store.setWatch('https://a.example', true);
    await store.markAlerted('https://a.example', 'sig', 5);
    await store.migrate();
    const site = (await store.getSites())['https://a.example'];
    expect(site.watch).toBe(true);
    expect(site.lastAlertSignature).toBe('sig');
  });

  it('is a no-op once the store is already v2', async () => {
    const area = new FakeArea();
    const store = new StorageLayer(area);
    await store.migrate();
    await store.addSite('https://example.com');
    await store.migrate();
    expect(await store.isSaved('https://example.com')).toBe(true);
  });
});

describe('watch flags in storage', () => {
  it('lists watched origins and clears alert state when watch is turned off', async () => {
    const store = new StorageLayer(new FakeArea());
    await store.migrate();
    await store.addSite('https://a.example');
    await store.addSite('https://b.example');
    await store.setWatch('https://a.example', true);
    expect(await store.getWatchedOrigins()).toEqual(['https://a.example']);

    await store.markAlerted('https://a.example', 'sig-1', 99);
    expect((await store.getSites())['https://a.example'].lastAlertSignature).toBe('sig-1');

    await store.setWatch('https://a.example', false);
    const site = (await store.getSites())['https://a.example'];
    expect(site.watch).toBe(false);
    expect(site.lastAlertSignature).toBeUndefined();
    expect(await store.getWatchedOrigins()).toEqual([]);
  });

  it('keeps a watch cursor across cycles', async () => {
    const store = new StorageLayer(new FakeArea());
    await store.setWatchState({ cursor: 'https://b.example' });
    await store.setWatchState({ lastRunAt: 42 });
    expect(await store.getWatchState()).toEqual({ cursor: 'https://b.example', lastRunAt: 42 });
  });
});
