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

  it('fails when only wildcard groups exist', () => {
    const r = run('robotsTxtAiRules', { [PROBE.robotsTxt]: { body: 'User-agent: *\nDisallow: /admin' } });
    expect(r.status).toBe('fail');
  });

  it('fails on an HTML robots.txt (soft-404)', () => {
    const r = run('robotsTxtAiRules', { [PROBE.robotsTxt]: { body: '<!doctype html><html></html>' } });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('soft-404');
  });
});

describe('webBotAuth check (detected-if-present, spec §3)', () => {
  it('passes on a valid JWKS with keys', () => {
    const r = run('webBotAuth', {
      [PROBE.webBotAuthDir]: { body: JSON.stringify({ keys: [{ kty: 'OKP' }] }) },
    });
    expect(r.status).toBe('pass');
  });

  it('passes an empty keys[] as valid (site signs nothing)', () => {
    const r = run('webBotAuth', { [PROBE.webBotAuthDir]: { body: '{"keys": []}' } });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('empty keys[] is valid');
  });

  it('is na (not fail) when the directory is absent — calibration decides final semantics', () => {
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
