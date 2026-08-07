/**
 * Unified Popup / Side Panel — Agent Readiness Inspector (spec §6, RI model).
 * One entrypoint serving both modes: side panel (Chromium) and popup (Firefox).
 */

import '@/assets/css/theme.css';
import '@/assets/css/popup.css';
import { browser } from 'wxt/browser';
import type { CategoryId, CheckResult, StackId } from '@/checks';
import { repairKitFor } from '@/checks';
import { svg301Logo } from '@/shared/brand';
import { hydrate, t } from '@/shared/i18n';
import { icon, injectSprite } from '@/shared/icons';
import type { ScanResponse, ScanSuccess } from '@/shared/messaging';
import { normalizeOrigin } from '@/shared/origin';
import { storage } from '@/shared/storage';
import { getStoreInfo } from '@/shared/store-links';
import { initTheme, toggleTheme } from '@/shared/theme';

// ---- Mode & bootstrap ----

const params = new URLSearchParams(window.location.search);
if (params.has('sidepanel')) document.body.classList.add('sidepanel');
document.documentElement.lang = browser.i18n.getUILanguage?.() ?? 'en';

initTheme();
injectSprite();
hydrate();
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
  const key = el.dataset.i18nTitle;
  if (key) el.title = t(key);
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const states = {
  scanning: $('state-scanning'),
  error: $('state-error'),
  results: $('state-results'),
};

function showState(name: keyof typeof states): void {
  for (const [key, el] of Object.entries(states)) el.hidden = key !== name;
  // rescan is pointless while scanning or when there is nothing to scan
  $('rescan').hidden = name === 'scanning' || currentOrigin === null;
}

// ---- Target origin: explicit ?origin= (testability / deep links) or active tab ----

/** The tab whose score the badge belongs to (null when there is none). */
let currentTabId: number | null = null;

async function resolveTargetOrigin(): Promise<string | null> {
  // both paths go through the same validator: an origin can be persisted as a
  // storage key and later rendered as a link by the dashboard
  const explicit = params.get('origin');
  if (explicit) {
    currentTabId = null;
    return normalizeOrigin(explicit);
  }
  const tabs = await browser.tabs.query({ currentWindow: true });
  const active = tabs.find((tab) => tab.active);
  // In a real side panel the active tab is the page. When the panel is opened
  // as a tab (dev, or the Firefox sidebar showing an extension page), the
  // active "tab" is our own page — fall back to the most recently used real
  // page in the window instead of claiming nothing is scannable.
  const candidate =
    active?.url && normalizeOrigin(active.url)
      ? active
      : [...tabs]
          .filter((tab) => tab.url && normalizeOrigin(tab.url))
          .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  currentTabId = candidate?.id ?? null;
  return candidate?.url ? normalizeOrigin(candidate.url) : null;
}

// ---- Rendering ----

const CATEGORY_ORDER: CategoryId[] = [
  'discoverability',
  'contentAccessibility',
  'botAccessControl',
  'discovery',
  'commerce',
];

const STATUS_ICON = { pass: 'pass', fail: 'fail', na: 'na' } as const;

function renderCategories(scan: ScanSuccess): void {
  const row = $('categories');
  row.replaceChildren();
  for (const id of CATEGORY_ORDER) {
    if (id === 'commerce') continue; // unscored preview lives in the checklist
    const score = scan.scorecard.categories[id];
    if (!score) continue;
    const chip = document.createElement('div');
    chip.className = 'category-chip';
    // zero-innerHTML invariant: even engine-typed numbers go through textContent
    const scoreEl = document.createElement('span');
    scoreEl.className = 'category-score';
    scoreEl.textContent = String(score.score);
    const nameEl = document.createElement('span');
    nameEl.className = 'category-name';
    nameEl.textContent = t(`category_${id}`);
    const countEl = document.createElement('span');
    countEl.className = 'category-count';
    countEl.textContent = `${score.passed}/${score.applicable}`;
    chip.append(scoreEl, nameEl, countEl);
    row.append(chip);
  }
}

