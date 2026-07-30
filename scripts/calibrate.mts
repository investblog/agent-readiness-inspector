// Calibration harness (M0-5, ROADMAP): run OUR engine on live probes of
// reference sites and compare per-check verdicts + level against the live
// isitagentready /api/scan (unofficial endpoint — CI-only calibration source
// per docs/spec-review.md decision; never shipped in the product).
//
// Usage: npx tsx scripts/calibrate.mts [--ci] [origin ...]
//   --ci: exit 1 when mismatches OUTSIDE the documented allowlist exist
// Output: console table + drift-out/calibration.md (for the CI issue body).
//
// Calibration basis (honest scope): this harness compares against /api/scan —
// the machine-readable surface. CF's web-UI is KNOWN to disagree with it on
// the L4/L5 border (spintax 79: UI L5 vs api L4 the same day); web-UI parity
// is a manual spot-check deferred to M1.5 (ROADMAP). The M1.5 gate: our score
// matches, or every divergence is EXPLAINED — the allowlist below is that
// explanation, keep it honest and minimal.

import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckResult, CheckStatus, ProbeResponse } from '../src/checks/index';
import { MATRIX, runChecks, scoreResults } from '../src/checks/index';
// @ts-expect-error plain-JS module without type declarations
import { captureOrigin } from './capture-fixtures.mjs';

const SCAN_API = 'https://isitagentready.com/api/scan';
// deliberate subset of the fixture DEFAULT_ORIGINS: github (bot-blocks scanners)
// and operator.chatgpt.com (403 root) are soft-404/edge exhibits, not
// calibration references — scanning them daily would only add flakiness
const DEFAULT_ORIGINS = ['https://spintax.net', 'https://www.cloudflare.com', 'https://vercel.com'];

/**
 * Documented, EXPECTED divergences. DIRECTIONAL: an entry absorbs a mismatch
 * only when OUR status equals `ours` — the opposite direction (e.g. our
 * mcpServerCard failing a site CF passes) is a real finding, not allowed.
 * Review this list whenever it grows — it is the "объяснённые расхождения"
 * half of the M1.5 gate.
 */
const ALLOWLIST: Record<string, { ours: CheckStatus; reason: string }> = {
  dnsAid: {
    ours: 'na',
    reason: 'we cannot probe DNS locally (na by design, spec §3); CF evaluates DNS records server-side',
  },
  webMcp: {
    ours: 'na',
    reason: 'in-page detection requires the M1 MAIN-world script; engine returns na without it (spec §3)',
  },
  mcpServerCard: {
    ours: 'pass',
    reason:
      'deliberate divergence (spec §3 tiers): we accept the de-facto mcpServers/serverInfo shapes; ' +
      'CF requires top-level name/serverInfo.name and fails its own cloudflare.com mcp.json',
  },
  a2aAgentCard: {
    ours: 'pass',
    reason:
      'deliberate divergence (spec §3): we accept the legacy /.well-known/agent.json path ' +
      '(cloudflare.com itself serves it); CF probes only the current agent-card.json path',
  },
};

interface CfCheck {
  status: string;
  message?: string;
}
interface CfScan {
  level: number;
  levelName: string;
  checks: Record<string, Record<string, CfCheck>>;
}

function normalizeCfStatus(status: string): CheckStatus | string {
  if (status === 'neutral') return 'na';
  if (status === 'pass' || status === 'fail') return status;
  return status; // unknown upstream status — surfaces as a mismatch, by design
}

async function cfScan(origin: string): Promise<CfScan> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000); // their scan renders the page — allow time, but never hang the job
  try {
    const res = await fetch(SCAN_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: origin }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`scan API → HTTP ${res.status}`);
    return (await res.json()) as CfScan;
  } finally {
    clearTimeout(timer);
  }
}

interface Mismatch {
  id: string;
  ours: string;
  theirs: string;
  allowed: boolean;
  ourEvidence: string;
  theirMessage: string;
}

