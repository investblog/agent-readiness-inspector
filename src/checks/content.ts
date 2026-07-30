import { PROBE } from './config';
import type { CheckFn, ProbeResponse } from './types';
import { header, looksLikeHtml } from './util';

function servesMarkdown(res: ProbeResponse | undefined): boolean {
  if (res?.status !== 200 || looksLikeHtml(res.body)) return false;
  return (header(res, 'content-type') ?? '').toLowerCase().includes('text/markdown');
}

// contentAccessibility/markdownNegotiation (Cloudflare Markdown for Agents).
// Pass criterion mirrors the CF check: GET / with `Accept: text/markdown`
// returns text/markdown + Vary: Accept and the body is not the HTML page
// served regardless of Accept (SPA fallback). The independent `.md`-suffix
// convention (Mintlify) is probed too (spec §3 "плюс суффикс .md") but only
// enriches evidence — it does not decide the CF-comparable verdict.
export const markdownNegotiation: CheckFn = (ctx) => {
  const res = ctx.responses.get(PROBE.rootMarkdown);
  const suffixWorks = servesMarkdown(ctx.responses.get(PROBE.rootMdSuffix));
  const suffixNote = suffixWorks ? '; .md-suffix convention also serves markdown (/index.md)' : '';

  if (res?.status !== 200) {
    return {
      status: 'fail',
      evidence: `GET / (Accept: text/markdown) → ${res ? res.status : 'no response'}${suffixNote}`,
    };
  }
  const contentType = (header(res, 'content-type') ?? '').toLowerCase();
  if (!contentType.includes('text/markdown')) {
    return {
      status: 'fail',
      evidence: `GET / (Accept: text/markdown) → content-type: ${contentType || '(none)'} — markdown not negotiated${suffixNote}`,
    };
  }
  if (looksLikeHtml(res.body)) {
    return {
      status: 'fail',
      evidence: `content-type claims text/markdown but the body is HTML (SPA fallback guard)${suffixNote}`,
    };
  }
  const vary = (header(res, 'vary') ?? '').toLowerCase();
  const variesOnAccept = vary
    .split(',')
    .map((v) => v.trim())
    .some((v) => v === 'accept' || v === '*');
  if (!variesOnAccept) {
    return {
      status: 'fail',
      evidence: `markdown served but Vary lacks Accept (got: ${vary || '(none)'}) — caches will mix variants${suffixNote}`,
    };
  }
  return { status: 'pass', evidence: `GET / negotiates text/markdown with Vary: Accept${suffixNote}` };
};

const LLMS_CONTENT_TYPES = ['text/plain', 'text/markdown'];

// contentAccessibility/llmsTxt — info check, OUTSIDE the score (spec §3: CF
// dropped it from the live tool; we surface it descriptively, no myth-selling).
// Anti-false-positive is a POSITIVE list: text/plain or text/markdown (or no
// content-type at all) — a JSON blob or octet-stream at /llms.txt is not a pass.
export const llmsTxt: CheckFn = (ctx) => {
  const res = ctx.responses.get(PROBE.llmsTxt);
  if (res?.status !== 200) {
    return { status: 'fail', evidence: `GET /llms.txt → ${res ? res.status : 'no response'}` };
  }
  if (looksLikeHtml(res.body)) {
    return { status: 'fail', evidence: 'GET /llms.txt → 200 but served as HTML (soft-404 guard)' };
  }
  const contentType = (header(res, 'content-type') ?? '').toLowerCase();
  const mimeOk = contentType === '' || LLMS_CONTENT_TYPES.some((t) => contentType.startsWith(t));
  if (!mimeOk) {
    return {
      status: 'fail',
      evidence: `GET /llms.txt → 200 but content-type is ${contentType} — expected text/plain or text/markdown`,
    };
  }
  const startsWithHeading = res.body.trimStart().startsWith('# ');
  const full = ctx.responses.get(PROBE.llmsFullTxt);
  const fullNote = full && full.status === 200 && !looksLikeHtml(full.body) ? ', llms-full.txt also present' : '';
  return {
    status: 'pass',
    evidence: `GET /llms.txt → 200 (${contentType || 'no content-type'})${startsWithHeading ? '' : ', does not start with an H1 heading (convention)'}${fullNote}`,
  };
};
