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

describe('dnsAid check (DoH)', () => {
  const doh = (body: unknown) => ({ [PROBE.dnsAid]: { body: JSON.stringify(body) } });
  const RECORD = { type: 64, data: '1 example.com. alpn=h2 port=443' };

  it('passes on records with a validated DNSSEC chain', () => {
    const r = run('dnsAid', doh({ Status: 0, AD: true, Answer: [RECORD] }));
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('DNSSEC validated');
    expect(r.evidence).toContain('alpn=h2');
  });

  it('fails records the resolver could not validate — the scanner does too', () => {
    const r = run('dnsAid', doh({ Status: 0, AD: false, Answer: [RECORD] }));
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('AD=false');
  });

  it('fails an empty NOERROR and names the rcode', () => {
    const r = run('dnsAid', doh({ Status: 0, AD: true, Answer: [] }));
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('rcode 0');
  });

  it('fails NXDOMAIN by name', () => {
    const r = run('dnsAid', doh({ Status: 3, AD: false }));
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('NXDOMAIN');
  });

  it('does not count a CNAME chain as SVCB records', () => {
    // the answer section carries the aliases that led to the name; counting
    // them passes a domain that publishes an alias and no SVCB at all
    const r = run('dnsAid', doh({ Status: 0, AD: true, Answer: [{ type: 5, data: 'agents.example.com.' }] }));
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('no records');
  });

  it('stays na when the resolver itself could not be reached', () => {
    // a resolver we could not ask says nothing about the site — that is not a
    // failure of the site, and scoring it as one would be inventing a defect
    expect(run('dnsAid', {}).status).toBe('na');
    expect(run('dnsAid', { [PROBE.dnsAid]: { status: 502 } }).status).toBe('na');
    expect(run('dnsAid', { [PROBE.dnsAid]: { body: 'not json' } }).status).toBe('na');
  });
});
