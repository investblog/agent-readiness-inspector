import { AI_BOT_USER_AGENTS, PROBE } from './config';
import type { CheckFn, Verdict } from './types';
import { looksLikeHtml, parseRobots, tryParseJson } from './util';

function robotsOrFail(ctx: Parameters<CheckFn>[0]): { lines: ReturnType<typeof parseRobots> } | { verdict: Verdict } {
  const res = ctx.responses.get(PROBE.robotsTxt);
  if (res?.status !== 200) {
    return {
      verdict: {
        status: 'fail',
        evidence: `GET /robots.txt → ${res ? res.status : 'no response'} — nothing to declare in`,
      },
    };
  }
  if (looksLikeHtml(res.body)) {
    return {
      verdict: { status: 'fail', evidence: 'robots.txt is an HTML page (soft-404), directives cannot be declared' },
    };
  }
  return { lines: parseRobots(res.body) };
}

const SIGNAL_NAMES = new Set(['search', 'ai-input', 'ai-train']);

// botAccessControl/contentSignals (Content Signals Policy). Pass: a
// `Content-Signal:` directive with at least one recognized signal in robots.txt.
export const contentSignals: CheckFn = (ctx) => {
  const parsed = robotsOrFail(ctx);
  if ('verdict' in parsed) return parsed.verdict;
  const directives = parsed.lines.filter((l) => l.field === 'content-signal');
  if (directives.length === 0) {
    return { status: 'fail', evidence: 'robots.txt has no Content-Signal directive' };
  }
  const signals = directives.flatMap((d) =>
    d.value
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => SIGNAL_NAMES.has(s.split('=')[0]?.trim() ?? '')),
  );
  if (signals.length === 0) {
    return {
      status: 'fail',
      evidence: `Content-Signal directive present but no recognized signal (search/ai-input/ai-train): "${directives[0].value}"`,
    };
  }
  return { status: 'pass', evidence: `Content-Signal declared: ${signals.join(', ')}` };
};

// botAccessControl/robotsTxtAiRules. Calibrated against the live CF tool
// (M0-5): explicit AI-crawler groups pass, and wildcard groups pass too —
// CF: «wildcard rules apply to all crawlers including AI bots». Fail only when
// robots.txt has no user-agent groups at all (allow or ban — tool is neutral).
export const robotsTxtAiRules: CheckFn = (ctx) => {
  const parsed = robotsOrFail(ctx);
  if ('verdict' in parsed) return parsed.verdict;
  const known = new Map(AI_BOT_USER_AGENTS.map((ua) => [ua.toLowerCase(), ua]));
  const addressed = new Set<string>();
  let hasAnyGroup = false;
  for (const line of parsed.lines) {
    if (line.field !== 'user-agent') continue;
    hasAnyGroup = true;
    const hit = known.get(line.value.trim().toLowerCase());
    if (hit) addressed.add(hit);
  }
  if (addressed.size > 0) {
    return { status: 'pass', evidence: `explicit robots.txt groups for: ${[...addressed].join(', ')}` };
  }
  if (hasAnyGroup) {
    return {
      status: 'pass',
      evidence:
        'no AI-specific groups, but wildcard/other rules apply to all crawlers including AI bots (CF criterion)',
    };
  }
  return { status: 'fail', evidence: 'robots.txt has no user-agent groups — no rules apply to AI crawlers' };
};

// botAccessControl/webBotAuth (IETF draft). Calibrated 2026-07-30 (spec §3):
// JWKS with non-empty keys[] → pass; empty keys[] and absence → na (CF treats
// both as informational/neutral); HTML-under-200 → fail (soft-404).
export const webBotAuth: CheckFn = (ctx) => {
  const res = ctx.responses.get(PROBE.webBotAuthDir);
  if (res?.status !== 200) {
    return {
      status: 'na',
      evidence: `GET /.well-known/http-message-signatures-directory → ${res ? res.status : 'no response'} — not detected (informational, CF neutral)`,
    };
  }
  if (looksLikeHtml(res.body)) {
    return { status: 'fail', evidence: 'signatures directory returns an HTML page under 200 (soft-404)' };
  }
  const json = tryParseJson(res.body);
  const keys = (json as { keys?: unknown } | undefined)?.keys;
  if (!json || !Array.isArray(keys)) {
    return { status: 'fail', evidence: 'signatures directory is not a valid JWKS (no keys array)' };
  }
  if (keys.length === 0) {
    // calibrated (M0-5): CF treats an empty directory as informational/neutral
    return { status: 'na', evidence: 'JWKS directory present but keys[] is empty — informational only (CF criterion)' };
  }
  return { status: 'pass', evidence: `JWKS directory present with ${keys.length} key(s)` };
};
