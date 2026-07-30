import { browser } from 'wxt/browser';

/**
 * Shorthand for browser.i18n.getMessage() (RI pattern). Synchronous — safe for
 * DOM rendering hot paths. Falls back to the key name when missing (dev aid).
 */
// WXT generates strict per-key overloads; our keys are dynamic (check ids) —
// view the API through a loose signature instead of casting every call site.
const getMessage = browser.i18n.getMessage as (key: string, substitutions?: string[]) => string;

export function t(key: string, ...substitutions: string[]): string {
  const msg = getMessage(key, substitutions.length > 0 ? substitutions : undefined);
  return msg || key;
}

/** Hydrate static markup: every [data-i18n] gets its message as textContent. */
export function hydrate(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  }
}
