// Toolbar badge (RI pattern, adapted): RI paints the hop count, we paint the
// readiness score — so the verdict is visible without opening the panel.
//
// The badge is ONE surface with TWO jobs (plan m3.5), so the precedence is
// explicit rather than incidental:
//
//   unread watch alerts  >  score of the current tab  >  nothing
//
// An unread regression is an event that asks for action and clears itself once
// read; a score is ambient and comes back on the next scan. The reverse order
// would hide alerts forever for anyone browsing with auto-scan on.
//
// The two are told apart WITHOUT relying on colour (project a11y rule): the
// alert badge is prefixed with "!", so 8 and !8 differ in monochrome too.
//
// Scores are painted per-tab and cleared on navigation — a score belongs to the
// page that produced it, and a stale number is worse than none. The alert count
// is global (it is not about any one tab); in Chromium a per-tab text hides the
// global one, which is why the caller clears per-tab texts when an alert lands.

import type { BrowsingSettings } from '@/shared/storage';

const BAND_COLOR = {
  good: '#0A6E46', // same semantics as the panel's score ring
  mid: '#96450A',
  low: '#B01732',
} as const;

/** Deliberately outside the three score bands, in hue and in meaning. */
export const ALERT_COLOR = '#1D4ED8';

export interface ActionLike {
  /** `text: null` on a tab REVERTS it to the global badge; `''` blanks it out. */
  setBadgeText(details: { tabId?: number; text: string | null }): Promise<void> | void;
  setBadgeBackgroundColor(details: { tabId?: number; color: string }): Promise<void> | void;
  setTitle?(details: { tabId?: number; title: string }): Promise<void> | void;
}

export function bandFor(composite: number): keyof typeof BAND_COLOR {
  return composite >= 65 ? 'good' : composite >= 45 ? 'mid' : 'low';
}

/** Badge text stays short enough to render: 3 characters, capped at "!9+". */
export function alertBadgeText(count: number): string {
  return count > 9 ? '!9+' : `!${count}`;
}

export type BadgePaint = { kind: 'alerts' | 'score'; text: string; color: string } | { kind: 'none' };

/**
 * The whole precedence rule as one pure function, so it is testable and there
 * is exactly one place that decides what the icon shows.
 */
export function resolveBadge(input: {
  unreadAlerts: number;
  composite: number | null;
  settings: BrowsingSettings;
}): BadgePaint {
  const { unreadAlerts, composite, settings } = input;
  if (settings.alertBadge && unreadAlerts > 0) {
    return { kind: 'alerts', text: alertBadgeText(unreadAlerts), color: ALERT_COLOR };
  }
  if (settings.scoreBadge && composite !== null) {
    return { kind: 'score', text: String(composite), color: BAND_COLOR[bandFor(composite)] };
  }
  return { kind: 'none' };
}

/** Swallows the "No tab with id" race that happens when a tab closes mid-scan. */
async function ignoreMissingTab(op: () => Promise<void> | void): Promise<void> {
  try {
    await op();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('No tab with id')) console.warn('[agent-readiness] badge update failed', error);
  }
}

/** `tabId` omitted paints the global (all-tabs) badge. */
async function paint(
  action: ActionLike,
  tabId: number | undefined,
  text: string | null,
  color?: string,
): Promise<void> {
  const scope = tabId === undefined ? {} : { tabId };
  await ignoreMissingTab(() => action.setBadgeText({ ...scope, text }));
  if (color) await ignoreMissingTab(() => action.setBadgeBackgroundColor({ ...scope, color }));
}

async function setTitle(action: ActionLike, tabId: number | undefined, title?: string): Promise<void> {
  if (!title) return;
  const scope = tabId === undefined ? {} : { tabId };
  await ignoreMissingTab(() => action.setTitle?.({ ...scope, title }) ?? undefined);
}

export async function setScoreBadge(
  action: ActionLike,
  tabId: number,
  composite: number,
  title?: string,
): Promise<void> {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  await paint(action, tabId, String(composite), BAND_COLOR[bandFor(composite)]);
  await setTitle(action, tabId, title);
}

/**
 * Global by design: an unread regression is not a property of the current tab.
 * `tabId` is for the tabs that are already showing a score — their per-tab
 * colour and title are separate overrides, so reverting only their text would
 * leave the alert count wearing the score's colour and tooltip.
 */
export async function setAlertBadge(action: ActionLike, count: number, title?: string, tabId?: number): Promise<void> {
  if (count <= 0) return;
  await paint(action, tabId, alertBadgeText(count), ALERT_COLOR);
  await setTitle(action, tabId, title);
}

/**
 * Per tab, "clear" means REVERT (`null`): the tab stops showing its own score
 * and falls back to the global badge, so a pending alert shows through instead
 * of being blanked out. Globally there is nothing to fall back to, so `''`.
 */
export async function clearBadge(action: ActionLike, tabId?: number, title?: string): Promise<void> {
  if (tabId !== undefined && (!Number.isInteger(tabId) || tabId < 0)) return;
  await paint(action, tabId, tabId === undefined ? '' : null);
  await setTitle(action, tabId, title);
}
