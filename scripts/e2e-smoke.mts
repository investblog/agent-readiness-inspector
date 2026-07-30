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
