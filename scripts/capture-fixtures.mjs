// Capture real-world probe responses into committed fixtures (M0-4, ROADMAP).
// The engine's fixture tests run over these frozen snapshots — deterministic,
// offline, and honest about what live sites actually serve.
//
// Usage: node scripts/capture-fixtures.mjs [origin ...]
// Defaults to the reference set. Output: tests/fixtures/<host>.json
//
// PROBES must stay in sync with PROBE in src/checks/config.ts (script is JS,
// the engine is TS — keep the mapping mirrored by hand, both sides commented).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_ORIGINS = [
  'https://spintax.net', // living reference (spec §9)
  'https://www.cloudflare.com', // scorer's own site, serves legacy mcp.json
  'https://github.com', // honest 404s + llms.txt
  'https://vercel.com', // SPA platform, honest 404s
  'https://operator.chatgpt.com', // soft-404 exemplar (HTML app-shell on well-knowns)
];

// key → request descriptor; mirrors src/checks/config.ts PROBE
export const PROBES = {
  '/': { path: '/' },
  '/::accept-markdown': { path: '/', headers: { accept: 'text/markdown' } },
  '/index.md': { path: '/index.md' },
  '/robots.txt': { path: '/robots.txt' },
  '/sitemap.xml': { path: '/sitemap.xml' },
  '/llms.txt': { path: '/llms.txt' },
  '/llms-full.txt': { path: '/llms-full.txt' },
  '/.well-known/http-message-signatures-directory': { path: '/.well-known/http-message-signatures-directory' },
  '/.well-known/agent-skills/index.json': { path: '/.well-known/agent-skills/index.json' },
  '/.well-known/api-catalog': { path: '/.well-known/api-catalog', headers: { accept: 'application/linkset+json' } },
  '/.well-known/auth.md': { path: '/.well-known/auth.md' },
  '/.well-known/agent-card.json': { path: '/.well-known/agent-card.json' },
  '/.well-known/agent.json': { path: '/.well-known/agent.json' },
  '/.well-known/mcp/server-card': { path: '/.well-known/mcp/server-card' },
  '/.well-known/mcp-server': { path: '/.well-known/mcp-server' },
  '/.well-known/mcp/server-card.json': { path: '/.well-known/mcp/server-card.json' },
  '/.well-known/mcp/server-cards.json': { path: '/.well-known/mcp/server-cards.json' },
  '/.well-known/mcp.json': { path: '/.well-known/mcp.json' },
  '/.well-known/oauth-authorization-server': { path: '/.well-known/oauth-authorization-server' },
  '/.well-known/openid-configuration': { path: '/.well-known/openid-configuration' },
  '/.well-known/oauth-protected-resource': { path: '/.well-known/oauth-protected-resource' },
  '/.well-known/ucp': { path: '/.well-known/ucp' },
  '/.well-known/x402': { path: '/.well-known/x402' },
};

// headers the engine's validators actually consume — keep fixtures lean
const KEPT_HEADERS = ['content-type', 'vary', 'link', 'content-signal', 'server', 'x-robots-tag'];

// Truncation would corrupt verdicts where validators parse the FULL body
// (robots directives, JSON well-knowns) — those get a large safety cap; pages
// whose validators only read the head (HTML roots, llms.txt, sitemap) stay lean.
const BODY_LIMIT = 8192;
const FULL_BODY_LIMIT = 262144;
const needsFullBody = (key) => key === '/robots.txt' || key.startsWith('/.well-known/');

const UA = 'agent-readiness-inspector fixture capture (github.com/investblog/agent-readiness-inspector)';

async function probe(origin, key, spec) {
  const url = new URL(spec.path, origin).toString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': UA, ...(spec.headers ?? {}) },
    });
    const headers = {};
    for (const name of KEPT_HEADERS) {
      const value = res.headers.get(name);
      if (value !== null) headers[name] = value;
    }
    const raw = await res.text();
    const limit = needsFullBody(key) ? FULL_BODY_LIMIT : BODY_LIMIT;
    const body = raw.length > limit ? raw.slice(0, limit) : raw;
    return { url, status: res.status, headers, body, truncated: raw.length > limit || undefined };
  } catch (err) {
    console.error(`  [capture] ${key}: ${err.message}`);
    return null; // absent from the fixture = probe layer got no response
  } finally {
    clearTimeout(timer);
  }
}

/** Probe every path for one origin; shared by fixture capture and calibration. */
export async function captureOrigin(origin) {
  const responses = {};
  for (const [key, spec] of Object.entries(PROBES)) {
    const res = await probe(origin, key, spec);
    if (res) responses[key] = res;
    await new Promise((resolve) => setTimeout(resolve, 150)); // politeness
  }
  return responses;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const origins = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_ORIGINS;
  const outDir = path.join(process.cwd(), 'tests', 'fixtures');
  fs.mkdirSync(outDir, { recursive: true });

  for (const origin of origins) {
    const host = new URL(origin).host.replace(/^www\./, '');
    console.log(`[capture] ${origin}`);
    const responses = await captureOrigin(origin);
    const fixture = { origin, capturedAt: new Date().toISOString(), responses };
    const file = path.join(outDir, `${host}.json`);
    fs.writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
    console.log(`[capture] -> tests/fixtures/${host}.json (${Object.keys(responses).length} probes)`);
  }
}
