// Fix-prompt library v1 — keyed by check.id (spec §8). Short prompts only;
// the full repair kits (SKILL.md + stack recipes) are M2.5 content (spec §8.0).

import type { CheckId } from './config';

const DEFAULT_PROMPT =
  'This agent-readiness check failed. Read the linked standard and implement it for this site, ' +
  'then re-run the scan to confirm the check passes.';

export const FIX_PROMPTS: Partial<Record<CheckId, string>> = {
  robotsTxt:
    'Add a robots.txt at the site root (RFC 9309). Include explicit user-agent blocks for AI agents ' +
    '(GPTBot, ClaudeBot, etc.) stating what they may crawl, and reference your sitemap.',
  sitemap:
    'Add an XML sitemap (sitemaps.org protocol) and declare it in robots.txt with a `Sitemap: <absolute-url>` ' +
    'line so crawlers and agents can find it regardless of its location.',
  linkHeaders:
    'Add an HTTP Link response header (RFC 8288) on the site root advertising machine-readable resources, ' +
    'e.g. `Link: </.well-known/api-catalog>; rel="api-catalog"` or rel="describedby"/"service-doc" pointing to API docs.',
  markdownNegotiation:
    'Implement markdown content negotiation (Cloudflare "Markdown for Agents" convention): when a request ' +
    'sends `Accept: text/markdown`, respond with the page as `Content-Type: text/markdown` and include ' +
    '`Vary: Accept` so caches keep variants separate.',
  llmsTxt:
    'Optionally add /llms.txt (llmstxt.org): a markdown file starting with an H1 site name, a short summary, ' +
    'and curated links. Note: adoption by AI providers is unproven — treat as informational.',
  contentSignals:
    'Declare Content Signals in robots.txt (contentsignals.org): add a `Content-Signal: search=yes, ' +
    'ai-input=yes, ai-train=no` line (choose your own yes/no values) above your user-agent groups.',
  robotsTxtAiRules:
    'Add explicit robots.txt user-agent groups for AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot, ' +
    'PerplexityBot, Google-Extended, Meta-ExternalAgent, CCBot, …) stating allow or disallow — an explicit ' +
    'decision either way beats silence.',
  dnsAid:
    'DNS-AID cannot be evaluated or fixed from HTTP probes: configure the DNS record per the draft, ' +
    'then verify via the external scan (Cloudflare URL Scanner with agentReadiness: true).',
  webBotAuth:
    'To support Web Bot Auth (IETF draft-meunier-http-message-signatures-directory), serve a JWKS document at ' +
    '/.well-known/http-message-signatures-directory with a `keys` array (empty is valid) as application/json.',
  agentSkills:
    'Publish an Agent Skills index at /.well-known/agent-skills/index.json (Cloudflare Agent Skills Discovery ' +
    'RFC): JSON with a skills[] array; each skill needs name, type ("skill-md" or "archive"), description, url ' +
    'and a sha256 digest.',
  apiCatalog:
    'Serve an API catalog at /.well-known/api-catalog (RFC 9727): a linkset document (RFC 9264, ' +
    'application/linkset+json) with a `linkset` array pointing at your API endpoints and their documentation.',
  authMd:
    'Add an auth.md document (Cloudflare convention) describing how agents authenticate to your site/API: ' +
    'supported flows, token endpoints, scopes. Serve it as markdown at the well-known path.',
  a2aAgentCard:
    'Publish an A2A Agent Card at /.well-known/agent-card.json: JSON with at least name, description, url and ' +
    'capabilities describing your agent-facing endpoint.',
  mcpServerCard:
    'Publish an MCP server card. Current draft path: /.well-known/mcp/server-card (SEP-2127); also widely ' +
    'deployed: /.well-known/mcp.json. JSON should identify the server (name) and its endpoint(s) (url/servers).',
  oauthDiscovery:
    'If your site has authorization, serve OAuth Authorization Server Metadata (RFC 8414) at ' +
    '/.well-known/oauth-authorization-server: JSON with issuer, authorization_endpoint, token_endpoint.',
  oauthProtectedResource:
    'If your API is an OAuth protected resource, serve RFC 9728 metadata at ' +
    '/.well-known/oauth-protected-resource: JSON with `resource` and authorization server references.',
  webMcp:
    'Expose in-page tools to agents via WebMCP (W3C draft): register tools with ' +
    'document.modelContext.registerTool() (or the @mcp-b polyfill) so agent-capable browsers can call them.',
  x402:
    'To accept agent payments via x402: respond 402 with an `accepts[]` payment-requirements payload and/or ' +
    'publish a /.well-known/x402 manifest (see x402.org).',
  ucp: 'To support UCP, publish the /.well-known/ucp manifest: JSON with a `ucp` object declaring version, services and capabilities (ucp.dev).',
};

export function fixPrompt(id: CheckId): string {
  return FIX_PROMPTS[id] ?? DEFAULT_PROMPT;
}
