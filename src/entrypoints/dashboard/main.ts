/**
 * Dashboard — saved sites, page-orchestrated batch scans, score history
 * (spec §6, plan m2-dashboard.md M2-b). The page is a living tab: it sends
 * one scan message per origin (concurrency 2, politeness stagger), so every
 * scan is its own SW event — no service-worker lifetime tricks needed.
 */

import '@/assets/css/theme.css';
import '@/assets/css/dashboard.css';
import { browser } from 'wxt/browser';
import type { CheckId, CheckResult } from '@/checks';
import { MATRIX } from '@/checks';
import { svg301Logo } from '@/shared/brand';
import {
  CfApiError,
  type CfCredentials,
  isValidAccountId,
  isValidToken,
  parseCurlCredentials,
  runExternalScan,
  verifyToken,
} from '@/shared/cf-api';
import { type DiffRow, diffScans } from '@/shared/diff';
import { hydrate, t } from '@/shared/i18n';
import { icon, injectSprite } from '@/shared/icons';
import type { ScanResponse } from '@/shared/messaging';
import { isSafeOrigin, normalizeOrigin } from '@/shared/origin';
import type { BrowsingSettings, ScanSnapshot, SiteMeta, WatchAlert } from '@/shared/storage';
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

/** Persisted per-site data — always re-read from storage. */
interface RowState {
  meta: SiteMeta;
  history: ScanSnapshot[];
}

/**
 * Transient per-row UI state. Kept in its OWN map on purpose: it used to live
 * on RowState, and a storage refresh silently wiped it (the external diff was
 * discarded microseconds after being computed). Storage refreshes may not
 * touch this map, so no future field can be forgotten again.
 */
interface RowUi {
  scanning?: boolean;
  error?: string;
  diff?: { rows: DiffRow[]; level: number; levelName: string; divergences: number };
  externalScanning?: boolean;
  externalError?: string;
}

const rows = new Map<string, RowState>();
const rowUi = new Map<string, RowUi>();

function ui(origin: string): RowUi {
  let state = rowUi.get(origin);
  if (!state) {
    state = {};
    rowUi.set(origin, state);
  }
  return state;
}

async function loadState(): Promise<void> {
  const store = await storage();
  const sites = await store.getSites();
  rows.clear();
  for (const [origin, meta] of Object.entries(sites)) {
    rows.set(origin, { meta, history: await store.getHistory(origin) });
  }
  for (const origin of [...rowUi.keys()]) {
    if (!rows.has(origin)) rowUi.delete(origin); // drop UI state of removed sites
  }
}

