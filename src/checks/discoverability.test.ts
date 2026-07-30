import { describe, expect, it } from 'vitest';
import { PROBE } from './config';
import { run } from './test-helpers';

describe('sitemap check', () => {
  it('passes when robots.txt declares a Sitemap (location-independent)', () => {
    const r = run('sitemap', {
      [PROBE.robotsTxt]: { body: 'User-agent: *\nSitemap: https://example.com/deep/map.xml' },
    });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('/deep/map.xml');
  });

  it('passes on /sitemap.xml with an XML body when robots has no directive', () => {
    const r = run('sitemap', {
      [PROBE.sitemap]: { body: '<?xml version="1.0"?><urlset></urlset>' },
    });
    expect(r.status).toBe('pass');
  });

  it('fails a 200 that is not sitemap XML (soft-404 guard)', () => {
    const r = run('sitemap', { [PROBE.sitemap]: { body: '<!doctype html><html>404</html>' } });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('soft-404');
  });

  it('fails when neither source exists', () => {
    expect(run('sitemap', { [PROBE.sitemap]: { status: 404 } }).status).toBe('fail');
    expect(run('sitemap', {}).status).toBe('fail');
  });

  it('ignores a "Sitemap:" string inside an HTML robots.txt (soft-404 guard)', () => {
    const r = run('sitemap', {
      [PROBE.robotsTxt]: { body: '<!doctype html><p>Sitemap: https://e.com/s.xml</p>' },
      [PROBE.sitemap]: { status: 404 },
    });
    expect(r.status).toBe('fail');
  });
});

describe('linkHeaders check', () => {
  it('passes on an agent-relevant rel with a valid href', () => {
    const r = run('linkHeaders', {
      [PROBE.root]: { headers: { Link: '</.well-known/api-catalog>; rel="api-catalog"' } },
    });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('api-catalog');
  });

  it('accepts relative hrefs (resolved against the origin)', () => {
    const r = run('linkHeaders', {
      [PROBE.root]: { headers: { link: '</docs>; rel=describedby' } },
    });
    expect(r.status).toBe('pass');
  });

  it('fails when only irrelevant rels are present', () => {
    const r = run('linkHeaders', {
      [PROBE.root]: { headers: { Link: '<https://example.com/style.css>; rel="preload"' } },
    });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('no agent-relevant rel');
  });

  it('fails without a Link header or without a root response', () => {
    expect(run('linkHeaders', { [PROBE.root]: {} }).status).toBe('fail');
    expect(run('linkHeaders', {}).status).toBe('fail');
  });

  it('fails when the root itself errors, even with a Link header', () => {
    const r = run('linkHeaders', {
      [PROBE.root]: { status: 500, headers: { Link: '</docs>; rel=describedby' } },
    });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('500');
  });

  it('keeps rel when a quoted title contains a comma (parser regression guard)', () => {
    const r = run('linkHeaders', {
      [PROBE.root]: { headers: { Link: '</docs>; title="Hello, world"; rel="describedby"' } },
    });
    expect(r.status).toBe('pass');
  });
});

describe('dnsAid check', () => {
  it('is always na locally, pointing at the external scan', () => {
    const r = run('dnsAid', {});
    expect(r.status).toBe('na');
    expect(r.evidence).toContain('external scan');
  });
});
