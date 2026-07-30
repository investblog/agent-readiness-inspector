// Engine vs frozen real-world fixtures (tests/fixtures/*.json, captured by
// scripts/capture-fixtures.mjs on 2026-07-30). Deterministic and offline:
// expectations are pinned against the committed snapshots, not live sites —
// re-capturing fixtures is a deliberate, reviewable change.
//
// Scoring here runs over ALL checks (incl. off-by-default a2a/llmsTxt) as an
// engine regression net; the CF-comparable default-set calibration is M0-5.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CheckId } from './config';
import { MATRIX, PROBE } from './config';
import { runChecks, scoreResults } from './index';
import type { CheckContext, CheckResult, CheckStatus, ProbeResponse } from './types';
import { looksLikeHtml } from './util';

function loadFixture(host: string): CheckContext {
  const file = path.join(process.cwd(), 'tests', 'fixtures', `${host}.json`);
  const fixture = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    origin: string;
    responses: Record<string, ProbeResponse>;
  };
  return { origin: fixture.origin, responses: new Map(Object.entries(fixture.responses)) };
}

const ALL_IDS = MATRIX.map((m) => m.id);

function verdicts(host: string): Record<CheckId, CheckResult> {
  const results = runChecks(loadFixture(host), { include: ALL_IDS });
  return Object.fromEntries(results.map((r) => [r.id, r])) as Record<CheckId, CheckResult>;
}

const NEVER_LOCAL: Record<string, CheckStatus> = { dnsAid: 'na', webMcp: 'na', acp: 'na', ap2: 'na', mpp: 'na' };

const EXPECTED: Record<string, { composite: number; level: number; statuses: Partial<Record<CheckId, CheckStatus>> }> =
  {
    'spintax.net': {
      composite: 75,
      level: 4,
      statuses: {
        robotsTxt: 'pass',
        sitemap: 'pass',
        linkHeaders: 'pass',
        markdownNegotiation: 'pass',
        llmsTxt: 'pass',
        contentSignals: 'pass',
        robotsTxtAiRules: 'fail', // no explicit AI UA groups — M0-5 calibration question
        webBotAuth: 'pass', // empty-keys JWKS
        agentSkills: 'pass',
        apiCatalog: 'pass',
        authMd: 'fail',
        mcpServerCard: 'pass',
        oauthDiscovery: 'na',
        oauthProtectedResource: 'na',
        a2aAgentCard: 'fail',
        x402: 'na',
        ucp: 'na',
      },
    },
    'cloudflare.com': {
      composite: 73,
      level: 4,
      statuses: {
        robotsTxt: 'pass',
        sitemap: 'pass',
        linkHeaders: 'pass',
        markdownNegotiation: 'pass',
        llmsTxt: 'pass',
        contentSignals: 'pass',
        robotsTxtAiRules: 'pass',
        webBotAuth: 'na',
        agentSkills: 'fail',
        apiCatalog: 'fail',
        authMd: 'fail',
        mcpServerCard: 'pass', // mcpServers-map shape
        oauthDiscovery: 'na',
        oauthProtectedResource: 'na',
        a2aAgentCard: 'pass', // legacy agent.json: "Cloudflare Site Agent"
        x402: 'na',
        ucp: 'na',
      },
    },
    'github.com': {
      composite: 9,
      level: 1,
      statuses: {
        robotsTxt: 'pass',
        sitemap: 'fail', // 406 on /sitemap.xml, no robots directive
        linkHeaders: 'fail',
        markdownNegotiation: 'fail', // 406
        llmsTxt: 'pass',
        contentSignals: 'fail',
        robotsTxtAiRules: 'fail',
        webBotAuth: 'na',
        agentSkills: 'fail',
        apiCatalog: 'fail',
        authMd: 'fail',
        mcpServerCard: 'fail',
        oauthDiscovery: 'na',
        oauthProtectedResource: 'na',
        a2aAgentCard: 'fail',
        x402: 'na',
        ucp: 'na',
      },
    },
    'vercel.com': {
      composite: 33,
      level: 2,
      statuses: {
        robotsTxt: 'pass',
        sitemap: 'pass',
        linkHeaders: 'fail',
        markdownNegotiation: 'fail',
        llmsTxt: 'pass',
        contentSignals: 'pass',
        robotsTxtAiRules: 'fail',
        webBotAuth: 'na',
        agentSkills: 'fail',
        apiCatalog: 'fail',
        authMd: 'fail',
        mcpServerCard: 'fail',
        oauthDiscovery: 'pass', // real-world AS metadata with issuer
        oauthProtectedResource: 'na',
        a2aAgentCard: 'fail',
        x402: 'na',
        ucp: 'na',
      },
    },
    // the soft-404 exemplar: HTML app-shell under 200 on most paths, 403 root
    'operator.chatgpt.com': {
      composite: 0,
      level: 0,
      statuses: {
        robotsTxt: 'fail',
        sitemap: 'fail',
        linkHeaders: 'fail',
        markdownNegotiation: 'fail',
        llmsTxt: 'fail',
        contentSignals: 'fail',
        robotsTxtAiRules: 'fail',
        webBotAuth: 'fail', // HTML under 200 → fail, not na
        agentSkills: 'fail',
        apiCatalog: 'fail',
        authMd: 'fail',
        mcpServerCard: 'fail',
        oauthDiscovery: 'na', // SPA fallback ≈ absent
        oauthProtectedResource: 'na',
        a2aAgentCard: 'fail',
        x402: 'na',
        ucp: 'na',
      },
    },
  };

