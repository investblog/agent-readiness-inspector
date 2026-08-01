import { describe, expect, it } from 'vitest';
import { DEFAULT_BROWSING } from '@/shared/storage';
import {
  type ActionLike,
  ALERT_COLOR,
  alertBadgeText,
  clearBadge,
  resolveBadge,
  setAlertBadge,
  setScoreBadge,
} from './badge';

/** Records what would land on the icon, per scope ('global' or a tab id). */
function fakeAction(): ActionLike & {
  text: Map<string, string | null>;
  color: Map<string, string>;
  title: Map<string, string>;
} {
  const text = new Map<string, string | null>();
  const color = new Map<string, string>();
  const title = new Map<string, string>();
  const key = (tabId?: number): string => (tabId === undefined ? 'global' : String(tabId));
  return {
    text,
    color,
    title,
    setBadgeText: ({ tabId, text: value }) => {
      text.set(key(tabId), value);
    },
    setBadgeBackgroundColor: ({ tabId, color: value }) => {
      color.set(key(tabId), value);
    },
    setTitle: ({ tabId, title: value }) => {
      title.set(key(tabId), value);
    },
  };
}

const SETTINGS = DEFAULT_BROWSING;

describe('resolveBadge', () => {
  it('an unread alert outranks the score', () => {
    const paint = resolveBadge({ unreadAlerts: 2, composite: 75, settings: SETTINGS });
    expect(paint).toMatchObject({ kind: 'alerts', text: '!2' });
  });

  it('falls back to the score once the alerts are read', () => {
    const paint = resolveBadge({ unreadAlerts: 0, composite: 75, settings: SETTINGS });
    expect(paint).toMatchObject({ kind: 'score', text: '75' });
  });

  it('each half can be switched off on its own', () => {
    expect(
      resolveBadge({ unreadAlerts: 3, composite: 75, settings: { ...SETTINGS, alertBadge: false } }),
    ).toMatchObject({ kind: 'score', text: '75' });
    expect(
      resolveBadge({ unreadAlerts: 0, composite: 75, settings: { ...SETTINGS, scoreBadge: false } }),
    ).toMatchObject({ kind: 'none' });
  });

  it('paints nothing when there is no score yet', () => {
    expect(resolveBadge({ unreadAlerts: 0, composite: null, settings: SETTINGS })).toMatchObject({ kind: 'none' });
  });

  it('a score of 0 is a score, not "no score"', () => {
    expect(resolveBadge({ unreadAlerts: 0, composite: 0, settings: SETTINGS })).toMatchObject({
      kind: 'score',
      text: '0',
    });
  });

  it('alert and score texts stay distinguishable without colour', () => {
    const alert = resolveBadge({ unreadAlerts: 8, composite: null, settings: SETTINGS });
    const score = resolveBadge({ unreadAlerts: 0, composite: 8, settings: SETTINGS });
    expect(alert).toMatchObject({ text: '!8' });
    expect(score).toMatchObject({ text: '8' });
    expect(alert.kind === 'alerts' && score.kind === 'score' && alert.color !== score.color).toBe(true);
  });
});

describe('alertBadgeText', () => {
  it('caps at three characters', () => {
    expect(alertBadgeText(1)).toBe('!1');
    expect(alertBadgeText(9)).toBe('!9');
    expect(alertBadgeText(10)).toBe('!9+');
    expect(alertBadgeText(240)).toBe('!9+');
  });
});

describe('painting', () => {
  it('scores are per-tab, alerts are global', async () => {
    const action = fakeAction();
    await setScoreBadge(action, 7, 75);
    await setAlertBadge(action, 2);
    expect(action.text.get('7')).toBe('75');
    expect(action.text.get('global')).toBe('!2');
  });

  it('an alert painted on a scored tab replaces all three overrides', async () => {
    const action = fakeAction();
    await setScoreBadge(action, 7, 42, 'score tooltip');
    await setAlertBadge(action, 2, 'alert tooltip', 7);
    // reverting only the text would leave "!2" wearing the score's red and its
    // "42 · L2" tooltip — the two roles have to be told apart by all three
    expect(action.text.get('7')).toBe('!2');
    expect(action.color.get('7')).toBe(ALERT_COLOR);
    expect(action.title.get('7')).toBe('alert tooltip');
  });

  it('clearing a tab REVERTS it to the global badge instead of blanking it', async () => {
    const action = fakeAction();
    await setScoreBadge(action, 7, 75);
    await clearBadge(action, 7);
    // null, not '': an empty string would hide a pending global alert on this tab
    expect(action.text.get('7')).toBeNull();
  });

  it('clearing globally empties the badge', async () => {
    const action = fakeAction();
    await setAlertBadge(action, 2);
    await clearBadge(action);
    expect(action.text.get('global')).toBe('');
  });

  it('ignores an invalid tab id rather than throwing at the caller', async () => {
    const action = fakeAction();
    await setScoreBadge(action, -1, 75);
    expect(action.text.size).toBe(0);
  });
});
