import type { Check, CheckResult } from './types';

const DOC_URL = 'https://www.rfc-editor.org/rfc/rfc9309';
const FIX_PROMPT =
  'Add a robots.txt at the site root (RFC 9309). Include explicit user-agent blocks for AI agents ' +
  '(GPTBot, ClaudeBot, etc.) stating what they may crawl, and reference your sitemap.';

function looksLikeHtml(body: string): boolean {
  const head = body.trimStart().slice(0, 15).toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

// Discoverability: robots.txt (RFC 9309). Spec §3: the status code only opens
// the check — the verdict comes from the body validator. Error semantics are
// deliberately split: a 404 fails DISCOVERABILITY (mirroring Cloudflare) even
// though RFC 9309 treats it as a valid allow-all — evidence must say so.
export const robotsTxt: Check = (ctx): CheckResult => {
  const res = ctx.responses.get('/robots.txt');
  const base = {
    id: 'robots-txt',
    category: 'discoverability' as const,
    standard: 'RFC 9309',
    fixPrompt: FIX_PROMPT,
    docUrl: DOC_URL,
  };

  if (!res) {
    return { ...base, status: 'fail', evidence: 'GET /robots.txt → no response' };
  }
  if (res.status >= 500) {
    return {
      ...base,
      status: 'fail',
      evidence: `GET /robots.txt → ${res.status}; RFC 9309: on 5xx crawlers must assume complete disallow`,
    };
  }
  if (res.status !== 200) {
    return {
      ...base,
      status: 'fail',
      evidence:
        `GET /robots.txt → ${res.status}; RFC-valid (4xx means allow-all), ` +
        'but there is no robots.txt for agents to discover',
    };
  }
  if (looksLikeHtml(res.body)) {
    return {
      ...base,
      status: 'fail',
      evidence: `GET /robots.txt → 200, but the body is an HTML page (soft-404), not a robots file`,
    };
  }

  const directives = res.body
    .split('\n')
    .filter((line) => /^\s*(user-agent|sitemap|content-signal|allow|disallow)\s*:/i.test(line)).length;
  return {
    ...base,
    status: 'pass',
    evidence:
      directives > 0
        ? `GET /robots.txt → 200, ${directives} directive line(s)`
        : 'GET /robots.txt → 200, empty file — RFC-valid allow-all, no directives declared',
  };
};