function checkItem(result: CheckResult, stacks: readonly StackId[]): HTMLElement {
  const item = document.createElement('details');
  item.className = `check check--${result.status}`;

  const summary = document.createElement('summary');
  const status = icon(STATUS_ICON[result.status], 16);
  status.classList.add(`status-icon--${result.status}`);
  const name = document.createElement('span');
  name.className = 'check-name';
  name.textContent = t(`check_${result.id}`);
  const chevron = icon('chevron-down', 14);
  chevron.classList.add('check-chevron');
  summary.append(status, name, chevron);
  item.append(summary);

  const body = document.createElement('div');
  body.className = 'check-body';

  const evidence = document.createElement('p');
  evidence.className = 'check-evidence';
  evidence.textContent = result.evidence;
  body.append(evidence);

  const actions = document.createElement('div');
  actions.className = 'check-actions';
  if (result.status === 'fail') {
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn--small';
    const setLabel = (iconName: 'copy' | 'pass' | 'fail', key: string): void =>
      copy.replaceChildren(icon(iconName, 14), document.createTextNode(t(key)));
    setLabel('copy', 'copyFixPrompt');
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    copy.addEventListener('click', async () => {
      clearTimeout(resetTimer);
      try {
        await navigator.clipboard.writeText(result.fixPrompt);
        setLabel('pass', 'copied');
      } catch {
        setLabel('fail', 'copyFailed'); // clipboard blocked (focus/policy) — say so
      }
      resetTimer = setTimeout(() => setLabel('copy', 'copyFixPrompt'), 1500);
    });
    actions.append(copy);
  }
  const doc = document.createElement('a');
  doc.href = result.docUrl;
  doc.target = '_blank';
  doc.rel = 'noreferrer noopener';
  doc.className = 'check-doc';
  doc.append(document.createTextNode(result.standard), icon('external', 12));
  actions.append(doc);
  body.append(actions);

  // A prompt tells an agent what to build; this is for the person — the edit,
  // where it goes on their stack, and the command that proves it landed.
  const found = result.status === 'fail' ? repairKitFor(result.id, stacks) : undefined;
  if (found) {
    const kit = document.createElement('details');
    kit.className = 'repair-kit';
    const kitSummary = document.createElement('summary');
    kitSummary.textContent = t('repairHowTo', t(`stack_${found.stack}`));
    kit.append(kitSummary);

    const requirement = document.createElement('p');
    requirement.className = 'repair-requirement';
    requirement.textContent = found.kit.requirement;
    kit.append(requirement);

    const where = document.createElement('p');
    where.className = 'repair-where';
    where.textContent = `${t('repairWhere')}: ${found.recipe.where}`;
    kit.append(where);

    const snippet = document.createElement('pre');
    snippet.className = 'repair-snippet';
    snippet.textContent = found.recipe.snippet;
    kit.append(snippet);

    if (found.recipe.caveat) {
      const caveat = document.createElement('p');
      caveat.className = 'repair-caveat';
      caveat.textContent = found.recipe.caveat;
      kit.append(caveat);
    }
    if (found.alsoDetected.length > 0) {
      const also = document.createElement('p');
      also.className = 'repair-caveat';
      also.textContent = t('repairAlso', found.alsoDetected.map((id) => t(`stack_${id}`)).join(', '));
      kit.append(also);
    }

    const verify = document.createElement('pre');
    verify.className = 'repair-snippet';
    verify.textContent = found.kit.verify;
    kit.append(verify);

    const expect = document.createElement('p');
    expect.className = 'repair-expect';
    expect.textContent = `${t('repairExpect')}: ${found.kit.expect}`;
    kit.append(expect);

    body.append(kit);
  }

  item.append(body);
  return item;
}

function renderChecklist(scan: ScanSuccess): void {
  const list = $('checklist');
  list.replaceChildren();
  for (const category of CATEGORY_ORDER) {
    const results = scan.results.filter((r) => r.category === category);
    if (results.length === 0) continue;
    const section = document.createElement('section');
    section.className = 'check-group';
    const heading = document.createElement('h2');
    heading.textContent =
      category === 'commerce' ? `${t('category_commerce')} — ${t('unscoredPreview')}` : t(`category_${category}`);
    section.append(heading);
    for (const result of results) section.append(checkItem(result, scan.stacks));
    list.append(section);
  }
}

function renderResults(scan: ScanSuccess): void {
  // levelName stays English in every locale on purpose: the level names are
  // the recognizable brand terms of the CF-comparable scale (spec §4)
  const { composite, level, levelName } = scan.scorecard;
  $('score-value').textContent = String(composite);
  const ring = $('score-ring');
  ring.style.setProperty('--score', String(composite));
  ring.dataset.band = composite >= 65 ? 'good' : composite >= 45 ? 'mid' : 'low';
  $('level-badge').textContent = `${t('level')} ${level}`;
  $('level-name').textContent = levelName;

  renderCategories(scan);
  renderChecklist(scan);

  // The panel says the page is fetched with your cookies. This is the line that
  // checks that claim instead of repeating it — shown only when it says
  // something, i.e. when a session actually changed what we saw.
  const session = $('session-note');
  if (scan.session.state === 'active') {
    session.hidden = false;
    session.textContent = `${t('sessionActive')} — ${scan.session.evidence}`;
  } else {
    session.hidden = true;
  }

  const unreached = $('unreached-note');
  if (scan.unreachedProbes.length > 0) {
    unreached.hidden = false;
    unreached.textContent = t('unreachedProbes', String(scan.unreachedProbes.length));
  } else {
    unreached.hidden = true;
  }
  $('scanned-at').textContent = t('scannedAt', new Date(scan.scannedAt).toLocaleTimeString());
  showState('results');
}

