import { describe, expect, it } from 'vitest';
import { parseLinkHeader, parseRobots } from './util';

describe('parseLinkHeader (RFC 8288, quote-aware)', () => {
  it('parses multiple comma-separated links', () => {
    const entries = parseLinkHeader('</a>; rel="describedby", </b>; rel=alternate');
    expect(entries).toEqual([
      { href: '/a', rels: ['describedby'] },
      { href: '/b', rels: ['alternate'] },
    ]);
  });

  it('keeps rel when a comma appears inside a quoted param before rel', () => {
    const entries = parseLinkHeader('</a>; title="Hello, world"; rel="describedby"');
    expect(entries).toEqual([{ href: '/a', rels: ['describedby'] }]);
  });

  it('splits quoted rel lists into individual rels', () => {
    expect(parseLinkHeader('</a>; rel="describedby alternate"')[0].rels).toEqual(['describedby', 'alternate']);
  });

  it('survives commas inside <URL>', () => {
    const entries = parseLinkHeader('</a,b>; rel=alternate, </c>; rel=describedby');
    expect(entries.map((e) => e.href)).toEqual(['/a,b', '/c']);
  });

  it('honors only the first rel param (RFC 8288)', () => {
    expect(parseLinkHeader('</a>; rel="describedby"; rel="alternate"')[0].rels).toEqual(['describedby']);
  });

  it('returns empty rels when rel is absent', () => {
    expect(parseLinkHeader('</a>; title="x"')[0].rels).toEqual([]);
  });
});

describe('parseRobots (real-world file shapes)', () => {
  it('handles CRLF line endings — trailing \\r must not leak into values', () => {
    const lines = parseRobots('User-agent: GPTBot\r\nDisallow: /\r\nSitemap: https://e.com/s.xml\r\n');
    expect(lines).toEqual([
      { field: 'user-agent', value: 'GPTBot' },
      { field: 'disallow', value: '/' },
      { field: 'sitemap', value: 'https://e.com/s.xml' },
    ]);
  });

  it('handles a leading BOM before the first field', () => {
    const lines = parseRobots('﻿User-agent: *\nAllow: /');
    expect(lines[0]).toEqual({ field: 'user-agent', value: '*' });
  });

  it('strips comments and skips lines without a field', () => {
    const lines = parseRobots('# top comment\nUser-agent: * # inline\n\nnonsense line\n: no field');
    expect(lines).toEqual([{ field: 'user-agent', value: '*' }]);
  });
});
