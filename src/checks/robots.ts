import { PROBE } from './config';
import type { CheckFn } from './types';

function looksLikeHtml(body: string): boolean {
  const head = body.trimStart().slice(0, 15).toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

// discoverability/robotsTxt (RFC 9309). Spec §3: the status code only opens
// the check — the verdict comes from the body validator. Error semantics are
// deliberately split: a 404 fails DISCOVERABILITY (mirroring Cloudflare) even
// though RFC 9309 treats it as a valid allow-all — evidence must say so.
export const robotsTxt: CheckFn = (ctx) => {
  const res = ctx.responses.get(PROBE.robotsTxt);

  if (!res) {
    return { status: 'fail', evidence: 'GET /robots.txt → no response' };
  }
  if (res.status >= 500) {
    return {
      status: 'fail',
      evidence: `GET /robots.txt → ${res.status}; RFC 9309: on 5xx crawlers must assume complete disallow`,
    };
  }
  if (res.status !== 200) {
    return {
      status: 'fail',
      evidence:
        `GET /robots.txt → ${res.status}; RFC-valid (4xx means allow-all), ` +
        'but there is no robots.txt for agents to discover',
    };
  }
  if (looksLikeHtml(res.body)) {
    return {
      status: 'fail',
      evidence: 'GET /robots.txt → 200, but the body is an HTML page (soft-404), not a robots file',
    };
  }

  const directives = res.body
    .split('\n')
    .filter((line) => /^\s*(user-agent|sitemap|content-signal|allow|disallow)\s*:/i.test(line)).length;
  return {
    status: 'pass',
    evidence:
      directives > 0
        ? `GET /robots.txt → 200, ${directives} directive line(s)`
        : 'GET /robots.txt → 200, empty file — RFC-valid allow-all, no directives declared',
  };
};
