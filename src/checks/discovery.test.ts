import { describe, expect, it } from 'vitest';
import { PROBE } from './config';
import { runChecks } from './index';
import { ctx, run } from './test-helpers';

describe('agentSkills check', () => {
  it('passes on a valid index with named skills', () => {
    const r = run('agentSkills', {
      [PROBE.agentSkills]: {
        body: JSON.stringify({ skills: [{ name: 'docs', type: 'skill-md', url: '/s.md' }] }),
      },
    });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('1 named skill');
  });

  it('fails an empty or missing skills[]', () => {
    expect(run('agentSkills', { [PROBE.agentSkills]: { body: '{"skills": []}' } }).status).toBe('fail');
    expect(run('agentSkills', { [PROBE.agentSkills]: { body: '{"foo": 1}' } }).status).toBe('fail');
  });

  it('fails entries without a name', () => {
    const r = run('agentSkills', { [PROBE.agentSkills]: { body: '{"skills": [{"type": "skill-md"}]}' } });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('without a name');
  });

  it('fails soft-404 and 404', () => {
    expect(run('agentSkills', { [PROBE.agentSkills]: { body: '<!doctype html>' } }).status).toBe('fail');
    expect(run('agentSkills', { [PROBE.agentSkills]: { status: 404 } }).status).toBe('fail');
  });
});

describe('apiCatalog check', () => {
  it('passes a linkset and notes a wrong content-type', () => {
    const r = run('apiCatalog', {
      [PROBE.apiCatalog]: {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ linkset: [{ anchor: 'https://e.com/api' }] }),
      },
    });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('application/linkset+json expected');
  });

  it('passes cleanly with the proper media type', () => {
    const r = run('apiCatalog', {
      [PROBE.apiCatalog]: {
        headers: { 'content-type': 'application/linkset+json' },
        body: '{"linkset": []}',
      },
    });
    expect(r.status).toBe('pass');
    expect(r.evidence).not.toContain('expected');
  });

  it('fails a bare 200 without a linkset (spec §3: голый 200 не считается)', () => {
    expect(run('apiCatalog', { [PROBE.apiCatalog]: { body: '{"apis": []}' } }).status).toBe('fail');
    expect(run('apiCatalog', { [PROBE.apiCatalog]: { body: 'hello' } }).status).toBe('fail');
  });
});

describe('authMd check', () => {
  it('passes markdown under 200', () => {
    expect(run('authMd', { [PROBE.authMd]: { body: '# Auth\nUse OAuth.' } }).status).toBe('pass');
  });
  it('fails HTML soft-404, absence, and an empty 200 (body validator rule)', () => {
    expect(run('authMd', { [PROBE.authMd]: { body: '<!doctype html>' } }).status).toBe('fail');
    expect(run('authMd', {}).status).toBe('fail');
    expect(run('authMd', { [PROBE.authMd]: { body: '  \n' } }).status).toBe('fail');
  });
});

describe('a2aAgentCard check (off by default)', () => {
  it('is not part of the default run', () => {
    const defaults = runChecks(ctx({ [PROBE.a2aAgentCard]: { body: '{}' } })).map((r) => r.id);
    expect(defaults).not.toContain('a2aAgentCard');
  });

  it('passes a valid card on the current path', () => {
    const r = run('a2aAgentCard', {
      [PROBE.a2aAgentCard]: { body: JSON.stringify({ name: 'Agent', url: 'https://e.com/a2a' }) },
    });
    expect(r.status).toBe('pass');
  });

  it('falls back to the legacy agent.json path', () => {
    const r = run('a2aAgentCard', {
      [PROBE.a2aAgentCard]: { status: 404 },
      [PROBE.a2aAgentCardLegacy]: { body: JSON.stringify({ name: 'Agent', url: 'https://e.com/a2a' }) },
    });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('agent.json');
  });

  it('fails a card without identifying fields', () => {
    expect(run('a2aAgentCard', { [PROBE.a2aAgentCard]: { body: '{"version": 1}' } }).status).toBe('fail');
  });

  it('treats an SPA soft-404 on the primary path as absent and uses the legacy card', () => {
    const r = run('a2aAgentCard', {
      [PROBE.a2aAgentCard]: { body: '<!doctype html>' },
      [PROBE.a2aAgentCardLegacy]: { body: JSON.stringify({ name: 'Agent', url: 'https://e.com/a2a' }) },
    });
    expect(r.status).toBe('pass');
  });
});

