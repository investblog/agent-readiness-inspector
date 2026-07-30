// Probe layer (spec §5): turns PROBE keys into real fetches from the service
// worker and hands ProbeResponses to the pure check-engine. All browser I/O for
// scanning lives here — the engine never fetches.
//
// Credentials policy (spec §10/§11): `include` ONLY for the page itself (the
// behind-login differentiator: root + markdown negotiation + .md suffix);
// `omit` for robots/sitemap/llms/well-knowns — those are public machine files
// and must be judged as agents see them.

import type { CheckId, ProbeResponse } from '@/checks';
import { checkMeta, defaultCheckIds, PROBE } from '@/checks';

const PAGE_KEYS = new Set<string>([PROBE.root, PROBE.rootMarkdown, PROBE.rootMdSuffix]);

export const PROBE_TIMEOUT_MS = 15_000; // well under the 30s fetch-kills-SW limit
const CONCURRENCY = 6;
const BODY_CAP = 512 * 1024;

/** Union of probe keys needed by the given checks (default: default-enabled set). */
export function probeKeysFor(ids: readonly CheckId[] = defaultCheckIds()): string[] {
  const keys = new Set<string>();
  for (const id of ids) {
    for (const probe of checkMeta(id).probes) keys.add(probe);
  }
  return [...keys];
}

export interface ProbeRequest {
  url: string;
  headers?: Record<string, string>;
}

/** Map a probe key to its concrete request. Special keys carry an Accept header. */
export function requestFor(origin: string, key: string): ProbeRequest {
  if (key === PROBE.rootMarkdown) {
    return { url: new URL('/', origin).toString(), headers: { accept: 'text/markdown' } };
  }
  if (key === PROBE.apiCatalog) {
    return { url: new URL(key, origin).toString(), headers: { accept: 'application/linkset+json' } };
  }
  return { url: new URL(key, origin).toString() };
}

export function credentialsFor(key: string): RequestCredentials {
  return PAGE_KEYS.has(key) ? 'include' : 'omit';
}

export interface ProbeRun {
  responses: Map<string, ProbeResponse>;
  /** Keys that produced no response (timeout / network error). */
  unreached: string[];
}

async function probeOne(origin: string, key: string, fetchFn: typeof fetch): Promise<ProbeResponse | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const { url, headers } = requestFor(origin, key);
    // Conscious sign-off (M1-a review): redirect:'follow' + include on page keys
    // mirrors what a browser navigation (and CF's external scanner) does — each
    // hop attaches its own cookies. finalUrl/redirected keep evidence honest
    // about where the body actually came from.
    const res = await fetchFn(url, {
      redirect: 'follow',
      credentials: credentialsFor(key),
      signal: ctrl.signal,
      headers,
    });
    const headerRecord: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      headerRecord[name.toLowerCase()] = value;
    });
    // Cap is post-hoc (res.text() buffers fully; length = UTF-16 units, not
    // bytes) — a bandwidth bound would need a streaming reader; acceptable for
    // M1, validators only need heads + full robots/JSON (512K > RFC 9309's 500K).
    const raw = await res.text();
    return {
      url,
      status: res.status,
      headers: headerRecord,
      body: raw.length > BODY_CAP ? raw.slice(0, BODY_CAP) : raw,
      finalUrl: res.url || url,
      redirected: res.redirected,
    };
  } catch {
    return null; // absent from the map = "no response" for the engine
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch all probes with a small concurrency pool; failures become absences. */
export async function runProbes(
  origin: string,
  keys: readonly string[] = probeKeysFor(),
  fetchFn: typeof fetch = fetch,
): Promise<ProbeRun> {
  const responses = new Map<string, ProbeResponse>();
  const unreached: string[] = [];
  const queue = [...keys];

  async function worker(): Promise<void> {
    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
      const res = await probeOne(origin, key, fetchFn);
      if (res) responses.set(key, res);
      else unreached.push(key);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, keys.length) }, worker));
  return { responses, unreached };
}
