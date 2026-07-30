import { describe, expect, it } from 'vitest';
import { PROBE } from './config';
import { run } from './test-helpers';

describe('contentSignals check', () => {
  it('passes and lists recognized signals', () => {
    const r = run('contentSignals', {
      [PROBE.robotsTxt]: { body: 'Content-Signal: search=yes, ai-train=no\nUser-agent: *\nAllow: /' },
    });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('search=yes');
    expect(r.evidence).toContain('ai-train=no');
  });

  it('fails when robots.txt has no Content-Signal directive', () => {
    const r = run('contentSignals', { [PROBE.robotsTxt]: { body: 'User-agent: *\nAllow: /' } });
    expect(r.status).toBe('fail');
  });

  it('fails when the directive carries no recognized signal', () => {
    const r = run('contentSignals', { [PROBE.robotsTxt]: { body: 'Content-Signal: bogus=yes' } });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('no recognized signal');
  });

  it('fails when robots.txt is missing — nothing to declare in', () => {
    expect(run('contentSignals', { [PROBE.robotsTxt]: { status: 404 } }).status).toBe('fail');
  });
});

describe('robotsTxtAiRules check', () => {
  it('passes on explicit AI-bot groups, case-insensitively, and names them', () => {
    const r = run('robotsTxtAiRules', {
      [PROBE.robotsTxt]: { body: 'User-agent: gptbot\nDisallow: /\n\nUser-Agent: ClaudeBot\nAllow: /' },
    });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('GPTBot');
    expect(r.evidence).toContain('ClaudeBot');
  });

  it('stays neutral: a full ban still passes (explicit is what counts)', () => {
    const r = run('robotsTxtAiRules', {
      [PROBE.robotsTxt]: { body: 'User-agent: GPTBot\nDisallow: /' },
    });
    expect(r.status).toBe('pass');
  });

  it('passes wildcard-only groups (calibrated: CF counts rules applying to all crawlers)', () => {
    const r = run('robotsTxtAiRules', { [PROBE.robotsTxt]: { body: 'User-agent: *\nDisallow: /admin' } });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('wildcard');
  });

  it('fails only when robots.txt has no user-agent groups at all', () => {
    const r = run('robotsTxtAiRules', { [PROBE.robotsTxt]: { body: 'Content-Signal: search=yes' } });
    expect(r.status).toBe('fail');
  });

  it('fails on an HTML robots.txt (soft-404)', () => {
    const r = run('robotsTxtAiRules', { [PROBE.robotsTxt]: { body: '<!doctype html><html></html>' } });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('soft-404');
  });
});

describe('webBotAuth check (calibrated 2026-07-30, spec §3)', () => {
  it('passes on a valid JWKS with keys', () => {
    const r = run('webBotAuth', {
      [PROBE.webBotAuthDir]: { body: JSON.stringify({ keys: [{ kty: 'OKP' }] }) },
    });
    expect(r.status).toBe('pass');
  });

  it('treats an empty keys[] as informational na (calibrated: CF neutral)', () => {
    const r = run('webBotAuth', { [PROBE.webBotAuthDir]: { body: '{"keys": []}' } });
    expect(r.status).toBe('na');
    expect(r.evidence).toContain('informational');
  });

  it('is na (not fail) when the directory is absent — informational, CF neutral', () => {
    const r = run('webBotAuth', { [PROBE.webBotAuthDir]: { status: 404 } });
    expect(r.status).toBe('na');
    expect(run('webBotAuth', {}).status).toBe('na');
  });

  it('fails the operator.chatgpt.com case: app-shell HTML under 200', () => {
    const r = run('webBotAuth', {
      [PROBE.webBotAuthDir]: { body: '<!doctype html><html>app shell</html>' },
    });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('soft-404');
  });

  it('fails invalid JSON / missing keys array', () => {
    expect(run('webBotAuth', { [PROBE.webBotAuthDir]: { body: 'not json' } }).status).toBe('fail');
    expect(run('webBotAuth', { [PROBE.webBotAuthDir]: { body: '{"foo": 1}' } }).status).toBe('fail');
  });
});
