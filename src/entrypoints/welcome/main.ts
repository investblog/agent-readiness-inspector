import '@/assets/css/theme.css';
import '@/assets/css/welcome.css';
import { browser } from 'wxt/browser';
import { svg301Logo } from '@/shared/brand';
import { hydrate, t } from '@/shared/i18n';
import { injectSprite } from '@/shared/icons';
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

document.getElementById('brand-logo')?.append(svg301Logo(14));

// CTA: open the living reference — scanning it is the fastest "aha" (spec §9)
document.getElementById('cta')?.addEventListener('click', () => {
  void browser.tabs.create({
    url: 'https://spintax.net/?utm_source=agent-readiness-inspector&utm_medium=extension&utm_campaign=welcome',
  });
});
