/**
 * Dashboard — saved sites, page-orchestrated batch scans, score history
 * (spec §6, plan m2-dashboard.md M2-b). The page is a living tab: it sends
 * one scan message per origin (concurrency 2, politeness stagger), so every
 * scan is its own SW event — no service-worker lifetime tricks needed.
 */

import '@/assets/css/theme.css';
import '@/assets/css/dashboard.css';
import { browser } from 'wxt/browser';
import { svg301Logo } from '@/shared/brand';
import { hydrate, t } from '@/shared/i18n';
import { icon, injectSprite } from '@/shared/icons';
import type { ScanResponse } from '@/shared/messaging';
import { isSafeOrigin, normalizeOrigin } from '@/shared/origin';
import type { ScanSnapshot, SiteMeta } from '@/shared/storage';
import { storage } from '@/shared/storage';
import { initTheme, toggleTheme } from '@/shared/theme';

document.documentElement.lang = browser.i18n.getUILanguage?.() ?? 'en';
initTheme();
injectSprite();
document.title = t('dashboardTitle');
hydrate();
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
  const key = el.dataset.i18nTitle;
  if (key) el.title = t(key);
}
for (const el of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
  const key = el.dataset.i18nPlaceholder;
  if (key) el.placeholder = t(key);
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

// ---- Sparkline (single series per row; fixed 0–100 domain so rows compare) ----

const SPARK_W = 120;
const SPARK_H = 28;
/** ≥ the 4px marker radius, so the end dot never clips at 0 or 100. */
const SPARK_PAD = 4;

/** Single-series micro-chart, fixed 0–100 domain so rows compare directly.
 * A trend needs at least two points — one scan renders as "no trend yet". */
function sparkline(history: ScanSnapshot[]): SVGSVGElement | Text {
  if (history.length < 2) return document.createTextNode('—');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(SPARK_W));
  svg.setAttribute('height', String(SPARK_H));
  svg.setAttribute('role', 'img');
  svg.classList.add('spark');

  // SVG-AAM: <title> first child — it is this graphic's accessible name
  const last = history[history.length - 1];
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = t('sparkTooltip', String(history.length), String(last.composite));
  svg.append(title);

  const xFor = (i: number): number => SPARK_PAD + (i * (SPARK_W - 2 * SPARK_PAD)) / (history.length - 1);
  const yFor = (composite: number): number => SPARK_PAD + (1 - composite / 100) * (SPARK_H - 2 * SPARK_PAD);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', history.map((s, i) => `${xFor(i)},${yFor(s.composite)}`).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('stroke-linecap', 'round');
  svg.append(line);

  // the latest value is the one the eye looks for — mark it, label the rest via tooltip
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', String(xFor(history.length - 1)));
  dot.setAttribute('cy', String(yFor(last.composite)));
  dot.setAttribute('r', '4');
  dot.setAttribute('fill', 'currentColor');
  svg.append(dot);
  return svg;
}

function bandFor(composite: number): 'good' | 'mid' | 'low' {
  return composite >= 65 ? 'good' : composite >= 45 ? 'mid' : 'low';
}

// ---- Table rendering ----

interface RowState {
  meta: SiteMeta;
  history: ScanSnapshot[];
  scanning?: boolean;
  error?: string;
}

const rows = new Map<string, RowState>();

async function loadState(): Promise<void> {
  const store = await storage();
  const sites = await store.getSites();
  rows.clear();
  for (const [origin, meta] of Object.entries(sites)) {
    rows.set(origin, { meta, history: await store.getHistory(origin) });
  }
}

