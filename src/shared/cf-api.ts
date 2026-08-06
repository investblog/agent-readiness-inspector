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

/**
 * Confirms the token is live before we store it — against BOTH verify
 * endpoints, because Cloudflare has two kinds of token and the dashboard offers
 * both routes to get one.
 *
 * A user token (`cfut_`, or the older unprefixed form) verifies at
 * `/user/tokens/verify`. An account-owned token (`cfat_`) does not: that one
 * answers only at `/accounts/{id}/tokens/verify`, and asking the user endpoint
 * about it returns 401 "Invalid API Token" — a perfectly good token reported as
 * rejected. Observed live 2026-08-06: the same account-owned token returns 401
 * from the user path and 200 "valid and active" from the account path.
 *
 * The account path goes first because this feature needs an account id anyway,
 * and account-owned is what the URL Scanner instructions lead you to.
 */
export async function verifyToken(token: string, accountId?: string, fetchImpl = cfFetch): Promise<void> {
  const paths = accountId && isValidAccountId(accountId) ? [`/accounts/${accountId}/tokens/verify`] : [];
  paths.push('/user/tokens/verify');

  let rejected: CfApiError | undefined;
  for (const path of paths) {
    const res = await fetchImpl(path, token);
    if (res.ok) return;
    if (res.status === 401 || res.status === 403) {
      // keep the FIRST rejection: it comes from the endpoint that matches the
      // account id the user gave us, so its message is the relevant one
      rejected ??= new CfApiError('tokenRejected', await cfErrorDetail(res), res.status);
      continue; // the other kind of token may still verify elsewhere
    }
    throw new CfApiError('verifyFailed', await cfErrorDetail(res), res.status);
  }
  throw rejected ?? new CfApiError('verifyFailed', 'no verify endpoint accepted the token');
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
