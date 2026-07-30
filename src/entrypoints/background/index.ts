import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/sandbox';
import type { CheckId } from '@/checks';
import { resolveCheckIds, runChecks, scoreResults } from '@/checks';
import { probeKeysFor, runProbes } from '@/probe/probe-layer';
import { isScanRequest, type ScanResponse } from '@/shared/messaging';
import { snapshotFromScan } from '@/shared/snapshots';
import { storage } from '@/shared/storage';

async function handleScan(origin: string, requestedInclude?: CheckId[]): Promise<ScanResponse> {
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
    return scan;
  } finally {
    clearInterval(keepalive);
  }
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

  // wxt/browser is polyfill-style: returning a Promise from the listener
  // delivers its resolution as the response (async channel stays open)
  browser.runtime.onMessage.addListener((message: unknown): Promise<ScanResponse> | undefined => {
    if (!isScanRequest(message)) return undefined;
    return handleScan(message.origin, message.include).catch(
      (error: unknown): ScanResponse => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });
});
