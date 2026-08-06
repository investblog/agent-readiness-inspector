import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/sandbox';
import { type ActionLike, clearBadge, resolveBadge, setAlertBadge, setScoreBadge } from '@/background/badge';
import { disableNews, enableNews, fetchNewsPosts, NEWS_ALARM, runNewsCycle, scheduleNews } from '@/background/news';
// scores are cached per ORIGIN (every check is origin-level) and survive
// service-worker restarts — see score-cache.ts
import { type CachedScore, scoreCache } from '@/background/score-cache';
import { isFromHistory, storedScore } from '@/background/stored-score';
import { runWatchCycle, scheduleWatch, WATCH_ALARM } from '@/background/watch';
import type { CheckId } from '@/checks';
import { cardRefsFromCatalog, PROBE, resolveCheckIds, runChecks, scoreResults } from '@/checks';
import { probeKeysFor, runFollowUps, runProbes } from '@/probe/probe-layer';
import { t } from '@/shared/i18n';
import {
  isRescheduleWatchRequest,
  isScanRequest,
  isSetNewsEnabledRequest,
  type ScanResponse,
} from '@/shared/messaging';
import { normalizeOrigin } from '@/shared/origin';
import type { SnapshotDiff } from '@/shared/regression';
import { snapshotFromScan } from '@/shared/snapshots';
import { type BrowsingSettings, DEFAULT_BROWSING, isNewsItem, type NewsItem, storage } from '@/shared/storage';

/** browser.action (MV3) / browser.browserAction (MV2 Firefox). */
const action = ((browser as unknown as { action?: ActionLike; browserAction?: ActionLike }).action ??
  (browser as unknown as { browserAction: ActionLike }).browserAction) as ActionLike;

function scoreTitle(score: CachedScore): string {
  const head = `${t('extName')} — ${score.composite} · L${score.level} ${score.levelName}`;
  // A seeded score keeps the number but has to carry its date: an undated old
  // one is the "stale is worse than none" case badge.ts warns about, and a
  // dated one is not stale, it is history.
  if (!isFromHistory(score)) return head;
  return `${head} · ${t('badgeScoreMeasured', new Date(score.at).toLocaleDateString())}`;
}

/** True while the tab is still on the origin the score describes. */
async function tabStillOn(tabId: number, origin: string): Promise<boolean> {
  try {
    const tab = await browser.tabs.get(tabId);
    return Boolean(tab.url) && normalizeOrigin(tab.url as string) === origin;
  } catch {
    return false; // tab closed mid-scan
  }
}

/**
 * Which origin's score each tab is currently showing. Memory-only: a miss means
 * "clear it", the safe default — the map exists so that an in-site route change
 * does not blank a badge that is about to be repainted with the same number.
 */
const paintedOrigin = new Map<number, string>();

/** The tooltip an unscored tab should carry: an unread alert owns it if there is one. */
async function idleTitle(): Promise<string> {
  const store = await storage();
  const { alertBadge } = await store.getBrowsingSettings();
  const unread = alertBadge ? await store.countUnreadAlerts() : 0;
  return unread > 0 ? t('badgeAlertsTitle', String(unread)) : t('extName');
}

/**
 * Paints a tab's score, subject to the precedence rule (badge.ts): an unread
 * alert outranks it, and the settings can switch it off. Never paints a score
 * onto a tab that has since navigated elsewhere.
 */
async function paintScore(tabId: number, origin: string, known?: CachedScore): Promise<void> {
  const valid = paintTicket();
  const score = known ?? (await (await scoreCache()).get(origin));
  if (!score || !(await tabStillOn(tabId, origin))) return;
  const store = await storage();
  const settings = await store.getBrowsingSettings();
  const unreadAlerts = settings.alertBadge ? await store.countUnreadAlerts() : 0;
  if (!valid()) return; // a sweep has decided what this tab shows
  const paint = resolveBadge({ unreadAlerts, composite: score.composite, settings });
  if (paint.kind === 'score') {
    await setScoreBadge(action, tabId, score.composite, scoreTitle(score));
    paintedOrigin.set(tabId, origin);
  } else if (paint.kind === 'none') {
    // scores are switched off — make sure no stale one is left behind
    paintedOrigin.delete(tabId);
    await clearBadge(action, tabId, await idleTitle());
  }
  // 'alerts' — the alert badge already shows and must not be covered
}