function renderRow(origin: string, state: RowState, uiState: RowUi): HTMLTableRowElement {
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
  if (uiState.scanning) {
    scoreCell.append(Object.assign(document.createElement('span'), { className: 'row-spinner' }));
  } else if (uiState.error) {
    const err = document.createElement('span');
    err.className = 'row-error';
    err.title = uiState.error;
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
  // the plan's fallback surface: watch works without the notification
  // permission, so an unresolved regression must be visible here too
  if (state.meta.lastAlertSignature) {
    const badge = document.createElement('span');
    badge.className = 'regression-badge';
    badge.textContent = t('regressionBadge');
    badge.title = t('regressionBadgeTitle', state.meta.lastAlertSignature.split('|')[0] || '—');
    levelCell.append(document.createTextNode(' '), badge);
  }
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
  rescan.disabled = Boolean(uiState.scanning) || batchRunning;
  rescan.addEventListener('click', () => void scanOne(origin));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn';
  remove.title = t('removeSiteAction');
  remove.setAttribute('aria-label', `${t('removeSiteAction')} ${label}`);
  remove.append(icon('remove', 15));
  remove.disabled = batchRunning; // predictable: no removals mid-batch
  remove.addEventListener('click', () => void removeSite(origin));
  const watchBtn = document.createElement('button');
  watchBtn.type = 'button';
  watchBtn.className = 'icon-btn';
  const watched = state.meta.watch === true;
  watchBtn.title = t(watched ? 'watchOnAction' : 'watchOffAction');
  watchBtn.setAttribute('aria-label', `${watchBtn.title} ${label}`);
  watchBtn.setAttribute('aria-pressed', String(watched));
  watchBtn.append(icon(watched ? 'watchOn' : 'watchOff', 15));
  watchBtn.classList.toggle('icon-btn--active', watched);
  watchBtn.disabled = batchRunning;
  watchBtn.addEventListener('click', () => void toggleWatch(origin, !watched));

  const external = document.createElement('button');
  external.type = 'button';
  external.className = 'icon-btn';
  external.title = t('externalScanAction');
  external.setAttribute('aria-label', `${t('externalScanAction')} ${label}`);
  external.append(icon('external', 15));
  external.disabled = Boolean(uiState.externalScanning) || batchRunning || !cfCreds;
  external.hidden = !cfCreds; // only meaningful once a token is connected
  external.addEventListener('click', () => void externalScan(origin));
  actions.append(rescan, watchBtn, external, remove);
  tr.append(actions);

  return tr;
}

// ---- External scan diff row (spec §5: inside vs outside) ----

const DIFF_KIND_ICON = { match: 'pass', expected: 'na', divergent: 'warn', onlyOurs: 'na', onlyTheirs: 'na' } as const;

function diffRowElement(origin: string, uiState: RowUi): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'diff-row';
  const cell = document.createElement('td');
  cell.colSpan = 6;

  if (uiState.externalScanning) {
    cell.append(Object.assign(document.createElement('span'), { className: 'row-spinner' }));
    cell.append(document.createTextNode(` ${t('externalScanRunning')}`));
    tr.append(cell);
    return tr;
  }
  if (uiState.externalError) {
    const err = document.createElement('p');
    err.className = 'row-error';
    err.textContent = uiState.externalError;
    cell.append(err);
    tr.append(cell);
    return tr;
  }

  const diff = uiState.diff;
  if (!diff) {
    tr.append(cell);
    return tr;
  }

  const head = document.createElement('p');
  head.className = 'diff-head';
  head.textContent = t('diffSummary', diff.levelName, String(diff.level), String(diff.divergences));
  cell.append(head);

  const interesting = diff.rows.filter((r) => r.kind !== 'match');
  if (interesting.length === 0) {
    const allMatch = document.createElement('p');
    allMatch.className = 'settings-hint';
    allMatch.textContent = t('diffAllMatch');
    cell.append(allMatch);
  }
  for (const row of interesting) {
    const item = document.createElement('div');
    item.className = `diff-item diff-item--${row.kind}`;
    const status = icon(DIFF_KIND_ICON[row.kind], 14);
    status.classList.add(`diff-icon--${row.kind}`);
    const name = document.createElement('span');
    name.className = 'diff-name';
    // an id we don't know (CF added a check) must not render as a raw i18n key
    const localized = t(`check_${row.id}`);
    name.textContent = localized === `check_${row.id}` ? row.id : localized;
    const verdicts = document.createElement('span');
    verdicts.className = 'diff-verdicts';
    verdicts.textContent = t('diffVerdicts', row.ours ?? '—', row.theirs ?? '—');
    item.append(status, name, verdicts);
    if (row.reasonKey) {
      const reason = document.createElement('span');
      reason.className = 'diff-reason';
      reason.textContent = t(row.reasonKey);
      item.append(reason);
    }
    cell.append(item);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn--small';
  close.append(icon('close', 12), document.createTextNode(t('diffClose')));
  close.addEventListener('click', () => {
    const state = ui(origin);
    state.diff = undefined;
    state.externalError = undefined;
    renderTable();
  });
  cell.append(close);

  tr.append(cell);
  return tr;
}

function renderTable(): void {
  const body = $('sites-body');
  body.replaceChildren();
  const origins = [...rows.keys()].sort();
  for (const origin of origins) {
    const state = rows.get(origin);
    if (!state) continue;
    const uiState = ui(origin);
    body.append(renderRow(origin, state, uiState));
    if (uiState.diff || uiState.externalScanning || uiState.externalError) {
      body.append(diffRowElement(origin, uiState));
    }
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
      rowUi.delete(origin);
    } else {
      // storage data only — transient UI state lives in rowUi and is untouched
      rows.set(origin, { meta, history: await store.getHistory(origin) });
    }
  } catch (error) {
    console.warn('[agent-readiness] row refresh failed', error);
  }
  renderTable();
}

