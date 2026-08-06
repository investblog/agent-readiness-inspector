import { describe, expect, it } from 'vitest';
import { sessionVerdict } from './session';
import type { ProbeResponse } from './types';

function res(over: Partial<ProbeResponse> = {}): ProbeResponse {
  const url = 'https://example.com/';
  return { url, status: 200, headers: {}, body: 'x'.repeat(1000), finalUrl: url, redirected: false, ...over };
}

describe('sessionVerdict', () => {
  it('is unknown when either fetch never completed', () => {
    expect(sessionVerdict(undefined, res()).state).toBe('unknown');
    expect(sessionVerdict(res(), undefined).state).toBe('unknown');
  });

  it('is active when the status differs — the login wall case', () => {
    const v = sessionVerdict(res({ status: 200 }), res({ status: 302 }));
    expect(v.state).toBe('active');
    expect(v.evidence).toContain('302');
  });

  it('is active when only the landing URL differs', () => {
    const v = sessionVerdict(res(), res({ finalUrl: 'https://example.com/login' }));
    expect(v.state).toBe('active');
    expect(v.evidence).toContain('/login');
  });

  it('is active on a large body difference at the same status and address', () => {
    const v = sessionVerdict(res({ body: 'x'.repeat(1000) }), res({ body: 'x'.repeat(500) }));
    expect(v.state).toBe('active');
    expect(v.evidence).toContain('%');
  });

  it('ignores the small differences every dynamic page has', () => {
    // nonces, CSRF tokens, timestamps: a few percent is noise, not a session
    expect(sessionVerdict(res({ body: 'x'.repeat(1000) }), res({ body: 'x'.repeat(960) })).state).toBe('none');
  });

  it('says none — not blocked — when nothing differs', () => {
    // "blocked" would name a cause we cannot see: no session and a suppressed
    // session look identical from here, and only one of them is a defect
    const v = sessionVerdict(res(), res());
    expect(v.state).toBe('none');
    expect(v.evidence).toContain('did not depend on a session');
  });

  it('never reports a state it cannot evidence', () => {
    for (const v of [sessionVerdict(res(), res()), sessionVerdict(res(), undefined)]) {
      expect(v.evidence.length).toBeGreaterThan(0);
    }
  });
});
