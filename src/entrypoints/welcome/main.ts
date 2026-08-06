import '@/assets/css/theme.css';
import '@/assets/css/welcome.css';
import { browser } from 'wxt/browser';
import { mascot, svg301Logo } from '@/shared/brand';
import { hydrate, t } from '@/shared/i18n';
import { icon, injectSprite } from '@/shared/icons';
import { initTheme } from '@/shared/theme';

document.documentElement.lang = browser.i18n.getUILanguage?.() ?? 'en';
initTheme();
injectSprite();

document.title = t('welcomeTitle');
hydrate();
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
  const key = el.dataset.i18nTitle;
  if (!key) continue;
  const msg = t(key);
  el.title = msg;
  el.setAttribute('aria-label', msg);
}

const versionEl = document.getElementById('version');
if (versionEl) versionEl.textContent = `v${browser.runtime.getManifest().version}`;

document.getElementById('brand-mascot')?.append(mascot(44));
document.getElementById('brand-logo')?.append(svg301Logo(14));
document.getElementById('github-link')?.prepend(icon('github', 14));

// Opening the reference site alone shows the page and none of the report, so the
// CTA opens the panel too. Both APIs may only run inside a user-gesture handler
// — Chrome: "This may only be called in response to a user action"; Firefox:
// "only ... from inside the handler for a user action" — which shapes the code
// below in two ways: the window id is resolved now, because awaiting it inside
// the click would spend the gesture, and the panel is opened before the awaited
// tabs.create rather than after it.
let windowId: number | undefined;
browser.windows
  ?.getCurrent()
  .then((win) => {
    windowId = win.id;
  })
  .catch((error: unknown) => console.warn('[agent-readiness] window id lookup failed', error));

interface PanelApi {
  sidePanel?: { open?: (options: { windowId?: number; tabId?: number }) => Promise<void> };
  sidebarAction?: { open?: () => Promise<void> };
}

/** Chromium opens a global panel per window; Firefox has no sidePanel at all and
 * takes no target. Feature-detected rather than branched on BROWSER, so an Edge
 * or Chromium fork that ships one API and not the other still lands correctly. */
function openPanel(): void {
  const api = browser as unknown as PanelApi;
  const warn = (error: unknown) => console.warn('[agent-readiness] panel open failed', error);
  if (api.sidePanel?.open) {
    // open() rejects unless it is given a target, so a lookup that has not come
    // back yet means skipping rather than calling it with nothing.
    if (windowId === undefined) {
      console.warn('[agent-readiness] window id not resolved — panel not opened');
      return;
    }
    api.sidePanel.open({ windowId }).catch(warn);
    return;
  }
  api.sidebarAction?.open?.().catch(warn);
}

// CTA: open the living reference — scanning it is the fastest "aha" (spec §9)
document.getElementById('cta')?.addEventListener('click', () => {
  openPanel();
  void browser.tabs.create({
    url: 'https://spintax.net/?utm_source=agent-readiness-inspector&utm_medium=extension&utm_campaign=welcome',
  });
});