async function scanOne(origin: string): Promise<void> {
  const state = ui(origin);
  if (!rows.has(origin) || state.scanning) return;
  state.scanning = true;
  state.error = undefined;
  renderTable();
  try {
    const response = (await browser.runtime.sendMessage({ type: 'scan', origin })) as ScanResponse;
    if (!response || !('ok' in response)) throw new Error('no response from background');
    if (!response.ok) throw new Error(response.error);
  } catch (error) {
    ui(origin).error = error instanceof Error ? error.message : String(error);
  } finally {
    ui(origin).scanning = false;
    await refreshRow(origin);
  }
}

// ---- External scan (official URL Scanner, spec §5/§8.1) ----

/** Localized wording for CF failures; the English detail stays as the title. */
function describeCfError(error: unknown): string {
  if (error instanceof CfApiError) {
    const localized = t(`cfError_${error.code}`);
    return localized === `cfError_${error.code}` ? error.message : `${localized} (${error.message})`;
  }
  return error instanceof Error ? error.message : String(error);
}

let cfCreds: CfCredentials | null = null;
/** Free tier allows one scan per 10s — serialize and space submissions. */
const EXTERNAL_MIN_INTERVAL_MS = 10_000;
let lastExternalScanAt = 0;
let externalQueue: Promise<unknown> = Promise.resolve();

