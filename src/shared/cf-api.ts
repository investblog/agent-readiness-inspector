// Cloudflare URL Scanner client (M2-c, spec §5/§8.1) — the OFFICIAL API only.
// The unofficial isitagentready /api/scan stays a CI-calibration source and is
// never called from the product.
//
// Flow: POST .../urlscanner/v2/scan {url, options:{agentReadiness:true}} → uuid,
// then GET .../urlscanner/v2/result/{uuid} which 404s while the scan runs and
// 200s when it is done. The agent-readiness payload lives in
// meta.processors.agentReadiness — the same {category:{checkId:{status}}} shape
// the calibration harness already parses.

const API_BASE = 'https://api.cloudflare.com/client/v4';

export interface CfCredentials {
  accountId: string;
  token: string;
}

/** Per-check payload as returned by the scanner (status + evidence trail). */
export interface CfCheck {
  status: string;
  message?: string;
}

export interface CfAgentReadiness {
  level: number;
  levelName: string;
  checks: Record<string, Record<string, CfCheck>>;
}

/** Stable codes so the UI can localize; `message` stays the English detail. */
export type CfErrorCode =
  | 'tokenRejected'
  | 'verifyFailed'
  | 'rateLimited'
  | 'submitFailed'
  | 'noUuid'
  | 'resultFailed'
  | 'noReadiness'
  | 'timedOut'
  | 'cancelled';

export class CfApiError extends Error {
  constructor(
    readonly code: CfErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CfApiError';
  }
}

/** Pulls Cloudflare's own error text out of a v4 envelope, when present. */
async function cfErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { errors?: { message?: string }[] };
    const first = body.errors?.[0]?.message;
    return first ? `${first} (HTTP ${res.status})` : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Extracts credentials from a pasted "test curl" (the dashboard shows one on
 * the token page) — the 301-ui pattern. Returns null when the text isn't one.
 */
export function parseCurlCredentials(text: string): CfCredentials | null {
  const accountId = /accounts\/([a-f0-9]{32})/i.exec(text)?.[1];
  const token = /Bearer\s+([A-Za-z0-9_-]{40,})/.exec(text)?.[1];
  return accountId && token ? { accountId, token } : null;
}

export function isValidAccountId(value: string): boolean {
  return /^[a-f0-9]{32}$/i.test(value.trim());
}

export function isValidToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,}$/.test(value.trim());
}

async function cfFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** GET /user/tokens/verify — confirms the token is live before we store it. */
export async function verifyToken(token: string, fetchImpl = cfFetch): Promise<void> {
  const res = await fetchImpl('/user/tokens/verify', token);
  if (res.status === 401 || res.status === 403) {
    throw new CfApiError('tokenRejected', await cfErrorDetail(res), res.status);
  }
  if (!res.ok) throw new CfApiError('verifyFailed', await cfErrorDetail(res), res.status);
}

export interface ExternalScanOptions {
  /** Poll bounds — the scanner renders the page, so results take ~10–60s. */
  pollIntervalMs?: number;
  maxWaitMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Submits a scan and returns its uuid. */
function assertCreds(creds: CfCredentials): void {
  // defense in depth: the account id is interpolated into the request path
  if (!isValidAccountId(creds.accountId)) throw new CfApiError('submitFailed', 'stored account id is malformed');
}

export async function submitScan(creds: CfCredentials, url: string, fetchImpl = cfFetch): Promise<string> {
  assertCreds(creds);
  const res = await fetchImpl(`/accounts/${creds.accountId}/urlscanner/v2/scan`, creds.token, {
    method: 'POST',
    body: JSON.stringify({ url, options: { agentReadiness: true } }),
  });
  if (res.status === 429) throw new CfApiError('rateLimited', await cfErrorDetail(res), 429);
  if (!res.ok) throw new CfApiError('submitFailed', await cfErrorDetail(res), res.status);
  // accept both the bare payload and the standard v4 {result:{…}} envelope
  const body = (await res.json()) as { uuid?: string; result?: { uuid?: string } };
  const uuid = body.uuid ?? body.result?.uuid;
  if (!uuid) throw new CfApiError('noUuid', 'scan submit returned no uuid');
  return uuid;
}

/** Polls the result endpoint (404 = still running) and returns the readiness block. */
export async function fetchScanResult(
  creds: CfCredentials,
  uuid: string,
  options: ExternalScanOptions = {},
  fetchImpl = cfFetch,
): Promise<CfAgentReadiness> {
  assertCreds(creds);
  const { pollIntervalMs = 5_000, maxWaitMs = 120_000, signal, sleep = defaultSleep } = options;
  const deadline = Date.now() + maxWaitMs;
  const safeUuid = encodeURIComponent(uuid); // uuid comes from a remote response

  for (;;) {
    if (signal?.aborted) throw new CfApiError('cancelled', 'external scan cancelled');
    const res = await fetchImpl(`/accounts/${creds.accountId}/urlscanner/v2/result/${safeUuid}`, creds.token);
    if (res.ok) {
      const body = (await res.json()) as {
        result?: { meta?: { processors?: { agentReadiness?: CfAgentReadiness } } };
        meta?: { processors?: { agentReadiness?: CfAgentReadiness } };
      };
      // the REST envelope wraps payloads in `result`; accept both shapes
      const readiness = body.result?.meta?.processors?.agentReadiness ?? body.meta?.processors?.agentReadiness;
      if (!readiness) {
        throw new CfApiError('noReadiness', 'scan finished without an agentReadiness section');
      }
      return readiness;
    }
    if (res.status !== 404) throw new CfApiError('resultFailed', await cfErrorDetail(res), res.status);
    if (Date.now() >= deadline) throw new CfApiError('timedOut', 'external scan timed out');
    await sleep(pollIntervalMs);
  }
}

/** Convenience: submit + poll. */
export async function runExternalScan(
  creds: CfCredentials,
  url: string,
  options: ExternalScanOptions = {},
  fetchImpl = cfFetch,
): Promise<CfAgentReadiness> {
  const uuid = await submitScan(creds, url, fetchImpl);
  return fetchScanResult(creds, uuid, options, fetchImpl);
}
