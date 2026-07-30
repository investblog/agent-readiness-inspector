import { PROBE } from './config';
import type { CheckFn } from './types';
import { header, looksLikeHtml, parseLinkHeader, parseRobots } from './util';

// discoverability/sitemap. Pass: robots.txt `Sitemap:` directive (location-
// independent, the more reliable signal) OR /sitemap.xml with an XML body.
export const sitemap: CheckFn = (ctx) => {
  const robots = ctx.responses.get(PROBE.robotsTxt);
  if (robots && robots.status === 200 && !looksLikeHtml(robots.body)) {
    const declared = parseRobots(robots.body).filter((l) => l.field === 'sitemap' && l.value);
    if (declared.length > 0) {
      return {
        status: 'pass',
        evidence: `robots.txt declares Sitemap (${declared.length}): ${declared[0].value}`,
      };
    }
  }

  const res = ctx.responses.get(PROBE.sitemap);
  if (!res) return { status: 'fail', evidence: 'no Sitemap: in robots.txt and GET /sitemap.xml → no response' };
  if (res.status !== 200) {
    return { status: 'fail', evidence: `no Sitemap: in robots.txt and GET /sitemap.xml → ${res.status}` };
  }
  const head = res.body.trimStart().slice(0, 200).toLowerCase();
  const isXml = head.startsWith('<?xml') || head.includes('<urlset') || head.includes('<sitemapindex');
  if (!isXml) {
    return {
      status: 'fail',
      evidence: 'GET /sitemap.xml → 200, but the body is not sitemap XML (soft-404 guard)',
    };
  }
  return { status: 'pass', evidence: 'GET /sitemap.xml → 200, valid sitemap XML' };
};

const KNOWN_RELS = new Set(['describedby', 'alternate', 'api-catalog', 'service-doc', 'service-desc']);

// discoverability/linkHeaders (RFC 8288). Pass: a Link header on / whose rel is
// in the known agent-relevant set and whose href parses as a URL.
export const linkHeaders: CheckFn = (ctx) => {
  const res = ctx.responses.get(PROBE.root);
  if (!res) return { status: 'fail', evidence: 'GET / → no response' };
  if (res.status >= 400) {
    // consistency with the engine rule: a Link header on an error page is not
    // an advertised capability
    return { status: 'fail', evidence: `GET / → ${res.status} — root does not serve successfully` };
  }
  const link = header(res, 'link');
  if (!link) return { status: 'fail', evidence: 'GET / → no Link response header' };

  const relevant = parseLinkHeader(link).filter((e) => {
    if (!e.rels.some((r) => KNOWN_RELS.has(r))) return false;
    try {
      new URL(e.href, ctx.origin);
      return true;
    } catch {
      return false;
    }
  });
  if (relevant.length === 0) {
    return {
      status: 'fail',
      evidence: `Link header present but no agent-relevant rel (${[...KNOWN_RELS].join('/')}): ${link.slice(0, 120)}`,
    };
  }
  return {
    status: 'pass',
    evidence: `Link header with ${relevant.map((e) => e.rels.join(' ')).join(', ')}: ${relevant[0].href}`,
  };
};

// discoverability/dnsAid. DNS records are not probeable from an extension
// (no DNS API; spec §3) — always `na` locally, resolved via external scan.
export const dnsAid: CheckFn = () => ({
  status: 'na',
  evidence:
    'DNS records are not probeable from the extension — run the external scan (Cloudflare URL Scanner) to evaluate DNS-AID',
});
