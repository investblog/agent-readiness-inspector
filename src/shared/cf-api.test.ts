import { describe, expect, it, vi } from 'vitest';
import type { CheckResult } from '@/checks';
import {
  type CfAgentReadiness,
  CfApiError,
  fetchScanResult,
  isValidAccountId,
  isValidToken,
  parseCurlCredentials,
  runExternalScan,
  submitScan,
  verifyToken,
} from './cf-api';
import { diffScans, normalizeCfStatus } from './diff';

const CREDS = { accountId: 'a'.repeat(32), token: 'T'.repeat(40) };

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('parseCurlCredentials', () => {
  it('extracts account id and token from the dashboard test curl', () => {
    const curl = `curl "https://api.cloudflare.com/client/v4/accounts/6b1cc51fa359c59384677a156ad32c10/tokens/verify" \\
      -H "Authorization: Bearer y3DesLcDCtEfgz54jIBb0a2xDnPa_HtoMKrHZPGK"`;
    expect(parseCurlCredentials(curl)).toEqual({
      accountId: '6b1cc51fa359c59384677a156ad32c10',
      token: 'y3DesLcDCtEfgz54jIBb0a2xDnPa_HtoMKrHZPGK',
    });
  });

  it('returns null when either part is missing', () => {
    expect(parseCurlCredentials('curl https://example.com')).toBeNull();
    expect(parseCurlCredentials('accounts/6b1cc51fa359c59384677a156ad32c10 without a bearer')).toBeNull();
  });
});

describe('credential validators', () => {
  it('accepts a 32-hex account id and a 40+ char token', () => {
    expect(isValidAccountId('6b1cc51fa359c59384677a156ad32c10')).toBe(true);
    expect(isValidAccountId('too-short')).toBe(false);
    expect(isValidToken('y3DesLcDCtEfgz54jIBb0a2xDnPa_HtoMKrHZPGK')).toBe(true);
    expect(isValidToken('short')).toBe(false);
  });
});

describe('verifyToken', () => {
  it('resolves on 200 from the user endpoint when no account id is known', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { success: true }));
    await expect(verifyToken(CREDS.token, undefined, fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith('/user/tokens/verify', CREDS.token);
  });

  it('tries the account-owned endpoint FIRST when an account id is known', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { success: true }));
    await expect(verifyToken(CREDS.token, CREDS.accountId, fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(`/accounts/${CREDS.accountId}/tokens/verify`, CREDS.token);
  });

  it('accepts a USER token even when an account id is given', async () => {
    // an account-owned endpoint answers 401 for a user token; the user endpoint
    // is what accepts it, and one 401 must not condemn the whole token
    const fetchImpl = vi.fn(async (path: string) =>
      path.startsWith('/accounts/')
        ? jsonResponse(401, { errors: [{ message: 'Invalid API Token' }] })
        : jsonResponse(200, { success: true }),
    );
    await expect(verifyToken(CREDS.token, CREDS.accountId, fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects only when BOTH endpoints refuse the token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { errors: [{ message: 'Invalid API Token' }] }));
    await expect(verifyToken(CREDS.token, CREDS.accountId, fetchImpl)).rejects.toMatchObject({
      code: 'tokenRejected',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports a rejected token distinctly from other failures, by stable code', async () => {
    await expect(verifyToken(CREDS.token, undefined, async () => jsonResponse(403))).rejects.toMatchObject({
      code: 'tokenRejected',
    });
    await expect(verifyToken(CREDS.token, undefined, async () => jsonResponse(500))).rejects.toMatchObject({
      code: 'verifyFailed',
    });
  });

  it("surfaces Cloudflare's own error text as the detail", async () => {
    await expect(
      verifyToken(CREDS.token, undefined, async () =>
        jsonResponse(403, { errors: [{ message: 'Invalid API Token' }] }),
      ),
    ).rejects.toThrow(/Invalid API Token/);
  });
});

describe('submitScan', () => {
  it('posts agentReadiness inside options and returns the uuid', async () => {
    const calls: { path: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (path: string, _token: string, init?: RequestInit) => {
      calls.push({ path, init });
      return jsonResponse(200, { uuid: 'scan-1' });
    });
    await expect(submitScan(CREDS, 'https://example.com', fetchImpl)).resolves.toBe('scan-1');
    expect(calls[0].path).toBe(`/accounts/${CREDS.accountId}/urlscanner/v2/scan`);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      url: 'https://example.com',
      options: { agentReadiness: true },
    });
  });

  it('surfaces the rate limit as its own code', async () => {
    await expect(submitScan(CREDS, 'https://e.com', async () => jsonResponse(429))).rejects.toMatchObject({
      code: 'rateLimited',
    });
  });

  it('fails loudly when no uuid comes back', async () => {
    await expect(submitScan(CREDS, 'https://e.com', async () => jsonResponse(200, {}))).rejects.toMatchObject({
      code: 'noUuid',
    });
  });

  it('accepts the standard v4 envelope {result:{uuid}} too', async () => {
    await expect(
      submitScan(CREDS, 'https://e.com', async () => jsonResponse(200, { result: { uuid: 'wrapped-1' } })),
    ).resolves.toBe('wrapped-1');
  });

  it('refuses to build a request path from a malformed stored account id', async () => {
    const called = vi.fn();
    await expect(
      submitScan({ accountId: '../../evil', token: CREDS.token }, 'https://e.com', async () => {
        called();
        return jsonResponse(200, { uuid: 'x' });
      }),
    ).rejects.toMatchObject({ code: 'submitFailed' });
    expect(called).not.toHaveBeenCalled();
  });
});

