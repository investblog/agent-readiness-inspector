import { describe, expect, it, vi } from 'vitest';
import type { SnapshotDiff } from '@/shared/regression';
import type { ScanSnapshot } from '@/shared/storage';
import { StorageLayer } from '@/shared/storage';
import { FakeArea } from '@/shared/test-support';
import { type AlarmsLike, runWatchCycle, scheduleWatch, WATCH_ALARM, WATCH_BATCH_SIZE } from './watch';

function snap(composite: number, statuses: ScanSnapshot['statuses'], at = 1): ScanSnapshot {
  return { scannedAt: at, composite, level: composite >= 65 ? 4 : composite >= 45 ? 3 : 2, statuses };
}

interface Harness {
  store: StorageLayer;
  alerts: { origin: string; diff: SnapshotDiff }[];
  run: (next: Record<string, ScanSnapshot | null>) => Promise<{ scanned: string[]; alerted: string[] }>;
}

async function harness(origins: string[], watch = true): Promise<Harness> {
  const store = new StorageLayer(new FakeArea());
  await store.migrate();
  for (const origin of origins) {
    await store.addSite(origin);
    if (watch) await store.setWatch(origin, true);
  }
  const alerts: { origin: string; diff: SnapshotDiff }[] = [];
  return {
    store,
    alerts,
    run: (next) =>
      runWatchCycle({
        store,
        scanner: {
          async scan(origin) {
            const snapshot = next[origin] ?? null;
            if (snapshot) await store.appendSnapshot(origin, snapshot);
            return snapshot;
          },
        },
        notify: async (origin, diff) => {
          alerts.push({ origin, diff });
        },
      }),
  };
}

const SITE = 'https://a.example';

describe('runWatchCycle', () => {
  it('scans only watched sites', async () => {
    const h = await harness([SITE], false);
    await h.store.addSite('https://b.example');
    await h.store.setWatch('https://b.example', true);
    const result = await h.run({ [SITE]: snap(50, {}), 'https://b.example': snap(50, {}) });
    expect(result.scanned).toEqual(['https://b.example']);
  });

  it('stays silent on the very first snapshot (nothing to compare)', async () => {
    const h = await harness([SITE]);
    await h.run({ [SITE]: snap(30, { robotsTxt: 'fail' }) });
    expect(h.alerts).toEqual([]);
  });

  it('alerts once on a regression, then stays quiet while it is unresolved', async () => {
    const h = await harness([SITE]);
    await h.run({ [SITE]: snap(75, { robotsTxt: 'pass' }) }); // baseline
    await h.run({ [SITE]: snap(50, { robotsTxt: 'fail' }) }); // breakage
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0].diff.regressions).toEqual(['robotsTxt']);

    await h.run({ [SITE]: snap(50, { robotsTxt: 'fail' }) }); // still broken
    expect(h.alerts).toHaveLength(1);
  });

  it('alerts again when the same breakage returns after a recovery', async () => {
    const h = await harness([SITE]);
    await h.run({ [SITE]: snap(75, { robotsTxt: 'pass' }) });
    await h.run({ [SITE]: snap(50, { robotsTxt: 'fail' }) });
    expect(h.alerts).toHaveLength(1);

    await h.run({ [SITE]: snap(75, { robotsTxt: 'pass' }) }); // fixed
    expect((await h.store.getSites())[SITE].lastAlertSignature).toBe(''); // signature cleared

    await h.run({ [SITE]: snap(50, { robotsTxt: 'fail' }) }); // broke the same way again
    expect(h.alerts).toHaveLength(2);
  });

  it('does not alert when a scan fails (no news is better than a false alarm)', async () => {
    const h = await harness([SITE]);
    await h.run({ [SITE]: snap(75, { robotsTxt: 'pass' }) });
    const result = await h.run({ [SITE]: null });
    expect(result.scanned).toEqual([]);
    expect(h.alerts).toEqual([]);
  });

  it('batches a long watch list across firings via the cursor', async () => {
    const origins = Array.from({ length: WATCH_BATCH_SIZE + 3 }, (_, i) => `https://s${i}.example`);
    const h = await harness(origins);
    const snapshots = Object.fromEntries(origins.map((o) => [o, snap(50, {})]));

    const first = await h.run(snapshots);
    expect(first.scanned).toHaveLength(WATCH_BATCH_SIZE);
    const cursor = (await h.store.getWatchState()).cursor;
    expect(cursor).toBe([...origins].sort()[WATCH_BATCH_SIZE]);

    const second = await h.run(snapshots);
    expect(second.scanned).toHaveLength(3);
    expect((await h.store.getWatchState()).cursor).toBeUndefined(); // wrapped around
  });

  it('resumes after a cursor whose site was removed, instead of restarting', async () => {
    const origins = Array.from({ length: WATCH_BATCH_SIZE + 2 }, (_, i) => `https://s${i}.example`);
    const h = await harness(origins);
    const snapshots = Object.fromEntries(origins.map((o) => [o, snap(50, {})]));
    await h.run(snapshots);
    const cursor = (await h.store.getWatchState()).cursor;
    expect(cursor).toBeDefined();

    // the cursor site disappears between firings
    await h.store.removeSite(cursor as string);
    const second = await h.run(snapshots);
    // must continue past the cursor, not scan the first batch all over again
    expect(second.scanned).not.toContain(origins[0]);
    expect(second.scanned.length).toBeGreaterThan(0);
  });

  it('keeps scanning the batch when a notification fails', async () => {
    const h = await harness([SITE]);
    await h.store.addSite('https://b.example');
    await h.store.setWatch('https://b.example', true);
    const good = snap(75, { robotsTxt: 'pass' });
    await h.run({ [SITE]: good, 'https://b.example': good });

    const broken = snap(50, { robotsTxt: 'fail' });
    const result = await runWatchCycle({
      store: h.store,
      scanner: {
        async scan(origin) {
          await h.store.appendSnapshot(origin, broken);
          return broken;
        },
      },
      notify: async () => {
        throw new Error('notifications unavailable');
      },
    });
    expect(result.scanned).toHaveLength(2); // batch not aborted
    expect((await h.store.getWatchState()).lastRunAt).toBeDefined(); // cursor parked
  });

  it('writes nothing on a quiet cycle after a recovery', async () => {
    const h = await harness([SITE]);
    await h.run({ [SITE]: snap(75, { robotsTxt: 'pass' }) });
    await h.run({ [SITE]: snap(50, { robotsTxt: 'fail' }) }); // alert
    await h.run({ [SITE]: snap(75, { robotsTxt: 'pass' }) }); // recovery clears
    const alertAt = (await h.store.getSites())[SITE].lastAlertAt;

    await h.run({ [SITE]: snap(75, { robotsTxt: 'pass' }) }); // quiet
    const site = (await h.store.getSites())[SITE];
    expect(site.lastAlertSignature).toBe(''); // still cleared, not rewritten
    expect(site.lastAlertAt).toBe(alertAt); // "last alert", not "last cycle"
  });

  it('records lastRunAt even when nothing is watched', async () => {
    const h = await harness([SITE], false);
    const now = vi.fn(() => 4242);
    await runWatchCycle({
      store: h.store,
      scanner: { scan: async () => null },
      notify: async () => {},
      now,
    });
    expect((await h.store.getWatchState()).lastRunAt).toBe(4242);
  });
});