async function externalScan(origin: string): Promise<void> {
  const state = ui(origin);
  if (!rows.has(origin) || !cfCreds || state.externalScanning) return;
  state.externalScanning = true;
  state.externalError = undefined;
  state.diff = undefined;
  renderTable();

  const task = async (): Promise<void> => {
    const creds = cfCreds;
    if (!creds || !rows.has(origin)) return;
    try {
      const wait = lastExternalScanAt + EXTERNAL_MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastExternalScanAt = Date.now();

      const readiness = await runExternalScan(creds, origin);
      // compare against a fresh local run over the FULL matrix (same basis as
      // scripts/calibrate.mts) so off-by-default checks CF reports are compared
      // rather than surfacing as "only theirs"
      const response = (await browser.runtime.sendMessage({
        type: 'scan',
        origin,
        include: MATRIX.map((m) => m.id),
      })) as { ok: true; results: CheckResult[] } | { ok: false; error: string };
      if (!response.ok) throw new Error(response.error);
      const summary = diffScans(response.results, readiness);
      ui(origin).diff = {
        rows: summary.rows,
        level: readiness.level,
        levelName: readiness.levelName,
        divergences: summary.divergences,
      };
    } catch (error) {
      ui(origin).externalError = describeCfError(error);
    } finally {
      ui(origin).externalScanning = false;
      await refreshRow(origin);
    }
  };
  // run on both settle paths so one failure can never poison the chain
  // (same guard as StorageLayer.enqueue)
  const next = externalQueue.then(task, task);
  externalQueue = next.catch(() => {});
  await next;
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
  rowUi.delete(origin);
  renderTable();
  await renderAlerts(); // storage dropped this site's alerts with it
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

// ---- Watch mode (spec §7) ----

/** The background owns the alarm — ask it to re-read settings (no direct alarms call). */
async function requestReschedule(): Promise<void> {
  await browser.runtime.sendMessage({ type: 'rescheduleWatch' }).catch(() => {});
}

async function toggleWatch(origin: string, watch: boolean): Promise<void> {
  const store = await storage();
  await store.setWatch(origin, watch);
  // schedule FIRST: the permission prompt is a modal that blocks this handler
  // until the user answers, and watching must not depend on that answer
  await requestReschedule();
  await refreshRow(origin);
  setToolbarNote(t(watch ? 'watchEnabledNote' : 'watchDisabledNote'));
  if (watch) {
    void ensureNotificationPermission().then(() => renderWatchSettings());
  }
}

/** Asks for the optional permission from this user gesture (spec §10). */
async function ensureNotificationPermission(): Promise<boolean> {
  const { notify } = await (await storage()).getWatchSettings();
  if (!notify) return false;
  if (await browser.permissions.contains({ permissions: ['notifications'] })) return true;
  try {
    return await browser.permissions.request({ permissions: ['notifications'] });
  } catch {
    return false; // must be called from a gesture; never fatal
  }
}

async function renderWatchSettings(): Promise<void> {
  const store = await storage();
  const { intervalHours, notify } = await store.getWatchSettings();
  const interval = $('watch-interval') as HTMLInputElement;
  const notifyBox = $('watch-notify') as HTMLInputElement;
  interval.value = String(intervalHours);
  notifyBox.checked = notify;

  const granted = await browser.permissions.contains({ permissions: ['notifications'] });
  const note = $('watch-permission');
  // the checkbox alone would lie: notifications need the optional permission
  note.hidden = !notify || granted;
  note.textContent = t('watchPermissionMissing');
}

// ---- Alert inbox (plan m3.5) ----

/**
 * "Read" means "shown to the user": rendering the list clears the badge. The
 * rows that were unread at that moment stay highlighted for the rest of this
 * visit — the badge is the notification, the highlight is the information, and
 * losing the second one the instant the first clears is what makes inboxes
 * feel like they swallow things.
 */
const highlighted = new Set<string>();
/** Ids waiting to be marked read — a background tab has not shown anything yet. */
const pendingRead = new Set<string>();

function alertText(alert: WatchAlert): string {
  if (alert.regressions.length > 0) {
    return t(
      'alertChecksRegressed',
      String(alert.regressions.length),
      alert.regressions.map((id) => t(`check_${id}`)).join(', '),
    );
  }
  return t('alertLevelDropped', String(Math.abs(alert.levelDelta)));
}

function alertRow(alert: WatchAlert): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'alert-row';
  li.classList.toggle('alert-row--new', highlighted.has(alert.id));

  const main = document.createElement('div');
  main.className = 'alert-main';

  const head = document.createElement('div');
  head.className = 'alert-head';
  const host = alert.origin.replace(/^https?:\/\//, '');
  if (isSafeOrigin(alert.origin)) {
    const link = document.createElement('a');
    link.href = alert.origin;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    link.className = 'site-link';
    link.textContent = host;
    head.append(link);
  } else {
    const plain = document.createElement('span');
    plain.className = 'site-link';
    plain.textContent = host;
    head.append(plain);
  }
  if (highlighted.has(alert.id)) {
    const chip = document.createElement('span');
    chip.className = 'alert-new';
    chip.textContent = t('alertsNew');
    head.append(chip);
  }
  const when = document.createElement('span');
  when.className = 'alert-time';
  when.textContent = new Date(alert.at).toLocaleString();
  head.append(when);
  main.append(head);

  const text = document.createElement('p');
  text.className = 'alert-text';
  text.textContent = alertText(alert);
  main.append(text);
  li.append(main);

  const actions = document.createElement('div');
  actions.className = 'alert-actions';
  const rescan = document.createElement('button');
  rescan.type = 'button';
  rescan.className = 'icon-btn';
  rescan.title = t('rescan');
  rescan.setAttribute('aria-label', `${t('rescan')} ${host}`);
  rescan.append(icon('scan', 15));
  // no disabled state here: this list is not re-rendered on batch progress, so
  // one would go stale, and scanOne already refuses what it cannot run
  rescan.addEventListener('click', () => void scanOne(alert.origin));
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'icon-btn';
  dismiss.title = t('alertDismiss');
  dismiss.setAttribute('aria-label', `${t('alertDismiss')} ${host}`);
  dismiss.append(icon('close', 15));
  dismiss.addEventListener('click', () => void dismissAlert(alert.id));
  actions.append(rescan, dismiss);
  li.append(actions);
  return li;
}

async function renderAlerts(): Promise<void> {
  const store = await storage();
  const alerts = (await store.getAlerts()).sort((a, b) => b.at - a.at);
  for (const alert of alerts) {
    if (alert.readAt === undefined) {
      highlighted.add(alert.id);
      pendingRead.add(alert.id);
    }
  }
  const list = $('alerts-list');
  list.replaceChildren();
  for (const alert of alerts) list.append(alertRow(alert));
  $('alerts').hidden = alerts.length === 0;
  await flushRead();
}

/**
 * Marking read is deliberately gated on the page being in front. `hasFocus`
 * on top of `visibilityState`: a dashboard parked on a second monitor is
 * "visible" to the browser while nobody is looking at it, and reading an alert
 * nobody saw is exactly the failure this gate exists to prevent.
 */
async function flushRead(): Promise<void> {
  if (document.visibilityState !== 'visible' || !document.hasFocus() || pendingRead.size === 0) return;
  const ids = [...pendingRead];
  pendingRead.clear();
  // no re-render: the rows already show their highlight, which outlives the
  // read state on purpose
  await (await storage()).markAlertsRead(ids);
}

async function dismissAlert(id: string): Promise<void> {
  highlighted.delete(id);
  pendingRead.delete(id);
  await (await storage()).dismissAlert(id);
  await renderAlerts();
}

async function clearAlerts(): Promise<void> {
  highlighted.clear();
  pendingRead.clear();
  await (await storage()).clearAlerts();
  await renderAlerts();
}

// ---- Settings: while browsing (auto-scan + badge, plan m3.5) ----

async function renderBrowsingSettings(): Promise<void> {
  const { autoScan, scoreBadge, alertBadge } = await (await storage()).getBrowsingSettings();
  ($('browse-autoscan') as HTMLInputElement).checked = autoScan;
  ($('badge-score') as HTMLInputElement).checked = scoreBadge;
  ($('badge-alerts') as HTMLInputElement).checked = alertBadge;
}

/** The background watches storage, so saving is all the notification needed. */
async function updateBrowsing(patch: Partial<BrowsingSettings>): Promise<void> {
  const store = await storage();
  await store.updateSettings({ browsing: { ...(await store.getBrowsingSettings()), ...patch } });
  setToolbarNote(t('settingsSaved'));
}

// ---- Settings: optional checks ----

/** Checks worth exposing: the off-by-default ones plus anything the user turned off. */
async function renderCheckToggles(): Promise<void> {
  const store = await storage();
  const { checkOverrides = {} } = await store.getSettings();
  const container = $('check-toggles');
  container.replaceChildren();

  const optional = MATRIX.filter((m) => !m.defaultEnabled || checkOverrides[m.id] === false);
  for (const meta of optional) {
    const label = document.createElement('label');
    label.className = 'toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checkOverrides[meta.id] ?? meta.defaultEnabled;
    input.addEventListener('change', async () => {
      const settings = await (await storage()).getSettings();
      const overrides = { ...settings.checkOverrides };
      if (input.checked === meta.defaultEnabled) delete overrides[meta.id as CheckId];
      else overrides[meta.id as CheckId] = input.checked;
      await (await storage()).updateSettings({ checkOverrides: overrides });
      setToolbarNote(t('settingsSaved'));
      await renderCheckToggles(); // list membership depends on the overrides
    });
    const text = document.createElement('span');
    text.textContent = t(`check_${meta.id}`);
    label.append(input, text);
    container.append(label);
  }
}

// ---- Settings: Cloudflare credentials ----

function setCfStatus(message: string, kind: 'ok' | 'error' | 'info' = 'info'): void {
  const el = $('cf-status');
  el.textContent = message;
  el.className = `cf-status cf-status--${kind}`;
  el.hidden = false;
}

async function loadCfCreds(): Promise<void> {
  const { cfAccountId, cfToken } = await (await storage()).getSettings();
  cfCreds = cfAccountId && cfToken ? { accountId: cfAccountId, token: cfToken } : null;
  ($('cf-account') as HTMLInputElement).value = cfAccountId ?? '';
  // leave the token field EMPTY when one is stored: pre-filling dots would make
  // the field fail validation on any later save (e.g. fixing the account id)
  const tokenInput = $('cf-token') as HTMLInputElement;
  tokenInput.value = '';
  tokenInput.placeholder = cfToken ? t('cfTokenStored') : t('cfTokenPlaceholder');
  $('cf-clear').hidden = !cfCreds;
  if (cfCreds) setCfStatus(t('cfConnected'), 'ok');
}

async function saveCfCreds(): Promise<void> {
  const accountInput = $('cf-account') as HTMLInputElement;
  const tokenInput = $('cf-token') as HTMLInputElement;

  // a pasted test-curl fills both fields at once (301-ui pattern)
  const pasted = parseCurlCredentials(`${accountInput.value}\n${tokenInput.value}`);
  if (pasted) {
    accountInput.value = pasted.accountId;
    tokenInput.value = pasted.token;
  }
  const accountId = accountInput.value.trim();
  const stored = await (await storage()).getSettings();
  // an empty field means "keep the stored token" (it is never rendered back)
  const token = tokenInput.value.trim() || stored.cfToken || '';
  if (!isValidAccountId(accountId)) return setCfStatus(t('cfInvalidAccount'), 'error');
  if (!isValidToken(token)) return setCfStatus(t('cfInvalidToken'), 'error');

  setCfStatus(t('cfVerifying'));
  try {
    await verifyToken(token);
    await (await storage()).updateSettings({ cfAccountId: accountId, cfToken: token });
    await loadCfCreds();
    setCfStatus(t('cfConnected'), 'ok');
    renderTable(); // external-scan buttons appear
  } catch (error) {
    setCfStatus(describeCfError(error), 'error');
  }
}

async function clearCfCreds(): Promise<void> {
  await (await storage()).updateSettings({ cfAccountId: undefined, cfToken: undefined });
  cfCreds = null;
  ($('cf-account') as HTMLInputElement).value = '';
  ($('cf-token') as HTMLInputElement).value = '';
  $('cf-clear').hidden = true;
  setCfStatus(t('cfCleared'), 'info');
  renderTable();
}

// ---- Wiring ----

$('theme-toggle').append(icon('theme', 16));
$('theme-toggle').addEventListener('click', toggleTheme);
$('footer-brand').append(svg301Logo(14));
$('promo-logo').append(svg301Logo(18));

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

($('watch-interval') as HTMLInputElement).addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  const hours = Math.min(168, Math.max(1, Math.round(Number(input.value) || 24)));
  input.value = String(hours);
  const store = await storage();
  await store.updateSettings({ watch: { ...(await store.getWatchSettings()), intervalHours: hours } });
  await requestReschedule();
  setToolbarNote(t('settingsSaved'));
});