/** Last painted (unread, settings) tuple — skips the tab sweep when nothing moved. */
let lastBadgeState = '';
/**
 * Sweeps are serialized and generation-checked. A sweep is O(tabs) awaits, and
 * the commonest transition of the whole feature — an alert lands while the
 * dashboard is open, which reads it milliseconds later — fires two of them.
 * Interleaved, they used to leave "!1" stranded on whichever tabs the clearing
 * sweep reached first, with `lastBadgeState` already saying everything is fine,
 * so nothing ever repaired it.
 */
let badgeSweep: Promise<unknown> = Promise.resolve();
let badgeGeneration = 0;
/**
 * Bumped when a sweep actually starts painting. The single-tab painters
 * (`paintScore`, the navigation clear) read state, then write several awaits
 * later; if a sweep repainted the world in between, its decision is the newer
 * one and the stale write has to be dropped — otherwise one tab keeps a badge
 * that nothing will ever repair, because the sweep's bookkeeping says the world
 * is consistent. Separate from `badgeGeneration` on purpose: a sweep that
 * early-returns paints nothing and must not invalidate anyone.
 */
let paintEpoch = 0;

/** Ticket for a single-tab paint: false once a sweep has repainted since. */
function paintTicket(): () => boolean {
  const epoch = paintEpoch;
  return () => epoch === paintEpoch;
}

/**
 * Brings the whole icon in line with the inbox and the settings. Driven by the
 * storage listener, so every surface that records, reads or configures alerts
 * updates the icon without having to remember to tell the background.
 *
 * The sweep goes over ALL tabs rather than just the active one because text,
 * colour and title are three independent per-tab overrides: a tab left showing
 * a score would otherwise keep its red background and "42 · L2" tooltip under
 * an alert count, or keep a score the user just switched off.
 */
function refreshBadges(force = false): Promise<void> {
  const generation = ++badgeGeneration; // a newer request supersedes this one
  const sweep = async (): Promise<void> => {
    if (generation !== badgeGeneration) return; // superseded while queued
    const store = await storage();
    const settings = await store.getBrowsingSettings();
    const unread = settings.alertBadge ? await store.countUnreadAlerts() : 0;
    const state = `${unread}|${settings.scoreBadge}|${settings.alertBadge}`;
    if (state === lastBadgeState && !force) return; // unrelated settings writes are frequent
    // "no known state" until the sweep finishes: an aborted sweep leaves the
    // tabs half-painted, and the next one must not skip itself on a match
    lastBadgeState = '';
    paintEpoch += 1; // single-tab paints started before this point are stale now

    let queried = true;
    const tabs = await browser.tabs.query({}).catch((error: unknown) => {
      console.warn('[agent-readiness] tab sweep failed', error);
      queried = false;
      return [];
    });
    const ids = tabs.map((tab) => tab.id).filter((id): id is number => id !== undefined);
    // a failed query means the per-tab overrides were never touched — leaving
    // the guard empty is what makes the next event retry instead of trusting it
    const current = (): boolean => generation === badgeGeneration;
    const settle = (): void => {
      if (queried) lastBadgeState = state;
    };

    if (unread > 0) {
      const title = t('badgeAlertsTitle', String(unread));
      await setAlertBadge(action, unread, title); // global: covers tabs opened later
      for (const id of ids) {
        if (!current()) return;
        paintedOrigin.delete(id); // the alert replaced whatever score was here
        await setAlertBadge(action, unread, title, id);
      }
      settle();
      return;
    }

    await clearBadge(action, undefined, t('extName'));
    for (const id of ids) {
      if (!current()) return;
      paintedOrigin.delete(id);
      await clearBadge(action, id, t('extName'));
    }
    if (settings.scoreBadge) {
      for (const tab of tabs) {
        if (!current()) return;
        const origin = tab.url ? normalizeOrigin(tab.url) : null;
        if (tab.id !== undefined && origin) await paintScore(tab.id, origin); // scores come back
      }
    }
    settle();
  };
  badgeSweep = badgeSweep.then(sweep, sweep);
  return badgeSweep.then(() => undefined);
}