describe('scheduleWatch', () => {
  function fakeAlarms(initial?: { periodInMinutes?: number }) {
    const calls: string[] = [];
    let current = initial;
    const api: AlarmsLike = {
      async get() {
        return current;
      },
      async create(name, info) {
        calls.push(`create:${name}:${info.periodInMinutes}`);
        current = { periodInMinutes: info.periodInMinutes };
      },
      async clear(name) {
        calls.push(`clear:${name}`);
        current = undefined;
        return true;
      },
    };
    return { api, calls };
  }

  it('creates the alarm when a site is watched', async () => {
    const h = await harness([SITE]);
    const { api, calls } = fakeAlarms();
    await scheduleWatch(h.store, api);
    expect(calls).toEqual([`create:${WATCH_ALARM}:1440`]);
  });

  it('does NOT recreate an alarm with the same period (a SW start must not reset the clock)', async () => {
    const h = await harness([SITE]);
    const { api, calls } = fakeAlarms({ periodInMinutes: 1440 });
    await scheduleWatch(h.store, api);
    await scheduleWatch(h.store, api);
    expect(calls).toEqual([]);
  });

  it('recreates the alarm when the interval changed', async () => {
    const h = await harness([SITE]);
    await h.store.updateSettings({ watch: { intervalHours: 6, notify: true } });
    const { api, calls } = fakeAlarms({ periodInMinutes: 1440 });
    await scheduleWatch(h.store, api);
    expect(calls).toEqual([`create:${WATCH_ALARM}:360`]);
  });

  it('clears the alarm when nothing is watched', async () => {
    const h = await harness([SITE], false);
    const { api, calls } = fakeAlarms({ periodInMinutes: 1440 });
    await scheduleWatch(h.store, api);
    expect(calls).toEqual([`clear:${WATCH_ALARM}`]);
  });

  it('never schedules below the hourly floor', async () => {
    const h = await harness([SITE]);
    await h.store.updateSettings({ watch: { intervalHours: 0, notify: true } });
    const { api, calls } = fakeAlarms();
    await scheduleWatch(h.store, api);
    expect(calls).toEqual([`create:${WATCH_ALARM}:60`]);
  });
});

describe('alert inbox', () => {
  it('records the alert, so it survives a declined notifications permission', async () => {
    const h = await harness([SITE]);
    await h.run({ [SITE]: snap(80, { robotsTxt: 'pass' }) });
    await h.run({ [SITE]: snap(40, { robotsTxt: 'fail' }) });
    const alerts = await h.store.getAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ origin: SITE, regressions: ['robotsTxt'] });
    expect(alerts[0].readAt).toBeUndefined();
    expect(await h.store.countUnreadAlerts()).toBe(1);
  });

  it('records it even when delivering the notification fails', async () => {
    const store = new StorageLayer(new FakeArea());
    await store.migrate();
    await store.addSite(SITE);
    await store.setWatch(SITE, true);
    const run = (snapshot: ScanSnapshot): Promise<unknown> =>
      runWatchCycle({
        store,
        scanner: {
          async scan(origin) {
            await store.appendSnapshot(origin, snapshot);
            return snapshot;
          },
        },
        notify: () => Promise.reject(new Error('notifications blocked')),
      });
    await run(snap(80, { robotsTxt: 'pass' }));
    await run(snap(40, { robotsTxt: 'fail' }));
    expect(await store.countUnreadAlerts()).toBe(1);
  });

  it('does not re-record an unresolved regression on every cycle', async () => {
    const h = await harness([SITE]);
    await h.run({ [SITE]: snap(80, { robotsTxt: 'pass' }) });
    await h.run({ [SITE]: snap(40, { robotsTxt: 'fail' }) });
    await h.run({ [SITE]: snap(40, { robotsTxt: 'fail' }) });
    expect(await h.store.getAlerts()).toHaveLength(1);
  });
});
