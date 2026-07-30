import { describe, expect, it } from 'vitest';
import { runChecks } from './index';
import type { CheckContext, ProbeResponse } from './types';

function ctx(responses: Record<string, Partial<ProbeResponse>>): CheckContext {
  const map = new Map<string, ProbeResponse>();
  for (const [path, res] of Object.entries(responses)) {
    map.set(path, { url: `https://example.com${path}`, status: 200, headers: {}, body: '', ...res });
  }
  return { origin: 'https://example.com', responses: map };
}

describe('robots-txt check', () => {
  it('passes on a 200 with a non-empty body', () => {
    const results = runChecks(ctx({ '/robots.txt': { body: 'User-agent: *\nAllow: /' } }));
    const robots = results.find((r) => r.id === 'robots-txt');
    expect(robots?.status).toBe('pass');
    expect(robots?.evidence).toContain('200');
  });

  it('fails on 404', () => {
    const results = runChecks(ctx({ '/robots.txt': { status: 404 } }));
    expect(results.find((r) => r.id === 'robots-txt')?.status).toBe('fail');
  });

  it('fails when the probe has no response at all', () => {
    const results = runChecks(ctx({}));
    expect(results.find((r) => r.id === 'robots-txt')?.status).toBe('fail');
  });
});