function renderRow(origin: string, state: RowState): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.dataset.origin = origin;

  const siteCell = document.createElement('td');
  const label = origin.replace(/^https?:\/\//, '');
  if (isSafeOrigin(origin)) {
    const link = document.createElement('a');
    link.href = origin;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    link.className = 'site-link';
    link.textContent = label;
    siteCell.append(link);
  } else {
    // never turn an unexpected stored key into a clickable extension-origin URL
    const plain = document.createElement('span');
    plain.className = 'site-link';
    plain.textContent = label;
    siteCell.append(plain);
  }
  tr.append(siteCell);

  const trendCell = document.createElement('td');
  trendCell.className = 'spark-cell';
  trendCell.append(sparkline(state.history));
  tr.append(trendCell);

  const scoreCell = document.createElement('td');
  const last = state.history.at(-1);
  if (state.scanning) {
    scoreCell.append(Object.assign(document.createElement('span'), { className: 'row-spinner' }));
  } else if (state.error) {
    const err = document.createElement('span');
    err.className = 'row-error';
    err.title = state.error;
    err.textContent = t('scanFailedShort');
    scoreCell.append(err);
  } else if (last) {
    const badge = document.createElement('span');
    badge.className = `score-badge score-badge--${bandFor(last.composite)}`;
    badge.textContent = String(last.composite);
    scoreCell.append(badge);
  } else {
    scoreCell.textContent = '—';
  }
  tr.append(scoreCell);

  const levelCell = document.createElement('td');
  levelCell.className = 'level-cell';
  levelCell.textContent = last ? `L${last.level}` : t('neverScanned');
  tr.append(levelCell);

  const lastCell = document.createElement('td');
  lastCell.className = 'last-cell';
  lastCell.textContent = state.meta.lastScanAt ? new Date(state.meta.lastScanAt).toLocaleString() : '—';
  tr.append(lastCell);

  const actions = document.createElement('td');
  actions.className = 'col-actions';
  const rescan = document.createElement('button');
  rescan.type = 'button';
  rescan.className = 'icon-btn';
  rescan.title = t('rescan');
  rescan.setAttribute('aria-label', `${t('rescan')} ${label}`); // icon-only: name it
  rescan.append(icon('scan', 15));
  rescan.disabled = Boolean(state.scanning) || batchRunning;
  rescan.addEventListener('click', () => void scanOne(origin));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn';
  remove.title = t('removeSiteAction');
  remove.setAttribute('aria-label', `${t('removeSiteAction')} ${label}`);
  remove.append(icon('remove', 15));
  remove.disabled = batchRunning; // predictable: no removals mid-batch
  remove.addEventListener('click', () => void removeSite(origin));
  actions.append(rescan, remove);
  tr.append(actions);

  return tr;
}

function renderTable(): void {
  const body = $('sites-body');
  body.replaceChildren();
  const origins = [...rows.keys()].sort();
  for (const origin of origins) {
    const state = rows.get(origin);
    if (state) body.append(renderRow(origin, state));
  }
  ($('sites-table') as HTMLElement).hidden = origins.length === 0;
  $('empty-state').hidden = origins.length > 0;
  $('scan-all').toggleAttribute('disabled', origins.length === 0 || batchRunning);
}

// ---- Scanning ----

async function refreshRow(origin: string): Promise<void> {
  try {
    const store = await storage();
    const sites = await store.getSites();
    const meta = sites[origin];
    if (!meta) {
      rows.delete(origin);
    } else {
      const previous = rows.get(origin);
      // keep transient row state: a concurrent refresh must not clear a spinner
      // and re-enable rescan mid-scan (would allow a duplicate scan)
      rows.set(origin, {
        meta,
        history: await store.getHistory(origin),
        error: previous?.error,
        scanning: previous?.scanning,
      });
    }
  } catch (error) {
    console.warn('[agent-readiness] row refresh failed', error);
  }
  renderTable();
}

async function scanOne(origin: string): Promise<void> {
  const state = rows.get(origin);
  if (!state || state.scanning) return;
  state.scanning = true;
  state.error = undefined;
  renderTable();
  try {
    const response = (await browser.runtime.sendMessage({ type: 'scan', origin })) as ScanResponse;
    if (!response || !('ok' in response)) throw new Error('no response from background');
    if (!response.ok) throw new Error(response.error);
  } catch (error) {
    const current = rows.get(origin);
    if (current) current.error = error instanceof Error ? error.message : String(error);
  } finally {
    const current = rows.get(origin);
    if (current) current.scanning = false;
    await refreshRow(origin);
  }
}

// ---- Batch (page-orchestrated: concurrency 2, politeness stagger) ----

