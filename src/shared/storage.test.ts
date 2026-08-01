import { describe, expect, it } from 'vitest';
import type { CheckId, CheckStatus } from '@/checks';
import { MATRIX, resolveCheckIds } from '@/checks';
import type { ScanSuccess } from './messaging';
import { snapshotFromScan } from './snapshots';
import {
  MAX_ALERTS,
  MAX_SNAPSHOTS_PER_SITE,
  SCHEMA_VERSION,
  type ScanSnapshot,
  StorageLayer,
  type WatchAlert,
} from './storage';
import { FakeArea } from './test-support';

const ORIGIN = 'https://example.com';

function layer(): { store: StorageLayer; area: FakeArea } {
  const area = new FakeArea();
  return { store: new StorageLayer(area), area };
}

function snap(at: number, composite = 50): ScanSnapshot {
  return { scannedAt: at, composite, level: 3, statuses: { robotsTxt: 'pass' } };
}

describe('StorageLayer', () => {
  it('migrate stamps the schema version once and is idempotent', async () => {
    const { store, area } = layer();
    await store.migrate();
    await store.migrate();
    expect(area.data.get('schemaVersion')).toBe(SCHEMA_VERSION);
  });

  it('adds and removes sites; removing a site drops its history too', async () => {
    const { store, area } = layer();
    await store.addSite(ORIGIN, 111);
    expect(await store.isSaved(ORIGIN)).toBe(true);
    await store.appendSnapshot(ORIGIN, snap(1));
    expect(area.data.has(`history:${ORIGIN}`)).toBe(true);
    await store.removeSite(ORIGIN);
    expect(await store.isSaved(ORIGIN)).toBe(false);
    expect(area.data.has(`history:${ORIGIN}`)).toBe(false);
  });

  it('appendSnapshot is a no-op for unsaved sites (the privacy rule)', async () => {
    const { store, area } = layer();
    expect(await store.appendSnapshot(ORIGIN, snap(1))).toBe(false);
    expect(area.data.has(`history:${ORIGIN}`)).toBe(false);
  });

  it('records snapshots for saved sites, updates lastScanAt, prunes FIFO at the cap', async () => {
    const { store } = layer();
    await store.addSite(ORIGIN);
    for (let i = 1; i <= MAX_SNAPSHOTS_PER_SITE + 7; i++) {
      expect(await store.appendSnapshot(ORIGIN, snap(i))).toBe(true);
    }
    const history = await store.getHistory(ORIGIN);
    expect(history).toHaveLength(MAX_SNAPSHOTS_PER_SITE);
    expect(history[0].scannedAt).toBe(8); // oldest 7 pruned
    expect(history.at(-1)?.scannedAt).toBe(MAX_SNAPSHOTS_PER_SITE + 7);
    expect((await store.getSites())[ORIGIN].lastScanAt).toBe(MAX_SNAPSHOTS_PER_SITE + 7);
  });

  it('removeSite on an absent site is a safe no-op that still sweeps orphans', async () => {
    const { store, area } = layer();
    area.data.set(`history:${ORIGIN}`, [snap(1)]); // hypothetical orphan
    await store.removeSite(ORIGIN);
    expect(area.data.has(`history:${ORIGIN}`)).toBe(false);
  });

  it('keeps history isolated between origins', async () => {
    const { store } = layer();
    const other = 'https://other.example';
    await store.addSite(ORIGIN);
    await store.addSite(other);
    await store.appendSnapshot(ORIGIN, snap(1, 10));
    await store.appendSnapshot(other, snap(2, 90));
    expect((await store.getHistory(ORIGIN)).map((s) => s.composite)).toEqual([10]);
    expect((await store.getHistory(other)).map((s) => s.composite)).toEqual([90]);
  });

  it('migrate preserves existing sites once the version is stamped', async () => {
    const { store } = layer();
    await store.migrate();
    await store.addSite(ORIGIN);
    await store.migrate();
    expect(await store.isSaved(ORIGIN)).toBe(true);
  });

  it('serializes concurrent mutations (batch-style writes do not lose updates)', async () => {
    const { store } = layer();
    const other = 'https://other.example';
    await Promise.all([store.addSite(ORIGIN), store.addSite(other)]);
    await Promise.all([store.appendSnapshot(ORIGIN, snap(5)), store.appendSnapshot(other, snap(6))]);
    const sites = await store.getSites();
    expect(sites[ORIGIN].lastScanAt).toBe(5);
    expect(sites[other].lastScanAt).toBe(6);
  });

  it('merges settings patches', async () => {
    const { store } = layer();
    await store.updateSettings({ checkOverrides: { llmsTxt: true } });
    const merged = await store.updateSettings({ cfAccountId: 'a'.repeat(32) });
    expect(merged.checkOverrides?.llmsTxt).toBe(true);
    expect((await store.getSettings()).cfAccountId).toBe('a'.repeat(32));
  });
});

