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

// botAccessControl/robotsTxtAiRules. Pass: robots.txt has explicit user-agent
// groups addressing known AI crawlers (allow or ban — the tool is neutral, the
// check is about EXPLICIT declaration, spec branding §2).
export const robotsTxtAiRules: CheckFn = (ctx) => {
  const parsed = robotsOrFail(ctx);
  if ('verdict' in parsed) return parsed.verdict;
  const known = new Map(AI_BOT_USER_AGENTS.map((ua) => [ua.toLowerCase(), ua]));
  const addressed = new Set<string>();
  for (const line of parsed.lines) {
    if (line.field !== 'user-agent') continue;
    const hit = known.get(line.value.trim().toLowerCase());
    if (hit) addressed.add(hit);
  }
  if (addressed.size === 0) {
    return {
      status: 'fail',
      evidence: 'robots.txt has no explicit user-agent group for known AI crawlers (GPTBot, ClaudeBot, …)',
    };
  }
  return {
    status: 'pass',
    evidence: `explicit robots.txt groups for: ${[...addressed].join(', ')}`,
  };
};

// botAccessControl/webBotAuth (IETF draft). Detected-if-present (spec §3):
// valid JWKS → pass, absent → na (possibly an agent-origin-only check —
// final semantics come from M0-5 calibration), HTML-under-200 → fail.
export const webBotAuth: CheckFn = (ctx) => {
  const res = ctx.responses.get(PROBE.webBotAuthDir);
  if (res?.status !== 200) {
    return {
      status: 'na',
      evidence: `GET /.well-known/http-message-signatures-directory → ${res ? res.status : 'no response'} — not detected (not scored as fail before calibration)`,
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
  return {
    status: 'pass',
    evidence: `JWKS directory present with ${keys.length} key(s)${keys.length === 0 ? ' (empty keys[] is valid)' : ''}`,
  };
};