async function handleScan(origin: string, requestedInclude?: CheckId[], tabId?: number): Promise<ScanResponse> {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return { ok: false, error: `not a valid origin: ${origin}` };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: `only http(s) pages can be scanned (got ${parsed.protocol})` };
  }

  // MV3 SW keepalive: a worst-case scan (hanging target, 4 waves × 15s) outlives
  // the 30s idle timer — plain fetch does not reset it, an extension API call does.
  const keepalive = setInterval(() => {
    void browser.runtime.getPlatformInfo?.().catch(() => {});
  }, 20_000);
  try {
    // background is the single source of truth for the enabled-check set,
    // unless the caller asks for an explicit one (external-scan diff)
    const store = await storage();
    const { checkOverrides } = await store.getSettings();
    const include = requestedInclude ?? resolveCheckIds(checkOverrides);

    const { responses, unreached } = await runProbes(parsed.origin, probeKeysFor(include));
    // Second round: a Server Card's address is only known after the AI Catalog
    // is read, so it cannot be part of the fixed probe set (SEP-2127).
    const cardRefs = cardRefsFromCatalog(responses.get(PROBE.aiCatalog));
    if (cardRefs.urls.length > 0) {
      for (const [url, res] of await runFollowUps(cardRefs.urls)) responses.set(url, res);
    }
    const results = runChecks({ origin: parsed.origin, responses }, { include });
    const scan: ScanResponse = {
      ok: true,
      origin: parsed.origin,
      scannedAt: Date.now(),
      results,
      scorecard: scoreResults(results),
      unreachedProbes: unreached,
      session: 'unknown',
    };
    // single write point: history is recorded only for saved sites (privacy
    // rule). Best-effort — a storage failure (e.g. quota) must never turn a
    // successful scan into a UI error.
    try {
      await store.appendSnapshot(parsed.origin, snapshotFromScan(scan));
    } catch (error) {
      console.warn('[agent-readiness] history write failed', error);
    }
    // an explicit check selection produces a score that is not comparable with
    // the user's configured set — never cache or paint that one
    if (requestedInclude === undefined) {
      const { composite, level, levelName } = scan.scorecard;
      const score = { composite, level, levelName, at: Date.now() };
      // a run with unreachable probes is a degraded reading: show it (the panel
      // shows the same number, with its own caveat) but never let it suppress a
      // rescan for the whole TTL
      if (unreached.length === 0) await (await scoreCache()).put(parsed.origin, score);
      if (tabId !== undefined) await paintScore(tabId, parsed.origin, score);
    }
    return scan;
  } finally {
    clearInterval(keepalive);
  }
}

// ---- Auto-scan while browsing (opt-in, plan m3.5) ----

/** Serialized: browsing bursts must not fan out into parallel scans. */
let autoScanChain: Promise<unknown> = Promise.resolve();
/** Ctrl-clicking twenty links must not enqueue twenty scans. */
const AUTO_SCAN_MAX_QUEUE = 3;
/**
 * Origins already queued. One navigation raises two events (`url`, then
 * `complete`), and when the first scan comes back degraded it deliberately
 * caches nothing — without this the second event would immediately rescan the
 * same site.
 */
const queuedOrigins = new Set<string>();

/**
 * Reacts to the user landing on a page: repaint from cache when this origin is
 * already known, otherwise scan it — but only when auto-scan is switched on.
 * The cache is re-checked inside the queued task because the queue may wait
 * behind another scan that fills it.
 */
async function onTabShowsOrigin(tabId: number, origin: string): Promise<void> {
  const { autoScan, scoreBadge } = await browsingSettings();
  const cached = await (await scoreCache()).get(origin);
  if (cached) {
    if (scoreBadge) await paintScore(tabId, origin, cached);
    return;
  }
  // Nothing scanned this origin this session. For a saved site the last
  // recorded score is a better answer than an empty icon — this is what made
  // the badge look like it "only works with the side panel open".
  if (scoreBadge) {
    const stored = await storedScore(await storage(), origin);
    if (stored) {
      await paintScore(tabId, origin, stored);
      // painted, but NOT returned: with auto-scan on, a stored number is a
      // placeholder until the fresh scan below replaces it
      if (!autoScan) return;
    }
  }
  if (!autoScan || queuedOrigins.has(origin) || queuedOrigins.size >= AUTO_SCAN_MAX_QUEUE) return;
  queuedOrigins.add(origin);
  const task = async (): Promise<void> => {
    try {
      const fresh = await (await scoreCache()).get(origin);
      if (fresh) {
        await paintScore(tabId, origin, fresh);
        return;
      }
      if (!(await tabStillOn(tabId, origin))) return; // user moved on before their turn
      const result = await handleScan(origin, undefined, tabId);
      if (!result.ok) console.warn('[agent-readiness] auto-scan failed', origin, result.error);
    } finally {
      queuedOrigins.delete(origin);
    }
  };
  autoScanChain = autoScanChain.then(task, task).catch(() => {});
}

