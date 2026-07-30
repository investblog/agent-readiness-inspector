// Single origin validator for every surface (M2-b review): storage keys and
// rendered hrefs must never carry a non-http(s) scheme — the dashboard renders
// saved origins as links on an extension page, so a `javascript:` key would be
// script execution in the extension origin.

/** Normalizes user/tab input to a bare http(s) origin, or null if it isn't one. */
export function normalizeOrigin(input: string): string | null {
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** True when the string is already a clean http(s) origin (no path, no creds). */
export function isSafeOrigin(value: string): boolean {
  return normalizeOrigin(value) === value;
}