($('watch-notify') as HTMLInputElement).addEventListener('change', async (event) => {
  const checked = (event.target as HTMLInputElement).checked;
  const store = await storage();
  await store.updateSettings({ watch: { ...(await store.getWatchSettings()), notify: checked } });
  if (checked) await ensureNotificationPermission();
  await renderWatchSettings();
  setToolbarNote(t('settingsSaved'));
});

$('alerts-clear').append(icon('close', 14), document.createTextNode(t('alertsClear')));
$('alerts-clear').addEventListener('click', () => void clearAlerts());
document.addEventListener('visibilitychange', () => void flushRead());
window.addEventListener('focus', () => void flushRead()); // came back to this window

($('browse-autoscan') as HTMLInputElement).addEventListener('change', (event) => {
  void updateBrowsing({ autoScan: (event.target as HTMLInputElement).checked });
});
($('badge-score') as HTMLInputElement).addEventListener('change', (event) => {
  void updateBrowsing({ scoreBadge: (event.target as HTMLInputElement).checked });
});
($('badge-alerts') as HTMLInputElement).addEventListener('change', (event) => {
  void updateBrowsing({ alertBadge: (event.target as HTMLInputElement).checked });
});

// a watch cycle can land while this page is open — show it without a reload.
// (Our own read/dismiss writes re-enter here once and then settle: everything
// is already read, so nothing new is written.)
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'alerts' in changes) void renderAlerts();
});

$('cf-save').append(document.createTextNode(t('cfSave')));
$('cf-clear').append(document.createTextNode(t('cfClear')));
($('cf-form') as HTMLFormElement).addEventListener('submit', (event) => {
  event.preventDefault();
  void saveCfCreds();
});
$('cf-clear').addEventListener('click', () => void clearCfCreds());

void (async () => {
  await loadCfCreds();
  await renderCheckToggles();
  await renderBrowsingSettings();
  await renderWatchSettings();
  await loadState();
  renderTable();
  await renderAlerts(); // after loadState: rows drive the per-alert rescan button
})();
