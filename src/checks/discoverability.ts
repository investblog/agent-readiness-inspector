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

/**
 * discoverability/dnsAid — SVCB records under `_index._agents`, over DoH.
 *
 * This was a permanent `na` on the reasoning that extensions have no DNS API.
 * True, and beside the point: DNS-over-HTTPS is an ordinary fetch, and its JSON
 * answer carries both halves of the verdict — the records, and `AD`, the
 * resolver's DNSSEC judgement. The scanner fails a site that publishes records
 * without a validated chain ("records found, but DNSSEC was not validated"), so
 * both halves are required to pass.
 *
 * Still `na` when the lookup itself could not be made: a resolver we could not
 * reach says nothing about the site.
 */
export const dnsAid: CheckFn = (ctx) => {
  const res = ctx.responses.get(PROBE.dnsAid);
  if (!res || res.status !== 200) {
    return { status: 'na', evidence: `DoH lookup unavailable (${res ? `HTTP ${res.status}` : 'no response'})` };
  }
  let answer: { Status?: number; AD?: boolean; Answer?: { data?: string }[] };
  try {
    answer = JSON.parse(res.body);
  } catch {
    return { status: 'na', evidence: 'DoH resolver returned a body that is not JSON' };
  }
  const records = Array.isArray(answer.Answer) ? answer.Answer : [];
  if (records.length === 0) {
    // NXDOMAIN (3) and an empty NOERROR both mean "not published"; naming which
    // keeps the evidence useful to someone who expects the records to be there
    const why = answer.Status === 3 ? 'NXDOMAIN' : `no SVCB answers (rcode ${answer.Status ?? '?'})`;
    return { status: 'fail', evidence: `_index._agents has no records — ${why}` };
  }
  if (answer.AD !== true) {
    return {
      status: 'fail',
      evidence: `_index._agents found (${records.length} record(s)) but the resolver did not validate DNSSEC (AD=false)`,
    };
  }
  const first = records[0]?.data ?? '';
  return { status: 'pass', evidence: `_index._agents: ${records.length} SVCB record(s), DNSSEC validated — ${first}` };
};
