import { describe, expect, it } from 'vitest';
import { PROBE } from './config';
import { run } from './test-helpers';

describe('commerce checks (unscored, detected-if-present)', () => {
  it('x402: passes on a well-known manifest', () => {
    const r = run('x402', { [PROBE.x402]: { body: '{"version": 1}' } });
    expect(r.status).toBe('pass');
    expect(r.scored).toBe(false);
  });

  it('x402: passes a 402 root with an accepts[] payload', () => {
    const r = run('x402', {
      [PROBE.root]: { status: 402, body: JSON.stringify({ accepts: [{ scheme: 'exact' }] }) },
    });
    expect(r.status).toBe('pass');
  });

  it('x402: a bare 402 without accepts[] is not x402 (spec §3: семантика, не код)', () => {
    const r = run('x402', { [PROBE.root]: { status: 402, body: 'Payment Required' } });
    expect(r.status).toBe('fail');
  });

  it('x402: na when nothing is detected', () => {
    expect(run('x402', {}).status).toBe('na');
    expect(run('x402', { [PROBE.x402]: { status: 404 }, [PROBE.root]: {} }).status).toBe('na');
  });

  it('x402: fails an invalid manifest, na on an HTML soft-404 manifest', () => {
    expect(run('x402', { [PROBE.x402]: { body: 'not json' } }).status).toBe('fail');
    expect(run('x402', { [PROBE.x402]: { body: '<!doctype html>' } }).status).toBe('na');
  });

  it('ucp: passes a manifest with the ucp object', () => {
    const r = run('ucp', {
      [PROBE.ucp]: { body: JSON.stringify({ ucp: { version: '2026-04-08', services: {} } }) },
    });
    expect(r.status).toBe('pass');
  });

  it('ucp: fails JSON without the ucp object, na when absent', () => {
    expect(run('ucp', { [PROBE.ucp]: { body: '{"foo": 1}' } }).status).toBe('fail');
    expect(run('ucp', { [PROBE.ucp]: { status: 404 } }).status).toBe('na');
    expect(run('ucp', { [PROBE.ucp]: { body: '<!doctype html>' } }).status).toBe('na');
  });

  it('acp/ap2/mpp: na pending calibration, with the reason in evidence', () => {
    for (const id of ['acp', 'ap2', 'mpp'] as const) {
      const r = run(id, {});
      expect(r.status).toBe('na');
      expect(r.evidence).toContain('calibration');
    }
  });
});
