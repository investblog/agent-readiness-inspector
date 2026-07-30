import { PROBE } from './config';
import type { CheckFn } from './types';
import { classifyJsonProbe, header, looksLikeHtml } from './util';

// discovery/agentSkills (Cloudflare Agent Skills Discovery RFC v0.2).
// Pass: valid JSON at the index with a non-empty skills[] where each entry has
// a name.
export const agentSkills: CheckFn = (ctx) => {
  const outcome = classifyJsonProbe(ctx.responses.get(PROBE.agentSkills));
  switch (outcome.kind) {
    case 'absent':
      return { status: 'fail', evidence: `GET ${PROBE.agentSkills} → ${outcome.status ?? 'no response'}` };
    case 'soft404':
      return { status: 'fail', evidence: 'agent-skills index returns an HTML page under 200 (soft-404)' };
    case 'invalid':
      return { status: 'fail', evidence: 'agent-skills index is not valid JSON' };
    case 'json': {
      const skills = (outcome.json as { skills?: unknown }).skills;
      if (!Array.isArray(skills) || skills.length === 0) {
        return { status: 'fail', evidence: 'agent-skills index has no non-empty skills[] array' };
      }
      const unnamed = skills.filter((s) => typeof (s as { name?: unknown })?.name !== 'string').length;
      if (unnamed > 0) {
        return { status: 'fail', evidence: `skills[] has ${unnamed} entr(ies) without a name` };
      }
      return { status: 'pass', evidence: `agent-skills index with ${skills.length} named skill(s)` };
    }
  }
};

// discovery/apiCatalog (RFC 9727). Pass: a linkset (RFC 9264) — JSON with a
// `linkset` array; a bare 200 does not count (spec §3).
export const apiCatalog: CheckFn = (ctx) => {
  const res = ctx.responses.get(PROBE.apiCatalog);
  const outcome = classifyJsonProbe(res);
  switch (outcome.kind) {
    case 'absent':
      return { status: 'fail', evidence: `GET ${PROBE.apiCatalog} → ${outcome.status ?? 'no response'}` };
    case 'soft404':
      return { status: 'fail', evidence: 'api-catalog returns an HTML page under 200 (soft-404)' };
    case 'invalid':
      return { status: 'fail', evidence: 'api-catalog is not valid JSON (linkset required)' };
    case 'json': {
      const linkset = (outcome.json as { linkset?: unknown }).linkset;
      if (!Array.isArray(linkset)) {
        return { status: 'fail', evidence: 'api-catalog JSON has no linkset array (RFC 9264)' };
      }
      const contentType = res ? (header(res, 'content-type') ?? '').toLowerCase() : '';
      const typeNote = contentType.includes('application/linkset+json')
        ? ''
        : ` (content-type is ${contentType || '(none)'}, application/linkset+json expected)`;
      return { status: 'pass', evidence: `api-catalog linkset with ${linkset.length} entr(ies)${typeNote}` };
    }
  }
};

// discovery/authMd (Cloudflare convention; exact path pending M0-5 calibration —
// spec §3). Pass: a markdown document describing auth at the probed path.
export const authMd: CheckFn = (ctx) => {
  const res = ctx.responses.get(PROBE.authMd);
  if (res?.status !== 200) {
    return { status: 'fail', evidence: `GET ${PROBE.authMd} → ${res ? res.status : 'no response'}` };
  }
  if (looksLikeHtml(res.body)) {
    return { status: 'fail', evidence: 'auth.md returns an HTML page under 200 (soft-404)' };
  }
  const bytes = res.body.trim().length;
  if (bytes === 0) {
    // engine rule: only a body validator passes a check — an empty 200 is not a doc
    return { status: 'fail', evidence: `GET ${PROBE.authMd} → 200 but the body is empty` };
  }
  return { status: 'pass', evidence: `GET ${PROBE.authMd} → 200, ${bytes} bytes of markdown` };
};

// discovery/a2aAgentCard (off by default, как у CF). Pass: valid JSON agent
// card with identifying fields at the current or legacy well-known path.
export const a2aAgentCard: CheckFn = (ctx) => {
  // symmetric with mcpServerCard: soft404 = SPA fallback = absent for this
  // path, keep trying the legacy path; invalid JSON is recorded but does not
  // abort the fallback either
  const attempts: string[] = [];
  let softFail: string | undefined;
  for (const probe of [PROBE.a2aAgentCard, PROBE.a2aAgentCardLegacy]) {
    const outcome = classifyJsonProbe(ctx.responses.get(probe));
    if (outcome.kind === 'json') {
      const card = outcome.json as { name?: unknown; url?: unknown };
      if (typeof card.name !== 'string' || typeof card.url !== 'string') {
        softFail ??= `${probe}: JSON lacks agent-card identifying fields (name + url)`;
        continue;
      }
      return { status: 'pass', evidence: `agent card at ${probe}: ${card.name}` };
    }
    if (outcome.kind === 'soft404') attempts.push(`${probe} → HTML under 200 (soft-404/SPA fallback)`);
    else if (outcome.kind === 'invalid') softFail ??= `${probe} is not valid JSON`;
    else attempts.push(`${probe} → ${outcome.status ?? 'no response'}`);
  }
  return { status: 'fail', evidence: softFail ?? attempts.join('; ') };
};

