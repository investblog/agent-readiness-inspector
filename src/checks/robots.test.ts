import { describe, expect, it } from 'vitest';
import { runChecks } from './index';
import type { CheckContext, CheckResult, ProbeResponse } from './types';

function ctx(responses: Record<string, Partial<ProbeResponse>>): CheckContext {
  const map = new Map<string, ProbeResponse>();
  for (const [path, res] of Object.entries(responses)) {
    map.set(path, { url: `https://example.com${path}`, status: 200, headers: {}, body: '', ...res });
  }
  return { origin: 'https://example.com', responses: map };
}

function robots(responses: Record<string, Partial<ProbeResponse>>): CheckResult {
  const result = runChecks(ctx(responses)).find((r) => r.id === 'robots-txt');
  if (!result) throw new Error('robots-txt check missing from registry');
  return result;
}

describe('robots-txt check (spec §3: status code opens, body validator decides)', () => {
  it('passes on a 200 with directives, evidence counts them', () => {
    const r = robots({
      '/robots.txt': { body: 'User-agent: *\nDisallow: /admin\nSitemap: https://example.com/s.xml' },
    });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('3 directive');
  });

  it('passes an empty 200 as RFC-valid allow-all, with the nuance in evidence', () => {
    const r = robots({ '/robots.txt': { body: '  \n' } });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('allow-all');
  });

  it('fails a 404 for discoverability but records the RFC allow-all nuance', () => {
    const r = robots({ '/robots.txt': { status: 404 } });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('RFC-valid');
  });

  it('fails a 5xx with the RFC complete-disallow semantics in evidence', () => {
    const r = robots({ '/robots.txt': { status: 503 } });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('disallow');
  });

  it('fails a soft-404: HTML page served with 200 at /robots.txt', () => {
    const r = robots({ '/robots.txt': { body: '<!doctype html><html><body>Not found</body></html>' } });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('soft-404');
  });

  it('fails when the probe has no response at all', () => {
    expect(robots({}).status).toBe('fail');
  });
});