async function browsingSettings(): Promise<BrowsingSettings> {
  try {
    return await (await storage()).getBrowsingSettings();
  } catch {
    return DEFAULT_BROWSING;
  }
}

/**
 * Notification for a filed post — only when the user granted the permission.
 * The inbox entry is already written by the time this runs, so declining
 * notifications costs nothing but the toast.
 */
async function notifyNews(item: NewsItem): Promise<void> {
  const granted = await browser.permissions.contains({ permissions: ['notifications'] });
  if (!granted || !browser.notifications) return;
  await browser.notifications.create(item.id, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icons/128.png'),
    title: item.title,
    message: item.body.slice(0, 200),
  });
}

/** Notification for a regression — only when the user granted the permission. */
async function notifyRegression(origin: string, diff: SnapshotDiff): Promise<void> {
  const { notify } = await (await storage()).getWatchSettings();
  if (!notify) return;
  const granted = await browser.permissions.contains({ permissions: ['notifications'] });
  if (!granted || !browser.notifications) return; // watch still works, silently

  const host = origin.replace(/^https?:\/\//, '');
  const body =
    diff.regressions.length > 0
      ? t(
          'alertChecksRegressed',
          String(diff.regressions.length),
          diff.regressions.map((id) => t(`check_${id}`)).join(', '),
        )
      : t('alertLevelDropped', String(Math.abs(diff.levelDelta)));
  // one live card per site: a new alert replaces the previous one for the same
  // origin instead of stacking
  await browser.notifications.create(`watch:${origin}`, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icons/128.png'),
    title: t('alertTitle', host),
    message: body,
  });
}