describe.each(Object.entries(EXPECTED))('fixture: %s', (host, expected) => {
  const v = verdicts(host);

  it('produces the pinned verdict for every check', () => {
    const actual = Object.fromEntries(ALL_IDS.map((id) => [id, v[id].status]));
    expect(actual).toEqual({ ...NEVER_LOCAL, ...expected.statuses });
  });

  it(`scores composite ${expected.composite} / level ${expected.level}`, () => {
    const card = scoreResults(Object.values(v));
    expect(card.composite).toBe(expected.composite);
    expect(card.level).toBe(expected.level);
  });
});

describe('fixture file guards', () => {
  // paths whose validators read only the body head — truncation is harmless there;
  // robots.txt and JSON well-knowns are parsed in full and must never be truncated
  const HEAD_ONLY = new Set<string>([
    PROBE.root,
    PROBE.rootMarkdown,
    PROBE.rootMdSuffix,
    PROBE.sitemap,
    PROBE.llmsTxt,
    PROBE.llmsFullTxt,
  ]);
  const KNOWN_KEYS = new Set<string>(Object.values(PROBE));

  it.each(Object.keys(EXPECTED))('%s: probe keys match the engine PROBE registry', (host) => {
    const keys = [...loadFixture(host).responses.keys()];
    for (const key of keys) expect(KNOWN_KEYS.has(key), `unknown probe key ${key}`).toBe(true);
  });

  it.each(Object.keys(EXPECTED))('%s: no full-parse probe body is truncated', (host) => {
    // truncation is only hazardous where a validator parses the FULL body to
    // reach a verdict: a non-HTML 200 on a robots/well-known path. Truncated
    // HTML (soft-404 shells) and non-200 bodies are decided from the head/status.
    const responses = loadFixture(host).responses;
    for (const [key, res] of responses) {
      const truncated = (res as ProbeResponse & { truncated?: boolean }).truncated === true;
      const hazardous = truncated && res.status === 200 && !looksLikeHtml(res.body) && !HEAD_ONLY.has(key);
      expect(hazardous, `${key} is truncated but its validator parses the full body`).toBe(false);
    }
  });
});

describe('fixture evidence spot-checks', () => {
  it('spintax mcp card is found on the CF-scored tier', () => {
    expect(verdicts('spintax.net').mcpServerCard.evidence).toContain('CF-scored');
  });

  it('operator.chatgpt.com failures name the soft-404 guard, not bare status codes', () => {
    const v = verdicts('operator.chatgpt.com');
    for (const id of ['robotsTxt', 'llmsTxt', 'webBotAuth', 'agentSkills', 'apiCatalog'] as const) {
      expect(v[id].evidence.toLowerCase()).toContain('soft-404');
    }
  });

  it('cloudflare.com passes robotsTxtAiRules with named vendors', () => {
    expect(verdicts('cloudflare.com').robotsTxtAiRules.evidence).toContain('GPTBot');
  });
});
