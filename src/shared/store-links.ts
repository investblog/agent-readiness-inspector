// Per-browser store links for "Rate us" (RI pattern). URLs stay empty until
// the extension is published (M1.5) — getStoreInfo() returns null and the UI
// hides the link, so this is safe to ship ahead of the listings.

export interface StoreInfo {
  url: string;
  label: string;
}

// Each URL points at the store's REVIEWS page, not the listing: the link is
// labelled "Rate us", so it should land where a rating can be left.
const STORES: Record<string, StoreInfo> = {
  chrome: {
    url: 'https://chromewebstore.google.com/detail/agent-readiness-inspector/diofmjhnegmcccocikabageabmaokobd/reviews',
    label: 'Chrome Web Store',
  },
  edge: {
    url: '', // still in review 2026-08-06 — the link stays hidden until it lands
    label: 'Edge Add-ons',
  },
  firefox: {
    url: 'https://addons.mozilla.org/firefox/addon/agent-readiness-inspector/reviews/',
    label: 'Firefox Add-ons',
  },
};

export function getStoreInfo(): StoreInfo | null {
  const info = STORES[import.meta.env.BROWSER] ?? null;
  if (info && !info.url) return null;
  return info;
}