// ---- Scan flow ----

let currentOrigin: string | null = null;

async function scan(): Promise<void> {
  if (!currentOrigin) return;
  showState('scanning');
  try {
    const response = (await browser.runtime.sendMessage({
      type: 'scan',
      origin: currentOrigin,
      ...(currentTabId !== null ? { tabId: currentTabId } : {}),
    })) as ScanResponse;
    if (!response || !('ok' in response)) throw new Error('no response from background');
    if (!response.ok) throw new Error(response.error);
    renderResults(response);
  } catch (error) {
    $('error-message').textContent = error instanceof Error ? error.message : String(error);
    showState('error');
  }
}

// ---- Save-site toggle (history is recorded only for saved sites, spec M2) ----

async function renderSaveButton(): Promise<void> {
  const btn = $('save-site');
  if (!currentOrigin) {
    btn.hidden = true;
    return;
  }
  const saved = await (await storage()).isSaved(currentOrigin);
  btn.replaceChildren(icon(saved ? 'saved' : 'save', 16));
  btn.title = t(saved ? 'savedSite' : 'saveSite');
  btn.classList.toggle('icon-btn--active', saved);
  btn.hidden = false;
}

$('save-site').addEventListener('click', async () => {
  if (!currentOrigin) return;
  const store = await storage();
  if (await store.isSaved(currentOrigin)) await store.removeSite(currentOrigin);
  else await store.addSite(currentOrigin);
  await renderSaveButton();
});

// ---- Unread monitoring alerts (the panel's half of the badge, plan m3.5) ----

async function renderAlertIndicator(): Promise<void> {
  const count = await (await storage()).countUnreadAlerts();
  const btn = $('open-dashboard');
  btn.classList.toggle('icon-btn--dot', count > 0);
  // the dot is not self-explanatory: the title says what it counts
  btn.title = count > 0 ? t('badgeAlertsTitle', String(count)) : t('openDashboard');
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'alerts' in changes) void renderAlertIndicator();
});

function showUnscannable(): void {
  $('error-message').textContent = t('cannotScanPage');
  $('retry-button').hidden = true;
  $('target-origin').textContent = '';
  showState('error');
}

/**
 * Points the panel at the active tab. The side panel outlives navigation —
 * the user switches tabs and expects the report to follow, so a changed origin
 * rescans instead of leaving a stale verdict on screen. Scanning is deferred
 * while the panel is hidden: no traffic for tabs the user never looked at
 * through the panel.
 */
let pendingRescan = false;

async function syncToActiveTab(): Promise<void> {
  if (params.get('origin')) return; // deep-linked panel stays on its target
  const origin = await resolveTargetOrigin();
  if (origin === currentOrigin) return;

  currentOrigin = origin;
  await renderSaveButton(); // hides itself when there is no scannable origin
  if (!origin) {
    showUnscannable();
    return;
  }
  $('target-origin').textContent = origin.replace(/^https?:\/\//, '');
  $('retry-button').hidden = false;
  if (document.visibilityState === 'visible') await scan();
  else pendingRescan = true;
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSync(): void {
  clearTimeout(syncTimer); // debounce bursts of tab events
  syncTimer = setTimeout(() => void syncToActiveTab(), 300);
}

browser.tabs.onActivated.addListener(scheduleSync);
browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  // only navigation matters; title/favicon updates are noise
  if (changeInfo.url) scheduleSync();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (pendingRescan) {
    pendingRescan = false;
    void scan();
  } else {
    scheduleSync();
  }
});

async function bootstrap(): Promise<void> {
  currentOrigin = await resolveTargetOrigin();
  if (!currentOrigin) {
    showUnscannable();
    return;
  }
  $('target-origin').textContent = currentOrigin.replace(/^https?:\/\//, '');
  await renderSaveButton();
  await scan();
}

$('footer-brand').append(svg301Logo(14));
// Its neighbours in this footer both carry a mark (the 301.st logo, the store
// glyph); a bare word read as an unfinished link.
$('github-link').prepend(icon('github', 14));
const store = getStoreInfo();
if (store) {
  const rate = $('rate-link') as HTMLAnchorElement;
  rate.href = store.url;
  rate.textContent = `${t('rateUs')} · ${store.label}`;
  rate.hidden = false;
}

void renderAlertIndicator();
$('open-dashboard').append(icon('dashboard', 16));
$('open-dashboard').addEventListener('click', () => void browser.runtime.openOptionsPage());
$('theme-toggle').append(icon('theme', 16));
$('theme-toggle').addEventListener('click', toggleTheme);
$('rescan').append(icon('scan', 16));
$('rescan').addEventListener('click', () => void scan());
$('retry-button').addEventListener('click', () => void scan());

void bootstrap();
