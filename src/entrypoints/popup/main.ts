/**
 * Unified Popup / Side Panel — Agent Readiness Inspector (spec §6, RI model).
 * One entrypoint serving both modes: side panel (Chromium) and popup (Firefox).
 */

import '@/assets/css/theme.css';
import '@/assets/css/popup.css';
import { browser } from 'wxt/browser';
import type { CategoryId, CheckResult } from '@/checks';
import { svg301Logo } from '@/shared/brand';
import { hydrate, t } from '@/shared/i18n';
import { icon, injectSprite } from '@/shared/icons';
import type { ScanResponse, ScanSuccess } from '@/shared/messaging';
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

async function resolveTargetOrigin(): Promise<string | null> {
  const explicit = params.get('origin');
  if (explicit) return explicit;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try {
    const url = new URL(tab.url);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
  } catch {
    // fall through
  }
  return null;
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

function checkItem(result: CheckResult): HTMLElement {
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
    for (const result of results) section.append(checkItem(result));
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
    const response = (await browser.runtime.sendMessage({ type: 'scan', origin: currentOrigin })) as ScanResponse;
    if (!response || !('ok' in response)) throw new Error('no response from background');
    if (!response.ok) throw new Error(response.error);
    renderResults(response);
  } catch (error) {
    $('error-message').textContent = error instanceof Error ? error.message : String(error);
    showState('error');
  }
}

async function bootstrap(): Promise<void> {
  currentOrigin = await resolveTargetOrigin();
  if (!currentOrigin) {
    $('error-message').textContent = t('cannotScanPage');
    $('retry-button').hidden = true;
    showState('error');
    return;
  }
  $('target-origin').textContent = currentOrigin.replace(/^https?:\/\//, '');
  await scan();
}

$('footer-brand').append(svg301Logo(14));
const store = getStoreInfo();
if (store) {
  const rate = $('rate-link') as HTMLAnchorElement;
  rate.href = store.url;
  rate.textContent = `${t('rateUs')} · ${store.label}`;
  rate.hidden = false;
}

$('theme-toggle').append(icon('theme', 16));
$('theme-toggle').addEventListener('click', toggleTheme);
$('rescan').append(icon('scan', 16));
$('rescan').addEventListener('click', () => void scan());
$('retry-button').addEventListener('click', () => void scan());

void bootstrap();
