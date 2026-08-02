// Live smoke (M1 DoD, ROADMAP): load the built extension into playwright's
// bundled Chromium (branded Chrome ≥137 dropped --load-extension), open the
// panel against reference sites and assert the rendered verdicts.
//
// Usage: npm run build && npx tsx scripts/e2e-smoke.mts
// Output: console summary + dev/smoke-<host>.png screenshots.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const EXT_DIR = path.resolve('dist/chrome-mv3');
const CHROMIUM_PATH = process.env.ARI_CHROMIUM_PATH;
const BROWSER_LOCALE = process.env.ARI_BROWSER_LOCALE;
if (!fs.existsSync(path.join(EXT_DIR, 'manifest.json'))) {
  console.error('[smoke] dist/chrome-mv3 missing — run `npm run build` first');
  process.exit(1);
}

const TARGETS = [
  { origin: 'https://spintax.net', expect: (score: number) => score >= 45, label: 'living reference' },
  { origin: 'https://operator.chatgpt.com', expect: (score: number) => score === 0, label: 'soft-404 exemplar' },
];

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ari-smoke-'));
let ctx: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;

try {
  // headed — extensions don't load in the classic headless shell
  ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ...(CHROMIUM_PATH && { executablePath: CHROMIUM_PATH }),
    ...(BROWSER_LOCALE && { locale: BROWSER_LOCALE }),
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      ...(BROWSER_LOCALE ? [`--lang=${BROWSER_LOCALE}`] : []),
    ],
  });
  let [worker] = ctx.serviceWorkers();
  worker ??= await ctx.waitForEvent('serviceworker', { timeout: 15_000 });
  const extensionId = new URL(worker.url()).host;
  console.log(`[smoke] extension loaded: ${extensionId}`);

  fs.mkdirSync(path.resolve('dev'), { recursive: true });
  let failures = 0;

  for (const target of TARGETS) {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html?origin=${encodeURIComponent(target.origin)}`);
    try {
      await page.waitForSelector('#state-results:not([hidden])', { timeout: 90_000 });
      const score = Number(await page.textContent('#score-value'));
      const level = (await page.textContent('#level-name'))?.trim();
      const checks = await page.locator('.check').count();
      const ok = target.expect(score) && checks > 0;
      if (!ok) failures += 1;
      console.log(
        `[smoke] ${ok ? 'OK  ' : 'FAIL'} ${target.origin} (${target.label}): score=${score} level="${level}" checks=${checks}`,
      );
    } catch (error) {
      failures += 1;
      const errText = await page.textContent('#error-message').catch(() => null);
      console.error(`[smoke] FAIL ${target.origin}: ${errText ?? (error as Error).message}`);
    }
    const host = new URL(target.origin).host;
    await page.screenshot({ path: path.resolve('dev', `smoke-${host}.png`), fullPage: true });
    await page.close();
  }

  // ---- Panel follows the active tab, and paints the score on the toolbar ----
  {
    const site = await ctx.newPage();
    await site.goto('https://vercel.com', { waitUntil: 'domcontentloaded' });
    const panel = await ctx.newPage();
    // no ?origin=: this is how Chrome opens the real side panel
    await panel.goto(`chrome-extension://${extensionId}/popup.html?sidepanel=1`);
    try {
      await panel.waitForSelector('#state-results:not([hidden])', { timeout: 120_000 });
      const first = (await panel.textContent('#target-origin'))?.trim();

      // the user navigates the content tab — the panel must follow it
      await site.bringToFront();
      await site.goto('https://spintax.net', { waitUntil: 'domcontentloaded' });
      await panel.bringToFront();
      await panel.waitForFunction(
        () => document.getElementById('target-origin')?.textContent?.includes('spintax'),
        undefined,
        { timeout: 60_000 },
      );
      await panel.waitForFunction(() => Number(document.getElementById('score-value')?.textContent) > 50, undefined, {
        timeout: 120_000,
      });
      const second = (await panel.textContent('#target-origin'))?.trim();
      const score = Number(await panel.textContent('#score-value'));

      const badge = await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({ url: 'https://spintax.net/*' });
        const id = tabs[0]?.id;
        return id === undefined ? null : await chrome.action.getBadgeText({ tabId: id });
      });

      const ok = first === 'vercel.com' && second === 'spintax.net' && badge === String(score);
      if (!ok) failures += 1;
      console.log(
        `[smoke] ${ok ? 'OK  ' : 'FAIL'} panel follows tabs: ${first} -> ${second} score=${score} badge=${badge}`,
      );
    } catch (error) {
      failures += 1;
      console.error(`[smoke] FAIL panel follows tabs: ${(error as Error).message}`);
    }
    await panel.close();
    await site.close();
  }

  // ---- Dashboard scenario (M2-b): add a site, scan it, expect score + history ----
  {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
    try {
      // two origins: exercises the batch worker pool, stagger and per-row state
      for (const origin of ['https://spintax.net', 'https://vercel.com']) {
        await page.fill('#add-input', origin);
        await page.click('#add-button');
      }
      await page.waitForSelector('#sites-table:not([hidden])', { timeout: 10_000 });
      const rowCount = await page.locator('#sites-body tr').count();
      // two batch runs: the second gives history ≥ 2, which is what renders a trend
      await page.click('#scan-all');
      await page.waitForFunction(() => document.querySelectorAll('.score-badge').length === 2, undefined, {
        timeout: 180_000,
      });
      await page.click('#scan-all');
      await page.waitForFunction(() => document.querySelectorAll('.spark').length === 2, undefined, {
        timeout: 180_000,
      });
      const scores = (await page.locator('.score-badge').allTextContents()).map(Number);
      const sparkDots = await page.locator('.spark circle').count();
      const batchIdle = await page.isHidden('#batch-progress');
      const ok = rowCount === 2 && scores.length === 2 && scores.every((s) => s > 0) && sparkDots === 2 && batchIdle;
      if (!ok) failures += 1;
      console.log(
        `[smoke] ${ok ? 'OK  ' : 'FAIL'} dashboard batch: rows=${rowCount} scores=${scores.join('/')} sparks=${sparkDots} idle=${batchIdle}`,
      );
    } catch (error) {
      failures += 1;
      console.error(`[smoke] FAIL dashboard: ${(error as Error).message}`);
    }
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.screenshot({ path: path.resolve('dev', 'smoke-dashboard.png'), fullPage: true });
    await page.close();
  }

  // ---- The 301.st block folds into a line and stays folded ----
  {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
    try {
      await page.waitForSelector('#promo:not([hidden])', { timeout: 10_000 });
      const open = await page.locator('#promo').evaluate((el) => (el as HTMLDetailsElement).open);
      const tall = await page.locator('#promo').evaluate((el) => el.getBoundingClientRect().height);
      await page.click('.promo__summary');
      const short = await page.locator('#promo').evaluate((el) => el.getBoundingClientRect().height);
      // reload is the point: a fold the page forgets is not a fold
      await page.reload();
      await page.waitForSelector('#promo:not([hidden])', { timeout: 10_000 });
      const stillFolded = await page.locator('#promo').evaluate((el) => !(el as HTMLDetailsElement).open);
      const ctaHidden = await page.isHidden('#promo-cta');

      const ok = open && short < tall / 2 && stillFolded && ctaHidden;
      if (!ok) failures += 1;
      console.log(
        `[smoke] ${ok ? 'OK  ' : 'FAIL'} promo folds: ${Math.round(tall)}px -> ${Math.round(short)}px, stays folded=${stillFolded}`,
      );
    } catch (error) {
      failures += 1;
      console.error(`[smoke] FAIL promo: ${(error as Error).message}`);
    }
    await page.close();
  }

  // ---- Shared helpers for the watch / badge scenarios ----
  const sw = (): typeof worker => ctx?.serviceWorkers()[0] ?? worker;
  const poll = async <T,>(read: () => Promise<T>, done: (value: T) => boolean, ms: number): Promise<T> => {
    const deadline = Date.now() + ms;
    let value = await read();
    while (!done(value) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      value = await read();
    }
    return value;
  };
  const globalBadge = (): Promise<string> => sw().evaluate(() => chrome.action.getBadgeText({}));
  /** Text, colour and title of one tab's badge — all three are separate overrides. */
  const tabBadge = (pattern: string): Promise<{ text: string; color: number[]; title: string }> =>
    sw().evaluate(async (urlPattern) => {
      const tabs = await chrome.tabs.query({ url: urlPattern });
      const tabId = tabs[0]?.id;
      if (tabId === undefined) return { text: 'no-tab', color: [], title: '' };
      return {
        text: await chrome.action.getBadgeText({ tabId }),
        color: (await chrome.action.getBadgeBackgroundColor({ tabId })) as unknown as number[],
        title: await chrome.action.getTitle({ tabId }),
      };
    }, pattern);
  const ALERT_RGBA = [29, 78, 216, 255]; // #1D4ED8, the alert colour in badge.ts

  // ---- Auto-scan arms the icon (M3.5) — its tab stays open for the badge scenarios ----
  const site = await ctx.newPage();
  try {
    // vercel.com was scanned by earlier blocks, so its cached score would paint
    // the badge without auto-scan running at all — drop the cache first
    const reset = async (autoScan: boolean): Promise<void> => {
      await sw().evaluate(async (on) => {
        await chrome.storage.session.remove('scoreCache');
        const { settings = {} } = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: { ...settings, browsing: { autoScan: on } } });
      }, autoScan);
    };

    // OFF by default is the feature's central privacy promise: browsing must
    // generate no scan at all. Assert the promise, not just the stored value.
    await reset(false);
    await site.bringToFront();
    await site.goto('https://vercel.com', { waitUntil: 'domcontentloaded' });
    const quiet = await poll(
      () => tabBadge('https://vercel.com/*').then((b) => b.text),
      (text) => text !== '', // any paint at all fails the promise
      20_000,
    );
    const cachedWhileOff = await sw().evaluate(async () => {
      const { scoreCache = {} } = await chrome.storage.session.get('scoreCache');
      return Object.keys(scoreCache as Record<string, unknown>).length;
    });

    await reset(true);
    await site.reload({ waitUntil: 'domcontentloaded' });
    const badge = await poll(
      () => tabBadge('https://vercel.com/*').then((b) => b.text),
      (text) => /^\d+$/.test(text),
      120_000,
    );

    const ok = quiet === '' && cachedWhileOff === 0 && /^\d+$/.test(badge);
    if (!ok) failures += 1;
    console.log(
      `[smoke] ${ok ? 'OK  ' : 'FAIL'} auto-scan: off->badge="${quiet}" cached=${cachedWhileOff}; on->badge="${badge}"`,
    );
  } catch (error) {
    failures += 1;
    console.error(`[smoke] FAIL auto-scan: ${(error as Error).message}`);
  }

  // ---- Watch scenario (M3): a planted baseline must produce a regression alert ----
  {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
    try {
      await page.waitForSelector('#sites-body tr', { timeout: 10_000 });
      // watch toggle is the 2nd action button in the row
      await page.click('#sites-body tr:first-child td.col-actions button:nth-child(2)');
      await page.waitForTimeout(800);

      const origin = await page.getAttribute('#sites-body tr:first-child', 'data-origin');
      const alarm = await worker.evaluate(async () => {
        const a = await chrome.alarms.get('agent-readiness:watch');
        return a ? a.periodInMinutes : null;
      });

      // close the dashboard BEFORE the alert lands: an open dashboard marks
      // alerts read on arrival (by design), which would leave the next scenario
      // nothing unread to look at
      await page.close();

      // plant a perfect past so the next real scan is unambiguously a regression
      await worker.evaluate(async (target) => {
        await chrome.storage.local.set({
          [`history:${target}`]: [
            {
              scannedAt: Date.now() - 86_400_000,
              composite: 100,
              level: 5,
              statuses: { robotsTxt: 'pass', authMd: 'pass', oauthDiscovery: 'pass' },
            },
          ],
        });
        await chrome.alarms.create('agent-readiness:watch', { when: Date.now() + 1000 });
      }, origin);

      let signature: string | undefined;
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline && !signature) {
        await new Promise((resolve) => setTimeout(resolve, 3000)); // the page is gone; don't wait through it
        signature = await worker.evaluate(async (target) => {
          const { sites } = await chrome.storage.local.get('sites');
          return sites?.[target as string]?.lastAlertSignature || undefined;
        }, origin);
      }

      const ok = alarm !== null && Boolean(signature);
      if (!ok) failures += 1;
      console.log(`[smoke] ${ok ? 'OK  ' : 'FAIL'} watch: alarm=${alarm}min regression="${signature ?? 'none'}"`);
    } catch (error) {
      failures += 1;
      console.error(`[smoke] FAIL watch: ${(error as Error).message}`);
      await page.close();
    }
  }

  // ---- Alert badge: precedence over a painted score, style, read-marking (M3.5) ----
  {
    // the watch scenario above left a REAL alert in the inbox, and the vercel
    // tab is showing a real auto-scan score — exactly the collision the
    // precedence rule exists for
    const alerted = await poll(globalBadge, (text) => /^!\d/.test(text), 60_000);
    const onScored = await poll(
      () => tabBadge('https://vercel.com/*'),
      (b) => /^!\d/.test(b.text),
      30_000,
    );
    // all three per-tab overrides must belong to the alert, not to the score.
    // The expected tooltip is asked of the extension itself — hardcoding English
    // would fail the moment the browser runs in another UI locale.
    const unread = alerted.replace('!', ''); // the count the badge is actually claiming
    const expectedTitle = await sw().evaluate((count) => chrome.i18n.getMessage('badgeAlertsTitle', [count]), unread);
    const styled =
      /^!\d/.test(onScored.text) &&
      JSON.stringify(onScored.color) === JSON.stringify(ALERT_RGBA) &&
      onScored.title === expectedTitle;

    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
    try {
      await page.bringToFront(); // reading is gated on focus, not just visibility
      // opening the inbox is what marks it read: the badge clears...
      await page.waitForSelector('#alerts:not([hidden])', { timeout: 15_000 });
      const rows = await page.locator('.alert-row').count();
      const highlighted = await page.locator('.alert-row--new').count();
      const cleared = await poll(globalBadge, (text) => text === '', 30_000);

      // ...while the rows stay marked as new for this visit
      const stillHighlighted = await page.locator('.alert-row--new').count();
      // ...and the browsing tab gets its score back
      const restored = await poll(
        () => tabBadge('https://vercel.com/*'),
        (b) => /^\d+$/.test(b.text),
        30_000,
      );

      const ok =
        /^!\d/.test(alerted) &&
        styled &&
        rows > 0 &&
        highlighted > 0 &&
        cleared === '' &&
        stillHighlighted > 0 &&
        /^\d+$/.test(restored.text);
      if (!ok) failures += 1;
      console.log(
        `[smoke] ${ok ? 'OK  ' : 'FAIL'} alert badge: global="${alerted}" on-scored-tab="${onScored.text}" styled=${styled} -> cleared="${cleared}" score-back="${restored.text}" rows=${rows} new=${highlighted}/${stillHighlighted}`,
      );
    } catch (error) {
      failures += 1;
      console.error(`[smoke] FAIL alert badge: ${(error as Error).message}`);
    }
    await page.screenshot({ path: path.resolve('dev', 'smoke-alerts.png'), fullPage: true });
    await page.close();
  }
  try {
    await sw().evaluate(async () => {
      const { settings = {} } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({
        settings: { ...settings, browsing: { autoScan: true, scoreBadge: false } },
      });
    });
    const afterOff = await poll(
      () => tabBadge('https://vercel.com/*').then((b) => b.text),
      (t) => t === '',
      30_000,
    );
    const ok = afterOff === '';
    if (!ok) failures += 1;
    console.log(`[smoke] ${ok ? 'OK  ' : 'FAIL'} score badge off clears painted tabs: "${afterOff}"`);
  } catch (error) {
    failures += 1;
    console.error(`[smoke] FAIL score badge off: ${(error as Error).message}`);
  }
  await site.close();

  if (failures > 0) {
    console.error(`[smoke] ${failures} target(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('[smoke] all targets green');
  }
} finally {
  await ctx?.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