let batchRunning = false;
let batchCancelled = false;
const BATCH_CONCURRENCY = 2;
const BATCH_STAGGER_MS = 1000;

function updateBatchUi(done: number, total: number): void {
  const progress = $('batch-progress');
  progress.hidden = !batchRunning;
  progress.textContent = t('batchProgress', String(done), String(total));
  const cancel = $('batch-cancel') as HTMLButtonElement;
  cancel.hidden = !batchRunning;
  // cancel only takes effect after the in-flight scan returns — say so
  cancel.disabled = batchCancelled;
  cancel.replaceChildren(icon('close', 14), document.createTextNode(t(batchCancelled ? 'cancelling' : 'cancel')));
  $('scan-all').hidden = batchRunning;
}

async function scanAll(): Promise<void> {
  if (batchRunning) return;
  const origins = [...rows.keys()].sort();
  if (origins.length === 0) return;
  batchRunning = true;
  batchCancelled = false;
  let done = 0;
  updateBatchUi(done, origins.length);
  renderTable();

  const queue = [...origins];
  const worker = async (): Promise<void> => {
    for (let origin = queue.shift(); origin !== undefined && !batchCancelled; origin = queue.shift()) {
      if (!rows.has(origin)) continue; // removed mid-batch — skip, don't count
      await scanOne(origin);
      done += 1;
      updateBatchUi(done, origins.length);
      if (queue.length > 0 && !batchCancelled) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_STAGGER_MS));
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, origins.length) }, worker));
  } finally {
    // a throwing worker must never leave the toolbar stuck in "scanning" state
    batchRunning = false;
    batchCancelled = false;
    updateBatchUi(done, origins.length);
    renderTable();
  }
}

// ---- Toolbar notes (transient, non-blocking) ----

let noteTimer: ReturnType<typeof setTimeout> | undefined;

function setToolbarNote(message: string): void {
  const note = $('toolbar-note');
  note.textContent = message;
  note.hidden = false;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    note.hidden = true;
  }, 5000);
}

// ---- Site management ----

async function addOrigin(origin: string): Promise<void> {
  await (await storage()).addSite(origin);
  await refreshRow(origin);
}

async function removeSite(origin: string): Promise<void> {
  await (await storage()).removeSite(origin);
  rows.delete(origin);
  renderTable();
}

async function addOpenTabs(): Promise<void> {
  const tabs = await browser.tabs.query({});
  const origins = new Set<string>();
  for (const tab of tabs) {
    const origin = tab.url ? normalizeOrigin(tab.url) : null;
    if (origin) origins.add(origin);
  }
  if (origins.size === 0) {
    // Firefox: host permissions are user-granted, so tab.url can be undefined
    setToolbarNote(t('noTabsToAdd'));
    return;
  }
  const store = await storage();
  for (const origin of origins) await store.addSite(origin);
  await loadState(); // one storage round-trip + one rebuild, not one per tab
  renderTable();
}

// ---- Wiring ----

$('theme-toggle').append(icon('theme', 16));
$('theme-toggle').addEventListener('click', toggleTheme);
$('footer-brand').append(svg301Logo(14));

$('add-button').append(icon('add', 14), document.createTextNode(t('addButton')));
$('add-tabs').append(icon('tabs', 14), document.createTextNode(t('addOpenTabs')));
$('scan-all').append(icon('scan', 14), document.createTextNode(t('scanAll')));
$('batch-cancel').append(icon('close', 14), document.createTextNode(t('cancel')));

($('add-form') as HTMLFormElement).addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('add-input') as HTMLInputElement;
  const origin = normalizeOrigin(input.value.trim());
  if (!origin) {
    input.setCustomValidity(t('invalidOrigin'));
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');
  input.value = '';
  void addOrigin(origin);
});
($('add-input') as HTMLInputElement).addEventListener('input', (event) => {
  (event.target as HTMLInputElement).setCustomValidity('');
});

$('add-tabs').addEventListener('click', () => void addOpenTabs());
$('scan-all').addEventListener('click', () => void scanAll());
$('batch-cancel').addEventListener('click', () => {
  batchCancelled = true;
});

void (async () => {
  await loadState();
  renderTable();
})();
