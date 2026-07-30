// Commerce checks — unscored preview (spec §4): CF's live tool reports these
// as neutral on non-commerce sites, so the semantics are detected-if-present:
// present+valid → pass, absent → na, present-but-broken → fail.

import { PROBE } from './config';
import type { CheckFn } from './types';
import { classifyJsonProbe, tryParseJson } from './util';

// commerce/x402: a /.well-known/x402 manifest (emerging convention) OR a 402
// root response carrying an x402 `accepts[]` payload (semantics, not the bare
// status code — spec §3).
export const x402: CheckFn = (ctx) => {
  const outcome = classifyJsonProbe(ctx.responses.get(PROBE.x402));
  if (outcome.kind === 'json') {
    return { status: 'pass', evidence: `x402 manifest at ${PROBE.x402}` };
  }
  if (outcome.kind === 'invalid') {
    return { status: 'fail', evidence: `${PROBE.x402} exists but is not valid JSON` };
  }
  const root = ctx.responses.get(PROBE.root);
  if (root?.status === 402) {
    const payload = tryParseJson(root.body) as { accepts?: unknown } | undefined;
    if (Array.isArray(payload?.accepts)) {
      return {
        status: 'pass',
        evidence: `GET / → 402 with x402 accepts[] payload (${payload.accepts.length} option(s))`,
      };
    }
    return { status: 'fail', evidence: 'GET / → 402 but without an x402 accepts[] payload — 402 alone is not x402' };
  }
  return { status: 'na', evidence: 'no x402 manifest or 402 flow detected' };
};

// commerce/ucp: /.well-known/ucp → public JSON manifest with a `ucp` object.
export const ucp: CheckFn = (ctx) => {
  const outcome = classifyJsonProbe(ctx.responses.get(PROBE.ucp));
  switch (outcome.kind) {
    case 'absent':
      return { status: 'na', evidence: `GET ${PROBE.ucp} → ${outcome.status ?? 'no response'} — UCP not detected` };
    case 'soft404':
      return { status: 'na', evidence: `${PROBE.ucp} returns HTML under 200 — treated as absent (SPA fallback)` };
    case 'invalid':
      return { status: 'fail', evidence: `${PROBE.ucp} exists but is not valid JSON` };
    case 'json': {
      const manifest = outcome.json as { ucp?: unknown };
      if (typeof manifest.ucp !== 'object' || manifest.ucp === null) {
        return { status: 'fail', evidence: `${PROBE.ucp}: JSON lacks the "ucp" object (version/services)` };
      }
      return { status: 'pass', evidence: `UCP manifest at ${PROBE.ucp}` };
    }
  }
};

function pendingDetection(name: string): CheckFn {
  return () => ({
    status: 'na',
    evidence: `${name} has no standardized public detection yet — pending M0-5 calibration against the live tool (spec §3)`,
  });
}

// commerce/acp, ap2, mpp — no standardized well-known paths; detection
// strategy is captured from the live tool during calibration.
export const acp: CheckFn = pendingDetection('ACP (Agentic Commerce Protocol)');
export const ap2: CheckFn = pendingDetection('AP2');
export const mpp: CheckFn = pendingDetection('MPP');