export default defineBackground(() => {
  // Chromium: icon click opens the side panel (spec §6, RI pattern). The popup
  // stays the Firefox-only UX — its manifest keeps default_popup.
  (browser as unknown as { sidePanel?: { setPanelBehavior?: (o: object) => Promise<void> } }).sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    ?.catch((error: unknown) => console.warn('[agent-readiness] setPanelBehavior failed', error));

  // Onboarding + uninstall feedback (RI pattern)
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
    }
  });
  browser.runtime
    .setUninstallURL?.(
      'https://301.st/contact?utm_source=agent-readiness-inspector&utm_medium=extension&utm_campaign=uninstall',
    )
    ?.catch((error: unknown) => console.warn('[agent-readiness] setUninstallURL failed', error));

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // a url change is a navigation; `complete` also catches the case where the
    // new page is one we get no url for at all (chrome://, about:)
    if (!changeInfo.url && changeInfo.status !== 'complete') return;
    const origin = tab.url ? normalizeOrigin(tab.url) : null;
    void (async () => {
      // A score belongs to the page that produced it, so leaving that origin
      // drops it. An in-site route change keeps it: every check is origin-level,
      // so the verdict has not changed and blanking it would only blink.
      // `null` (not '') reverts to the global badge, so a pending alert shows
      // through here, and the title has to follow the same rule.
      //
      // The condition is "this tab is showing a score for another origin", NOT
      // "changeInfo.url is set": no extension can hold permission for
      // chrome:// or about:, so navigating a scored tab there arrives as a bare
      // `complete` with no url — and the score used to stay on the icon for a
      // page we cannot even see.
      if (paintedOrigin.has(tabId) && paintedOrigin.get(tabId) !== origin) {
        const valid = paintTicket();
        paintedOrigin.delete(tabId);
        const title = await idleTitle();
        if (valid()) await clearBadge(action, tabId, title);
      }
      if (!origin || !tab.active) return; // only the page the user is looking at
      await onTabShowsOrigin(tabId, origin);
    })().catch((error: unknown) => console.warn('[agent-readiness] tab update failed', error));
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void (async () => {
      // settings first: with both switches off there is nothing to do, and the
      // handler should not wake up the tab APIs on every switch to find out
      const { autoScan, scoreBadge } = await browsingSettings();
      if (!autoScan && !scoreBadge) return;
      const tab = await browser.tabs.get(tabId).catch(() => undefined);
      const origin = tab?.url ? normalizeOrigin(tab.url) : null;
      if (origin) await onTabShowsOrigin(tabId, origin);
    })().catch((error: unknown) => console.warn('[agent-readiness] tab activation failed', error));
  });

  // One listener keeps the icon honest: the inbox and the badge settings are
  // its only inputs, and both live in storage.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!('alerts' in changes) && !('settings' in changes)) return;
    void refreshBadges().catch((error: unknown) => console.warn('[agent-readiness] badge refresh failed', error));
  });
  // Badge text is browser-session state: it survives a service-worker restart
  // but not a browser restart or an extension update. So it is rebuilt on those
  // two events ONLY — sweeping on every SW wake (which a tab switch triggers)
  // would repeatedly wipe badges the browser was still showing correctly.
  const rebuildBadges = (): void => {
    void refreshBadges(true).catch((error: unknown) => console.warn('[agent-readiness] badge init failed', error));
  };
  browser.runtime.onStartup?.addListener(rebuildBadges);
  browser.runtime.onInstalled.addListener(rebuildBadges);

  browser.tabs.onRemoved.addListener((tabId) => paintedOrigin.delete(tabId));

  // Watch mode (spec §7). The alarm is re-created on every SW start: Chrome can
  // drop alarms across extension updates, and create() replaces by name.
  void scheduleWatch().catch((error: unknown) => console.warn('[agent-readiness] scheduleWatch failed', error));

  // 301.sh feed (spec §9). Same alarm discipline as watch; scheduleNews clears
  // the alarm when the feature is off, so a disabled feed leaves nothing behind.
  void scheduleNews().catch((error: unknown) => console.warn('[agent-readiness] scheduleNews failed', error));

  browser.notifications?.onClicked?.addListener((id) => {
    if (!id.startsWith('news:')) return;
    void (async () => {
      const item = (await (await storage()).getAlerts()).find((entry) => entry.id === id);
      if (item && isNewsItem(item)) await browser.tabs.create({ url: item.url });
      browser.notifications?.clear?.(id);
    })().catch((error: unknown) => console.warn('[agent-readiness] news click failed', error));
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === NEWS_ALARM) {
      void (async () => {
        const store = await storage();
        const { filed } = await runNewsCycle({ store, fetchPosts: fetchNewsPosts, notify: notifyNews });
        if (filed.length > 0) await rebuildBadges();
      })().catch((error: unknown) => console.warn('[agent-readiness] news cycle failed', error));
      return;
    }
    if (alarm.name !== WATCH_ALARM) return;
    void (async () => {
      const store = await storage();
      await runWatchCycle({
        store,
        scanner: {
          async scan(origin) {
            const result = await handleScan(origin);
            return result.ok ? snapshotFromScan(result) : null;
          },
        },
        notify: notifyRegression,
      });
    })().catch((error: unknown) => console.warn('[agent-readiness] watch cycle failed', error));
  });

  // wxt/browser is polyfill-style: returning a Promise from the listener
  // delivers its resolution as the response (async channel stays open)
  browser.runtime.onMessage.addListener((message: unknown): Promise<ScanResponse | undefined> | undefined => {
    if (isRescheduleWatchRequest(message)) {
      return scheduleWatch()
        .catch((error: unknown) => console.warn('[agent-readiness] reschedule failed', error))
        .then(() => undefined);
    }
    if (isSetNewsEnabledRequest(message)) {
      return (async () => {
        const store = await storage();
        if (message.enabled) {
          await enableNews({ store, fetchPosts: fetchNewsPosts, notify: notifyNews });
        } else {
          await disableNews(store);
        }
      })()
        .catch((error: unknown) => console.warn('[agent-readiness] news toggle failed', error))
        .then(() => undefined);
    }
    if (!isScanRequest(message)) return undefined;
    return handleScan(message.origin, message.include, message.tabId).catch(
      (error: unknown): ScanResponse => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });
});
