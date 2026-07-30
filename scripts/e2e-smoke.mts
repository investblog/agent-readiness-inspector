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
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
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
        await page.waitForTimeout(3000);
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
    }
    await page.close();
  }

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
