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
    // The listing itself, not a reviews page: Edge has none. `/reviews` answers
    // 200 with an empty shell, which is how it fools a status-code check —
    // verified 2026-08-07 by looking for the extension name in the HTML.
    url: 'https://microsoftedge.microsoft.com/addons/detail/agent-readiness-inspector/jkhmlkoehfmmpgihkknnopanjcipmiho',
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
