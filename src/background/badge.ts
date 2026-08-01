// Toolbar badge (RI pattern, adapted): RI paints the hop count, we paint the
// readiness score — so the verdict is visible without opening the panel.
//
// The badge is per-tab and is cleared the moment the tab navigates: a score
// belongs to the page that produced it, and a stale number is worse than none.

const BAND_COLOR = {
  good: '#0A6E46', // same semantics as the panel's score ring
  mid: '#96450A',
  low: '#B01732',
} as const;

export interface ActionLike {
  setBadgeText(details: { tabId?: number; text: string }): Promise<void> | void;
  setBadgeBackgroundColor(details: { tabId?: number; color: string }): Promise<void> | void;
  setTitle?(details: { tabId?: number; title: string }): Promise<void> | void;
}

export function bandFor(composite: number): keyof typeof BAND_COLOR {
  return composite >= 65 ? 'good' : composite >= 45 ? 'mid' : 'low';
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

export async function setScoreBadge(
  action: ActionLike,
  tabId: number,
  composite: number,
  title?: string,
): Promise<void> {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  await ignoreMissingTab(() => action.setBadgeText({ tabId, text: String(composite) }));
  await ignoreMissingTab(() => action.setBadgeBackgroundColor({ tabId, color: BAND_COLOR[bandFor(composite)] }));
  if (title) await ignoreMissingTab(() => action.setTitle?.({ tabId, title }) ?? undefined);
}

export async function clearBadge(action: ActionLike, tabId: number, title?: string): Promise<void> {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  await ignoreMissingTab(() => action.setBadgeText({ tabId, text: '' }));
  if (title) await ignoreMissingTab(() => action.setTitle?.({ tabId, title }) ?? undefined);
}
