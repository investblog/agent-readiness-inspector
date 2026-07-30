// Per-browser store links for "Rate us" (RI pattern). URLs stay empty until
// the extension is published (M1.5) — getStoreInfo() returns null and the UI
// hides the link, so this is safe to ship ahead of the listings.

export interface StoreInfo {
  url: string;
  label: string;
}

const STORES: Record<string, StoreInfo> = {
  chrome: {
    url: '', // filled after Chrome Web Store publication (M1.5)
    label: 'Chrome Web Store',
  },
  edge: {
    url: '', // filled after Edge Add-ons publication
    label: 'Edge Add-ons',
  },
  firefox: {
    url: '', // filled after AMO publication
    label: 'Firefox Add-ons',
  },
};

export function getStoreInfo(): StoreInfo | null {
  const info = STORES[import.meta.env.BROWSER] ?? null;
  if (info && !info.url) return null;
  return info;
}