async function calibrate(origin: string) {
  console.log(`\n[calibrate] ${origin}`);
  const responses = (await captureOrigin(origin)) as Record<string, ProbeResponse>;
  const ctx: CheckContext = { origin, responses: new Map(Object.entries(responses)) };
  // compare over the FULL matrix (the CF scan includes a2aAgentCard); the
  // scorecard still uses the default set — the CF-comparable scoring basis
  const allIds = MATRIX.map((m) => m.id);
  const ours: CheckResult[] = runChecks(ctx, { include: allIds });
  const ourById = new Map(ours.map((r) => [r.id as string, r]));
  const card = scoreResults(runChecks(ctx));

  const theirs = await cfScan(origin);
  const theirById = new Map<string, CfCheck>();
  for (const group of Object.values(theirs.checks)) {
    for (const [id, check] of Object.entries(group)) theirById.set(id, check);
  }

  const mismatches: Mismatch[] = [];
  const comparedIds = allIds.filter((id) => theirById.has(id));
  for (const id of comparedIds) {
    const our = ourById.get(id);
    const their = theirById.get(id);
    if (!our || !their) continue;
    const theirStatus = normalizeCfStatus(their.status);
    if (our.status !== theirStatus) {
      mismatches.push({
        id,
        ours: our.status,
        theirs: `${their.status}${theirStatus !== their.status ? ` (=${theirStatus})` : ''}`,
        allowed: ALLOWLIST[id]?.ours === our.status,
        ourEvidence: our.evidence.slice(0, 140),
        theirMessage: (their.message ?? '').slice(0, 140),
      });
    }
  }

  const ourIds = new Set(allIds as readonly string[]);
  const onlyTheirs = [...theirById.keys()].filter((id) => !ourIds.has(id));
  const onlyOurs = allIds.filter((id) => !theirById.has(id));

  return { origin, card, theirs, mismatches, onlyTheirs, onlyOurs, compared: comparedIds.length };
}

const args = process.argv.slice(2);
const ciMode = args.includes('--ci');
const origins = args.filter((a) => !a.startsWith('--'));
const targets = origins.length > 0 ? origins : DEFAULT_ORIGINS;

const reportLines: string[] = [`# Calibration report — ${new Date().toISOString()}`, ''];
let unexplained = 0;

for (const origin of targets) {
  try {
    const r = await calibrate(origin);
    const head = `## ${r.origin} — ours: composite ${r.card.composite} L${r.card.level} ${r.card.levelName}; CF /api/scan: L${r.theirs.level} ${r.theirs.levelName} (${r.compared} checks compared)`;
    console.log(head);
    reportLines.push(head, '');
    if (r.mismatches.length === 0) {
      console.log('  no per-check mismatches');
      reportLines.push('No per-check mismatches.', '');
    }
    for (const m of r.mismatches) {
      const tag = m.allowed ? 'ALLOWED ' : 'MISMATCH';
      if (!m.allowed) unexplained += 1;
      const reason = m.allowed ? ALLOWLIST[m.id].reason : '';
      const line = `  ${tag} ${m.id}: ours=${m.ours} theirs=${m.theirs}${reason ? ` — ${reason}` : ''}`;
      console.log(line);
      reportLines.push(
        `- **${tag}** \`${m.id}\`: ours \`${m.ours}\` vs theirs \`${m.theirs}\`${reason ? ` — ${reason}` : ''}`,
        `  - ours: ${m.ourEvidence}`,
        `  - theirs: ${m.theirMessage}`,
      );
    }
    if (r.onlyTheirs.length > 0) {
      reportLines.push('', `Checks only in CF scan (matrix drift?): ${r.onlyTheirs.join(', ')}`);
      console.log(`  only-theirs (drift?): ${r.onlyTheirs.join(', ')}`);
    }
    if (r.onlyOurs.length > 0) {
      reportLines.push(`Checks only in our default set: ${r.onlyOurs.join(', ')}`);
    }
    reportLines.push('');
  } catch (err) {
    const msg = `## ${origin} — CALIBRATION ERROR: ${(err as Error).message}`;
    console.error(msg);
    reportLines.push(msg, '');
    unexplained += 1;
  }
}

fs.mkdirSync(path.join(process.cwd(), 'drift-out'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'drift-out', 'calibration.md'), `${reportLines.join('\n')}\n`, 'utf8');
console.log(`\n[calibrate] report → drift-out/calibration.md; unexplained mismatches: ${unexplained}`);

if (ciMode && unexplained > 0) process.exit(1);