const MCP_TIERS: readonly { probe: string; tier: string }[] = [
  { probe: PROBE.mcpServerCard, tier: 'draft-canonical (SEP-2127 v2)' },
  { probe: PROBE.mcpServerIetf, tier: 'draft-canonical (IETF mcp-discovery-uri)' },
  { probe: PROBE.mcpServerCardJson, tier: 'CF-scored (blog path)' },
  { probe: PROBE.mcpServerCardsJson, tier: 'CF-scored (plural path)' },
  { probe: PROBE.mcpJsonLegacy, tier: 'de-facto legacy' },
];

function isMcpEntry(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.name === 'string' ||
    typeof entry.url === 'string' ||
    typeof entry.command === 'string' ||
    (entry.transport !== null && typeof entry.transport === 'object')
  );
}

function isMcpCard(json: unknown): boolean {
  const card = json as Record<string, unknown>;
  // third real-world shape (cloudflare.com fixture): a client-config-style
  // { mcpServers: { key: {...} } } map — identity lives inside the entries,
  // so at least one entry must actually carry identity/endpoint fields
  // (spec §3: «идентифицирующие поля», not any non-empty object)
  if (card.mcpServers !== null && typeof card.mcpServers === 'object' && !Array.isArray(card.mcpServers)) {
    if (Object.values(card.mcpServers as object).some(isMcpEntry)) return true;
  }
  const hasIdentity = typeof card.name === 'string' || typeof card.title === 'string';
  const hasEndpoint =
    typeof card.url === 'string' ||
    typeof card.endpoint === 'string' ||
    Array.isArray(card.servers) ||
    (card.remotes !== null && typeof card.remotes === 'object');
  return hasIdentity && hasEndpoint;
}

// discovery/mcpServerCard — tiered strategy, no single "correct" path (spec §3):
// pass on the first valid card, evidence names the tier and path.
export const mcpServerCard: CheckFn = (ctx) => {
  let softFail: string | undefined;
  const soft404s: string[] = [];
  for (const { probe, tier } of MCP_TIERS) {
    const outcome = classifyJsonProbe(ctx.responses.get(probe));
    if (outcome.kind === 'json') {
      if (isMcpCard(outcome.json)) {
        return { status: 'pass', evidence: `MCP server card at ${probe} [${tier}]` };
      }
      softFail ??= `${probe}: JSON lacks card identity/endpoint fields`;
    } else if (outcome.kind === 'invalid') {
      softFail ??= `${probe}: not valid JSON`;
    } else if (outcome.kind === 'soft404') {
      // indistinguishable from an SPA fallback — absent for this tier, keep
      // trying lower tiers, but preserve the diagnostic signal in evidence
      soft404s.push(probe);
    }
  }
  const soft404Note = soft404s.length > 0 ? ` (HTML/SPA fallback on: ${soft404s.join(', ')})` : '';
  return {
    status: 'fail',
    evidence: softFail ?? `no MCP server card on any tier (${MCP_TIERS.map((t) => t.probe).join(', ')})${soft404Note}`,
  };
};

function oauthCheck(probe: string, requiredField: 'issuer' | 'resource'): CheckFn {
  return (ctx) => {
    const outcome = classifyJsonProbe(ctx.responses.get(probe));
    switch (outcome.kind) {
      case 'absent':
        // spec §3: N/A when the site has no authorization — absence is not a failure
        return {
          status: 'na',
          evidence: `GET ${probe} → ${outcome.status ?? 'no response'} — no OAuth discovery (N/A if the site has no authorization)`,
        };
      case 'soft404':
        return { status: 'na', evidence: `${probe} returns HTML under 200 — treated as absent (SPA fallback)` };
      case 'invalid':
        return { status: 'fail', evidence: `${probe} exists but is not valid JSON` };
      case 'json': {
        const value = (outcome.json as Record<string, unknown>)[requiredField];
        if (typeof value !== 'string' || value.length === 0) {
          return {
            status: 'fail',
            evidence: `${probe}: JSON lacks required "${requiredField}" (spec mandatory field)`,
          };
        }
        return { status: 'pass', evidence: `${probe}: ${requiredField} = ${value}` };
      }
    }
  };
}

// discovery/oauthDiscovery (RFC 8414) and discovery/oauthProtectedResource
// (RFC 9728) — two separate checks, mirroring CF (spec §3).
export const oauthDiscovery: CheckFn = oauthCheck(PROBE.oauthAs, 'issuer');
export const oauthProtectedResource: CheckFn = oauthCheck(PROBE.oauthPr, 'resource');

// discovery/webMcp — in-page detection via the probe layer's MAIN-world script
// (spec §3): detected → pass; confirmed not present → fail; detection layer
// unavailable (origin-trial browser, no script) → na, never fail.
export const webMcp: CheckFn = (ctx) => {
  switch (ctx.signals?.webMcp) {
    case 'detected':
      return { status: 'pass', evidence: 'in-page WebMCP detected (document.modelContext / polyfill)' };
    case 'not-detected':
      return { status: 'fail', evidence: 'in-page detection ran: no WebMCP tool exposure found' };
    default:
      return {
        status: 'na',
        evidence:
          'WebMCP detection unavailable (requires the in-page MAIN-world script; browser may lack the API) — not detectable ≠ not present',
      };
  }
};