const READINESS: CfAgentReadiness = {
  level: 4,
  levelName: 'Agent-Integrated',
  checks: {
    discoverability: { robotsTxt: { status: 'pass' }, dnsAid: { status: 'pass' } },
    discovery: { mcpServerCard: { status: 'fail', message: 'missing required fields' } },
  },
};

describe('fetchScanResult', () => {
  it('polls while the scan 404s, then returns the readiness block', async () => {
    let call = 0;
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call < 3
        ? jsonResponse(404)
        : jsonResponse(200, { result: { meta: { processors: { agentReadiness: READINESS } } } });
    });
    const readiness = await fetchScanResult(CREDS, 'scan-1', { sleep, pollIntervalMs: 1 }, fetchImpl);
    expect(readiness.levelName).toBe('Agent-Integrated');
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('accepts the unwrapped payload shape too', async () => {
    const readiness = await fetchScanResult(CREDS, 'scan-1', { sleep: async () => {} }, async () =>
      jsonResponse(200, { meta: { processors: { agentReadiness: READINESS } } }),
    );
    expect(readiness.level).toBe(4);
  });

  it('times out instead of polling forever', async () => {
    await expect(
      fetchScanResult(CREDS, 'scan-1', { sleep: async () => {}, maxWaitMs: 0 }, async () => jsonResponse(404)),
    ).rejects.toThrow(/timed out/);
  });

  it('aborts when the caller cancels', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchScanResult(CREDS, 'scan-1', { signal: controller.signal }, async () => jsonResponse(200)),
    ).rejects.toThrow(/cancelled/);
  });

  it('errors when the scan finished without a readiness section', async () => {
    await expect(
      fetchScanResult(CREDS, 'scan-1', { sleep: async () => {} }, async () =>
        jsonResponse(200, { result: { meta: {} } }),
      ),
    ).rejects.toBeInstanceOf(CfApiError);
  });

  it('runExternalScan chains submit and poll', async () => {
    let submitted = false;
    const readiness = await runExternalScan(CREDS, 'https://example.com', { sleep: async () => {} }, async (path) => {
      if (path.endsWith('/scan')) {
        submitted = true;
        return jsonResponse(200, { uuid: 'u1' });
      }
      return jsonResponse(200, { result: { meta: { processors: { agentReadiness: READINESS } } } });
    });
    expect(submitted).toBe(true);
    expect(readiness.level).toBe(4);
  });
});

describe('diffScans (inside vs outside)', () => {
  function ourResult(id: string, status: CheckResult['status'], evidence = 'e'): CheckResult {
    return {
      id: id as CheckResult['id'],
      status,
      category: 'discovery',
      standard: 's',
      scored: true,
      evidence,
      fixPrompt: '',
      docUrl: 'https://d',
    };
  }

  it('maps CF neutral to our na', () => {
    expect(normalizeCfStatus('neutral')).toBe('na');
    expect(normalizeCfStatus('pass')).toBe('pass');
  });

  it('classifies matches, expected divergences and real findings', () => {
    const summary = diffScans(
      [
        ourResult('robotsTxt', 'pass'),
        ourResult('dnsAid', 'na'), // documented: we cannot probe DNS locally
        ourResult('mcpServerCard', 'pass'), // documented: we accept de-facto shapes
      ],
      READINESS,
    );
    const byId = new Map(summary.rows.map((r) => [r.id, r]));
    expect(byId.get('robotsTxt')?.kind).toBe('match');
    expect(byId.get('dnsAid')?.kind).toBe('expected');
    expect(byId.get('dnsAid')?.reasonKey).toBe('diffReasonDns');
    expect(byId.get('mcpServerCard')?.kind).toBe('expected');
    expect(summary.matches).toBe(1);
    expect(summary.expected).toBe(2);
    expect(summary.divergences).toBe(0);
  });

  it('treats the opposite direction of a documented divergence as a real finding', () => {
    // we FAIL mcpServerCard while CF fails it too would be a match; here CF
    // passes and we fail — the reverse of the documented direction
    const summary = diffScans([ourResult('mcpServerCard', 'fail')], {
      ...READINESS,
      checks: { discovery: { mcpServerCard: { status: 'pass' } } },
    });
    expect(summary.rows[0].kind).toBe('divergent');
    expect(summary.rows[0].reasonKey).toBeUndefined();
    expect(summary.divergences).toBe(1);
  });

  it('reports checks present on only one side', () => {
    const summary = diffScans([ourResult('llmsTxt', 'pass')], {
      ...READINESS,
      checks: { discovery: { authMd: { status: 'fail' } } },
    });
    const kinds = new Map(summary.rows.map((r) => [r.id, r.kind]));
    expect(kinds.get('llmsTxt')).toBe('onlyOurs');
    expect(kinds.get('authMd')).toBe('onlyTheirs');
  });

  it('carries evidence from both sides for divergent rows', () => {
    // our fail vs their pass on a check with no documented divergence
    const summary = diffScans([ourResult('robotsTxt', 'fail', 'GET /robots.txt → 404')], {
      ...READINESS,
      checks: { discoverability: { robotsTxt: { status: 'pass', message: 'robots.txt exists' } } },
    });
    const row = summary.rows[0];
    expect(row.kind).toBe('divergent');
    expect(row.ourEvidence).toBe('GET /robots.txt → 404');
    expect(row.theirMessage).toBe('robots.txt exists');
  });
});
