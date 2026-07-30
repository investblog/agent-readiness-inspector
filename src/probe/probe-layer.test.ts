import { describe, expect, it } from 'vitest';
import { PROBE } from '@/checks';
import { credentialsFor, probeKeysFor, requestFor, runProbes } from './probe-layer';

const ORIGIN = 'https://example.com';

function fakeFetch(routes: Record<string, { status?: number; headers?: Record<string, string>; body?: string }>) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init: init ?? {} });
    const route =
      routes[new URL(url).pathname + (init?.headers ? `@${JSON.stringify(init.headers)}` : '')] ??
      routes[new URL(url).pathname];
    if (!route) throw new TypeError('network error');
    return new Response(route.body ?? '', { status: route.status ?? 200, headers: route.headers ?? {} });
  }) as typeof fetch;
  return { fn, seen };
}

describe('probeKeysFor', () => {
  it('unions probes of the default-enabled checks and skips off-by-default-only paths', () => {
    const keys = probeKeysFor();
    expect(keys).toContain(PROBE.robotsTxt);
    expect(keys).toContain(PROBE.root);
    expect(keys).toContain(PROBE.rootMarkdown);
    expect(keys).toContain(PROBE.oidcConfig);
    // a2aAgentCard is off by default and its paths are used by no other check
    expect(keys).not.toContain(PROBE.a2aAgentCard);
    expect(keys).not.toContain(PROBE.llmsTxt);
  });

  it('includes off-by-default probes when their checks are requested', () => {
    expect(probeKeysFor(['a2aAgentCard'])).toContain(PROBE.a2aAgentCard);
  });
});

describe('requestFor / credentialsFor', () => {
  it('maps the markdown probe to GET / with Accept: text/markdown', () => {
    const req = requestFor(ORIGIN, PROBE.rootMarkdown);
    expect(req.url).toBe('https://example.com/');
    expect(req.headers).toEqual({ accept: 'text/markdown' });
  });

  it('sends Accept: application/linkset+json for the api-catalog probe (RFC 9727)', () => {
    expect(requestFor(ORIGIN, PROBE.apiCatalog).headers).toEqual({ accept: 'application/linkset+json' });
  });

  it('maps plain keys to origin-joined URLs', () => {
    expect(requestFor(ORIGIN, PROBE.webBotAuthDir).url).toBe(
      'https://example.com/.well-known/http-message-signatures-directory',
    );
  });

  it('sends credentials only for the page itself (behind-login refetch), omit elsewhere', () => {
    expect(credentialsFor(PROBE.root)).toBe('include');
    expect(credentialsFor(PROBE.rootMarkdown)).toBe('include');
    expect(credentialsFor(PROBE.rootMdSuffix)).toBe('include');
    expect(credentialsFor(PROBE.robotsTxt)).toBe('omit');
    expect(credentialsFor(PROBE.mcpJsonLegacy)).toBe('omit');
  });
});

describe('runProbes', () => {
  it('collects responses with lowercased headers and records failures as unreached', async () => {
    const { fn } = fakeFetch({
      '/robots.txt': { body: 'User-agent: *', headers: { 'Content-Type': 'text/plain' } },
      // no route for sitemap → network error → unreached
    });
    const { responses, unreached } = await runProbes(ORIGIN, [PROBE.robotsTxt, PROBE.sitemap], fn);
    const robots = responses.get(PROBE.robotsTxt);
    expect(robots?.status).toBe(200);
    expect(robots?.headers['content-type']).toBe('text/plain');
    expect(responses.has(PROBE.sitemap)).toBe(false);
    expect(unreached).toEqual([PROBE.sitemap]);
  });

  it('applies the credentials policy per request', async () => {
    const { fn, seen } = fakeFetch({ '/': {}, '/robots.txt': {} });
    await runProbes(ORIGIN, [PROBE.root, PROBE.robotsTxt], fn);
    const byUrl = new Map(seen.map((s) => [s.url, s.init.credentials]));
    expect(byUrl.get('https://example.com/')).toBe('include');
    expect(byUrl.get('https://example.com/robots.txt')).toBe('omit');
  });

  it('feeds the engine end-to-end: probes → runChecks verdict', async () => {
    const { fn } = fakeFetch({
      '/robots.txt': { body: 'User-agent: *\nDisallow: /admin\nSitemap: https://example.com/s.xml' },
    });
    const { responses } = await runProbes(ORIGIN, probeKeysFor(), fn);
    const { runChecks } = await import('@/checks');
    const results = runChecks({ origin: ORIGIN, responses });
    expect(results.find((r) => r.id === 'robotsTxt')?.status).toBe('pass');
    expect(results.find((r) => r.id === 'sitemap')?.status).toBe('pass');
    expect(results.find((r) => r.id === 'agentSkills')?.status).toBe('fail');
  });

  it('negotiates markdown end-to-end: Accept-variant route → markdownNegotiation pass', async () => {
    const { fn } = fakeFetch({
      // same path, different Accept: HTML by default, markdown when negotiated
      '/': { body: '<!doctype html><html>page</html>', headers: { 'content-type': 'text/html' } },
      [`/@${JSON.stringify({ accept: 'text/markdown' })}`]: {
        body: '# Page\n\nAs markdown.',
        headers: { 'content-type': 'text/markdown; charset=utf-8', vary: 'Accept' },
      },
    });
    const { responses } = await runProbes(ORIGIN, probeKeysFor(), fn);
    expect(responses.get(PROBE.rootMarkdown)?.headers['content-type']).toContain('text/markdown');
    const { runChecks } = await import('@/checks');
    const results = runChecks({ origin: ORIGIN, responses });
    expect(results.find((r) => r.id === 'markdownNegotiation')?.status).toBe('pass');
  });

  it('records finalUrl and redirected for evidence honesty', async () => {
    // Response.url is read-only empty when constructed in tests — stub the shape
    const stub = (async () => ({
      status: 200,
      url: 'https://sso.example.net/login',
      redirected: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<!doctype html>',
    })) as unknown as typeof fetch;
    const { responses } = await runProbes(ORIGIN, [PROBE.root], stub);
    const root = responses.get(PROBE.root);
    expect(root?.finalUrl).toBe('https://sso.example.net/login');
    expect(root?.redirected).toBe(true);
  });
});
