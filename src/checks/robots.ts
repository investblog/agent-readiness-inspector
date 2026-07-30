import type { Check, CheckResult } from './types';

// Discoverability: robots.txt present and non-empty (RFC 9309). Spec §3 row 1.
export const robotsTxt: Check = (ctx): CheckResult => {
  const res = ctx.responses.get('/robots.txt');
  const pass = res !== undefined && res.status === 200 && res.body.trim().length > 0;
  return {
    id: 'robots-txt',
    category: 'discoverability',
    standard: 'RFC 9309',
    status: pass ? 'pass' : 'fail',
    evidence: res
      ? `GET /robots.txt → ${res.status}, ${res.body.trim().length} bytes`
      : 'GET /robots.txt → no response',
    fixPrompt:
      'Add a robots.txt at the site root (RFC 9309). Include explicit user-agent blocks for AI agents ' +
      '(GPTBot, ClaudeBot, etc.) stating what they may crawl, and reference your sitemap.',
    docUrl: 'https://www.rfc-editor.org/rfc/rfc9309',
  };
};
