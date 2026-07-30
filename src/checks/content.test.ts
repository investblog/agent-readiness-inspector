import { describe, expect, it } from 'vitest';
import { PROBE } from './config';
import { run } from './test-helpers';

describe('markdownNegotiation check', () => {
  const good = {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', Vary: 'Accept' },
    body: '# Example\n\nContent as markdown.',
  };

  it('passes on text/markdown + Vary: Accept (spintax-shaped response)', () => {
    const r = run('markdownNegotiation', { [PROBE.rootMarkdown]: good });
    expect(r.status).toBe('pass');
  });

  it('fails when content-type stays HTML (negotiation ignored)', () => {
    const r = run('markdownNegotiation', {
      [PROBE.rootMarkdown]: { headers: { 'content-type': 'text/html' }, body: '<!doctype html>' },
    });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('not negotiated');
  });

  it('fails when the body is HTML despite a markdown content-type (SPA fallback)', () => {
    const r = run('markdownNegotiation', {
      [PROBE.rootMarkdown]: { ...good, body: '<!doctype html><html>same page</html>' },
    });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('SPA fallback');
  });

  it('fails when Vary lacks Accept', () => {
    const r = run('markdownNegotiation', {
      [PROBE.rootMarkdown]: { ...good, headers: { 'Content-Type': 'text/markdown', Vary: 'Accept-Encoding' } },
    });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('Vary');
  });

  it('fails on non-200 or missing probe', () => {
    expect(run('markdownNegotiation', { [PROBE.rootMarkdown]: { status: 406 } }).status).toBe('fail');
    expect(run('markdownNegotiation', {}).status).toBe('fail');
  });

  it('accepts Vary: * as varying on Accept', () => {
    const r = run('markdownNegotiation', {
      [PROBE.rootMarkdown]: { headers: { 'Content-Type': 'text/markdown', Vary: '*' }, body: '# md' },
    });
    expect(r.status).toBe('pass');
  });

  it('reports the .md-suffix convention in evidence without deciding the verdict', () => {
    const suffix = { [PROBE.rootMdSuffix]: { headers: { 'content-type': 'text/markdown' }, body: '# md' } };
    const failing = run('markdownNegotiation', {
      ...suffix,
      [PROBE.rootMarkdown]: { headers: { 'content-type': 'text/html' }, body: '<!doctype html>' },
    });
    expect(failing.status).toBe('fail'); // CF-comparable verdict: negotiation decides
    expect(failing.evidence).toContain('.md-suffix convention');
  });
});

describe('llmsTxt check (info, unscored)', () => {
  it('passes on a 200 text file, noting llms-full.txt when present', () => {
    const r = run('llmsTxt', {
      [PROBE.llmsTxt]: { headers: { 'content-type': 'text/plain' }, body: '# Example\n\n> Summary' },
      [PROBE.llmsFullTxt]: { body: '# Example full' },
    });
    expect(r.status).toBe('pass');
    expect(r.scored).toBe(false);
    expect(r.evidence).toContain('llms-full.txt also present');
  });

  it('notes the missing H1 convention without failing', () => {
    const r = run('llmsTxt', { [PROBE.llmsTxt]: { body: 'just text' } });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('H1');
  });

  it('fails an HTML soft-404 under 200', () => {
    const r = run('llmsTxt', { [PROBE.llmsTxt]: { body: '<!doctype html><html>nope</html>' } });
    expect(r.status).toBe('fail');
  });

  it('fails on 404', () => {
    expect(run('llmsTxt', { [PROBE.llmsTxt]: { status: 404 } }).status).toBe('fail');
  });

  it('fails non-text content types (positive list, not just "not HTML")', () => {
    const r = run('llmsTxt', {
      [PROBE.llmsTxt]: { headers: { 'content-type': 'application/json' }, body: '{"not": "llms"}' },
    });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('expected text/plain or text/markdown');
  });
});