describe('mcpServerCard check (tiered, spec §3)', () => {
  const card = JSON.stringify({ name: 'Example MCP', url: 'https://mcp.example.com' });

  it('passes on the draft-canonical tier and names it', () => {
    const r = run('mcpServerCard', { [PROBE.mcpServerCard]: { body: card } });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('draft-canonical');
  });

  it('falls through tiers to de-facto legacy mcp.json (spintax/cloudflare.com case)', () => {
    const r = run('mcpServerCard', {
      [PROBE.mcpServerCard]: { status: 404 },
      [PROBE.mcpJsonLegacy]: { body: card },
    });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('de-facto legacy');
  });

  it('treats an SPA HTML fallback on one tier as absent and keeps trying', () => {
    const r = run('mcpServerCard', {
      [PROBE.mcpServerCard]: { body: '<!doctype html>' },
      [PROBE.mcpJsonLegacy]: { body: card },
    });
    expect(r.status).toBe('pass');
  });

  it('fails a card without identity/endpoint fields', () => {
    const r = run('mcpServerCard', { [PROBE.mcpJsonLegacy]: { body: '{"hello": "world"}' } });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('identity/endpoint');
  });

  it('fails when nothing exists on any tier', () => {
    expect(run('mcpServerCard', {}).status).toBe('fail');
  });

  it('accepts the client-config mcpServers map shape (cloudflare.com fixture)', () => {
    const r = run('mcpServerCard', {
      [PROBE.mcpJsonLegacy]: { body: JSON.stringify({ mcpServers: { site: { name: 'Site MCP' } } }) },
    });
    expect(r.status).toBe('pass');
    const empty = run('mcpServerCard', { [PROBE.mcpJsonLegacy]: { body: '{"mcpServers": {}}' } });
    expect(empty.status).toBe('fail');
  });

  it('rejects mcpServers maps whose entries carry no identity/endpoint (gameability guard)', () => {
    expect(run('mcpServerCard', { [PROBE.mcpJsonLegacy]: { body: '{"mcpServers": {"a": 1}}' } }).status).toBe('fail');
    expect(run('mcpServerCard', { [PROBE.mcpJsonLegacy]: { body: '{"mcpServers": ["a"]}' } }).status).toBe('fail');
    const transport = run('mcpServerCard', {
      [PROBE.mcpJsonLegacy]: { body: JSON.stringify({ mcpServers: { s: { transport: { url: 'https://m.e' } } } }) },
    });
    expect(transport.status).toBe('pass');
  });

  it('accepts serverInfo.name as identity (calibrated: CF requires name or serverInfo.name)', () => {
    const r = run('mcpServerCard', {
      [PROBE.mcpJsonLegacy]: { body: JSON.stringify({ serverInfo: { name: 'X' }, url: 'https://m.e.com' }) },
    });
    expect(r.status).toBe('pass');
  });

  it('accepts servers[]-shaped cards and rejects remotes: null (validation hole guard)', () => {
    const servers = run('mcpServerCard', {
      [PROBE.mcpJsonLegacy]: { body: JSON.stringify({ name: 'X', servers: [{ url: 'https://m.e.com' }] }) },
    });
    expect(servers.status).toBe('pass');
    const nullRemotes = run('mcpServerCard', {
      [PROBE.mcpJsonLegacy]: { body: JSON.stringify({ name: 'X', remotes: null }) },
    });
    expect(nullRemotes.status).toBe('fail');
  });

  it('reports invalid JSON on a tier and keeps soft-404 diagnostics in evidence', () => {
    const invalid = run('mcpServerCard', { [PROBE.mcpJsonLegacy]: { body: '{broken' } });
    expect(invalid.status).toBe('fail');
    expect(invalid.evidence).toContain('not valid JSON');
    const spa = run('mcpServerCard', { [PROBE.mcpServerCard]: { body: '<!doctype html>' } });
    expect(spa.status).toBe('fail');
    expect(spa.evidence).toContain('SPA fallback');
  });
});

describe('oauth discovery checks (RFC 8414 / 9728)', () => {
  it('passes AS metadata with an issuer', () => {
    const r = run('oauthDiscovery', {
      [PROBE.oauthAs]: { body: JSON.stringify({ issuer: 'https://e.com' }) },
    });
    expect(r.status).toBe('pass');
  });

  it('passes PR metadata with a resource', () => {
    const r = run('oauthProtectedResource', {
      [PROBE.oauthPr]: { body: JSON.stringify({ resource: 'https://e.com/api' }) },
    });
    expect(r.status).toBe('pass');
  });

  it('fails when absent (calibrated: CF fails missing OAuth/OIDC metadata, not N/A)', () => {
    const r = run('oauthDiscovery', { [PROBE.oauthAs]: { status: 404 } });
    expect(r.status).toBe('fail');
    expect(r.evidence).toContain('CF criterion');
    expect(run('oauthProtectedResource', {}).status).toBe('fail');
  });

  it('fails on an HTML soft-404 (SPA fallback ≈ absent)', () => {
    expect(run('oauthDiscovery', { [PROBE.oauthAs]: { body: '<!doctype html>' } }).status).toBe('fail');
  });

  it('accepts OIDC openid-configuration as an equivalent source for oauthDiscovery', () => {
    const r = run('oauthDiscovery', {
      [PROBE.oauthAs]: { status: 404 },
      [PROBE.oidcConfig]: { body: JSON.stringify({ issuer: 'https://e.com' }) },
    });
    expect(r.status).toBe('pass');
    expect(r.evidence).toContain('openid-configuration');
  });

  it('fails metadata missing its mandatory field', () => {
    expect(run('oauthDiscovery', { [PROBE.oauthAs]: { body: '{"foo": 1}' } }).status).toBe('fail');
    expect(run('oauthProtectedResource', { [PROBE.oauthPr]: { body: '{"foo": 1}' } }).status).toBe('fail');
  });
});

describe('webMcp check (in-page signal, spec §3)', () => {
  it('passes when the probe layer detected in-page tools', () => {
    const context = { ...ctx({}), signals: { webMcp: 'detected' as const } };
    const r = runChecks(context, { include: ['webMcp'] })[0];
    expect(r.status).toBe('pass');
  });

  it('fails only on a confirmed not-detected', () => {
    const context = { ...ctx({}), signals: { webMcp: 'not-detected' as const } };
    expect(runChecks(context, { include: ['webMcp'] })[0].status).toBe('fail');
  });

  it('is na when detection could not run — not detectable ≠ not present', () => {
    const r = runChecks(ctx({}), { include: ['webMcp'] })[0];
    expect(r.status).toBe('na');
    expect(r.evidence).toContain('not detectable');
  });
});