describe('resolveCheckIds (settings → engine)', () => {
  it('matches defaults without overrides', () => {
    expect(resolveCheckIds()).toEqual(MATRIX.filter((m) => m.defaultEnabled).map((m) => m.id));
  });

  it('enables off-by-default checks and disables default ones', () => {
    const ids = resolveCheckIds({ llmsTxt: true, a2aAgentCard: true, webBotAuth: false });
    expect(ids).toContain('llmsTxt');
    expect(ids).toContain('a2aAgentCard');
    expect(ids).not.toContain('webBotAuth');
  });
});

describe('snapshotFromScan', () => {
  function fakeScan(): ScanSuccess {
    // worst-case inputs: longest status value, real epoch width
    const statuses: [CheckId, CheckStatus][] = MATRIX.map((m) => [m.id, 'pass']);
    return {
      ok: true,
      origin: ORIGIN,
      scannedAt: Date.now(),
      results: statuses.map(([id, status]) => ({
        id,
        status,
        category: 'discovery',
        standard: 's',
        scored: true,
        evidence: 'x'.repeat(200), // heavy evidence must NOT reach the snapshot
        fixPrompt: 'y'.repeat(500),
        docUrl: 'https://d',
      })),
      scorecard: { composite: 42, level: 2, levelName: 'Bot-Aware', categories: {} },
      unreachedProbes: [],
      session: 'unknown',
    };
  }

  it('keeps statuses only and stays compact (retention math holds)', () => {
    const snapshot = snapshotFromScan(fakeScan());
    expect(snapshot.composite).toBe(42);
    expect(Object.keys(snapshot.statuses)).toHaveLength(MATRIX.length);
    const bytes = JSON.stringify(snapshot).length;
    // plan m2-dashboard.md: ~1KB per snapshot budgets 100 sites × 50 snapshots ≈ 5MB
    expect(bytes).toBeLessThan(1024);
  });
});

describe('alert inbox (v3)', () => {
  const alert = (id: string, origin = ORIGIN, at = 1): WatchAlert => ({
    id,
    origin,
    at,
    signature: 'robotsTxt|L3',
    levelDelta: -1,
    compositeDelta: -12,
    regressions: ['robotsTxt' as CheckId],
  });

  it('counts only the unread ones', async () => {
    const { store } = layer();
    await store.addAlert(alert('a'));
    await store.addAlert(alert('b'));
    expect(await store.countUnreadAlerts()).toBe(2);
    await store.markAlertsRead(['a']);
    expect(await store.countUnreadAlerts()).toBe(1);
  });

  it('markAlertsRead reports how many it actually changed', async () => {
    const { store } = layer();
    await store.addAlert(alert('a'));
    expect(await store.markAlertsRead()).toBe(1);
    expect(await store.markAlertsRead()).toBe(0); // nothing left to mark
  });

  it('a repeat of the same id resurfaces as unread (re-occurrence, not a duplicate)', async () => {
    const { store } = layer();
    await store.addAlert(alert('a', ORIGIN, 1));
    await store.markAlertsRead();
    await store.addAlert(alert('a', ORIGIN, 2));
    const alerts = await store.getAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].at).toBe(2);
    expect(await store.countUnreadAlerts()).toBe(1);
  });

  it('keeps the newest MAX_ALERTS', async () => {
    const { store } = layer();
    for (let i = 0; i < MAX_ALERTS + 5; i++) await store.addAlert(alert(`a${i}`, ORIGIN, i));
    const alerts = await store.getAlerts();
    expect(alerts).toHaveLength(MAX_ALERTS);
    expect(alerts[0].id).toBe('a5');
  });

  it('removing a site takes its alerts with it (no badge for a site that is gone)', async () => {
    const { store } = layer();
    await store.addSite(ORIGIN);
    await store.addAlert(alert('a'));
    await store.addAlert(alert('b', 'https://other.example'));
    await store.removeSite(ORIGIN);
    expect((await store.getAlerts()).map((a) => a.id)).toEqual(['b']);
  });

  it('dismiss and clear', async () => {
    const { store } = layer();
    await store.addAlert(alert('a'));
    await store.addAlert(alert('b'));
    await store.dismissAlert('a');
    expect((await store.getAlerts()).map((x) => x.id)).toEqual(['b']);
    await store.clearAlerts();
    expect(await store.getAlerts()).toEqual([]);
  });
});

describe('browsing settings (v3)', () => {
  it('auto-scan is off by default — browsing must not generate traffic unasked', async () => {
    const { store } = layer();
    expect(await store.getBrowsingSettings()).toEqual({ autoScan: false, scoreBadge: true, alertBadge: true });
  });

  it('resolves defaults for a partially written block', async () => {
    const { store } = layer();
    await store.updateSettings({ browsing: { autoScan: true } });
    expect(await store.getBrowsingSettings()).toEqual({ autoScan: true, scoreBadge: true, alertBadge: true });
  });
});
