// Versioned check matrix — DATA, not code (spec §3 "замечание по дрейфу").
// Scored check ids/categories mirror the live isitagentready matrix captured in
// ci/drift/snapshots/isitagentready-matrix.txt (guarded by config.test.ts);
// drift-watch CI files an issue when upstream moves.

export const MATRIX_VERSION = '2026-07-30';

export type CategoryId = 'discoverability' | 'contentAccessibility' | 'botAccessControl' | 'discovery' | 'commerce';

/** Probe keys: what the probe layer must fetch for the engine (spec §5). */
export const PROBE = {
  root: '/',
  /** GET / with `Accept: text/markdown` (Cloudflare Markdown for Agents). */
  rootMarkdown: '/::accept-markdown',
  /** `.md`-suffix convention (Mintlify) — a separate convention from negotiation. */
  rootMdSuffix: '/index.md',
  robotsTxt: '/robots.txt',
  sitemap: '/sitemap.xml',
  llmsTxt: '/llms.txt',
  llmsFullTxt: '/llms-full.txt',
  webBotAuthDir: '/.well-known/http-message-signatures-directory',
  agentSkills: '/.well-known/agent-skills/index.json',
  apiCatalog: '/.well-known/api-catalog',
  authMd: '/.well-known/auth.md',
  a2aAgentCard: '/.well-known/agent-card.json',
  a2aAgentCardLegacy: '/.well-known/agent.json',
  // MCP tiers (spec §3): draft-canonical -> CF-scored -> de-facto legacy
  mcpServerCard: '/.well-known/mcp/server-card',
  mcpServerIetf: '/.well-known/mcp-server',
  mcpServerCardJson: '/.well-known/mcp/server-card.json',
  mcpServerCardsJson: '/.well-known/mcp/server-cards.json',
  mcpJsonLegacy: '/.well-known/mcp.json',
  oauthAs: '/.well-known/oauth-authorization-server',
  oidcConfig: '/.well-known/openid-configuration',
  oauthPr: '/.well-known/oauth-protected-resource',
  ucp: '/.well-known/ucp',
  x402: '/.well-known/x402',
} as const;

export type ProbeKey = (typeof PROBE)[keyof typeof PROBE];

export interface CheckMeta {
  id: string;
  category: CategoryId;
  standard: string;
  docUrl: string;
  /** Counts toward the composite score (spec §4). Commerce and info checks don't. */
  scored: boolean;
  /** Off-by-default checks (A2A, llms.txt) still run only when enabled. */
  defaultEnabled: boolean;
  /** Probe keys this check consumes — the probe layer fetches the union. */
  probes: readonly ProbeKey[];
}

// `satisfies` (not an annotation) keeps literal `id` types so CheckId below is
// a real union — a typo'd id in IMPLEMENTATIONS/FIX_PROMPTS must not compile.
export const MATRIX = [
  // --- discoverability ---
  {
    id: 'robotsTxt',
    category: 'discoverability',
    standard: 'RFC 9309',
    docUrl: 'https://www.rfc-editor.org/rfc/rfc9309',
    scored: true,
    defaultEnabled: true,
    probes: [PROBE.robotsTxt],
  },
  {
    id: 'sitemap',
    category: 'discoverability',
    standard: 'sitemaps.org 0.90',
    docUrl: 'https://www.sitemaps.org/protocol.html',
    scored: true,
    defaultEnabled: true,
    probes: [PROBE.sitemap, PROBE.robotsTxt],
  },
  {
    id: 'linkHeaders',
    category: 'discoverability',
    standard: 'RFC 8288',
    docUrl: 'https://www.rfc-editor.org/rfc/rfc8288',
    scored: true,
    defaultEnabled: true,
    probes: [PROBE.root],
  },
  {
    id: 'dnsAid',
    category: 'discoverability',
    standard: 'DNS-AID (draft)',
    docUrl: 'https://blog.cloudflare.com/agent-readiness/',
    scored: true,
    defaultEnabled: true,
    probes: [], // DNS is not probeable from an extension — needs external scan (spec §3)
  },
  // --- contentAccessibility ---
  {
    id: 'markdownNegotiation',
    category: 'contentAccessibility',
    standard: 'Cloudflare Markdown for Agents',
    docUrl: 'https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/',
    scored: true,
    defaultEnabled: true,
    probes: [PROBE.rootMarkdown, PROBE.rootMdSuffix],
  },
  {
    id: 'llmsTxt',
    category: 'contentAccessibility',
    standard: 'llmstxt.org (informal)',
    docUrl: 'https://llmstxt.org/',
    scored: false, // info, вне скора — CF выкинул из тула (spec §3)
    defaultEnabled: false,
    probes: [PROBE.llmsTxt, PROBE.llmsFullTxt],
  },
  // --- botAccessControl ---
  {
    id: 'contentSignals',
    category: 'botAccessControl',
    standard: 'Content Signals Policy',
    docUrl: 'https://contentsignals.org/',
    scored: true,
    defaultEnabled: true,
    probes: [PROBE.robotsTxt],
  },
  {
    id: 'robotsTxtAiRules',
    category: 'botAccessControl',
    standard: 'RFC 9309 + vendor UA docs',
    docUrl: 'https://github.com/ai-robots-txt/ai.robots.txt',
    scored: true,
    defaultEnabled: true,
    probes: [PROBE.robotsTxt],
  },
  {
    id: 'webBotAuth',
    category: 'botAccessControl',
    standard: 'IETF draft-meunier-http-message-signatures-directory',
    docUrl: 'https://datatracker.ietf.org/doc/html/draft-meunier-http-message-signatures-directory',
    scored: true,
    defaultEnabled: true,
    probes: [PROBE.webBotAuthDir],
  },
  // --- discovery ---
  {
    id: 'agentSkills',
    category: 'discovery',
    standard: 'Cloudflare Agent Skills Discovery RFC v0.2',
    docUrl: 'https://github.com/cloudflare/agent-skills-discovery-rfc',
    scored: true,
    defaultEnabled: true,
    probes: [PROBE.agentSkills],
  },
  {
    id: 'apiCatalog',
    category: 'discovery',
    standard: 'RFC 9727',
    docUrl: 'https://www.rfc-editor.org/rfc/rfc9727',
    scored: true,
    defaultEnabled: true,
    probes: [PROBE.apiCatalog],
  },
  {
    id: 'authMd',
    category: 'discovery',
    standard: 'Auth.md (Cloudflare convention)',
    docUrl: 'https://blog.cloudflare.com/agent-readiness/',
    scored: true,
    defaultEnabled: true,
    probes: [PROBE.authMd],
  },
  {
    id: 'mcpServerCard',
    category: 'discovery',
    standard: 'MCP SEP-2127 (draft) / de-facto',
    docUrl: 'https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127',
    scored: true,
    defaultEnabled: true,
    probes: [
      PROBE.mcpServerCard,
      PROBE.mcpServerIetf,
      PROBE.mcpServerCardJson,
      PROBE.mcpServerCardsJson,
      PROBE.mcpJsonLegacy,
    ],
  },
  {
    id: 'oauthDiscovery',
    category: 'discovery',
    standard: 'RFC 8414',
    docUrl: 'https://www.rfc-editor.org/rfc/rfc8414',
    scored: true,
    defaultEnabled: true,
    probes: [PROBE.oauthAs, PROBE.oidcConfig],
  },
  {
    id: 'oauthProtectedResource',
    category: 'discovery',
    standard: 'RFC 9728',
    docUrl: 'https://www.rfc-editor.org/rfc/rfc9728',
    scored: true,
    defaultEnabled: true,
    probes: [PROBE.oauthPr],
  },
  {
    id: 'webMcp',
    category: 'discovery',
    standard: 'W3C WebMCP (CG draft)',
    docUrl: 'https://webmachinelearning.github.io/webmcp/',
    scored: true,
    defaultEnabled: true,
    probes: [], // in-page detection (MAIN-world script), not an HTTP probe — spec §3
  },
  {
    id: 'a2aAgentCard',
    category: 'discovery',
    standard: 'A2A Agent Card',
    docUrl: 'https://a2a-protocol.org/',
    scored: true,
    defaultEnabled: false, // off by default, как у CF (spec §3)
    probes: [PROBE.a2aAgentCard, PROBE.a2aAgentCardLegacy],
  },
  // --- commerce (unscored preview, spec §4) ---
  {
    id: 'x402',
    category: 'commerce',
    standard: 'x402',
    docUrl: 'https://www.x402.org/',
    scored: false,
    defaultEnabled: true,
    probes: [PROBE.x402, PROBE.root],
  },
  {
    id: 'ucp',
    category: 'commerce',
    standard: 'UCP',
    docUrl: 'https://ucp.dev/',
    scored: false,
    defaultEnabled: true,
    probes: [PROBE.ucp],
  },
  {
    id: 'acp',
    category: 'commerce',
    standard: 'Agentic Commerce Protocol',
    docUrl: 'https://github.com/agentic-commerce-protocol/agentic-commerce-protocol',
    scored: false,
    defaultEnabled: true,
    probes: [], // no standardized well-known — detection strategy TBD via calibration (spec §3)
  },
  {
    id: 'ap2',
    category: 'commerce',
    standard: 'AP2',
    docUrl: 'https://blog.cloudflare.com/agent-readiness/',
    scored: false,
    defaultEnabled: true,
    probes: [], // detection TBD via calibration
  },
  {
    id: 'mpp',
    category: 'commerce',
    standard: 'MPP',
    docUrl: 'https://blog.cloudflare.com/agent-readiness/',
    scored: false,
    defaultEnabled: true,
    probes: [], // detection TBD via calibration
  },
] as const satisfies readonly CheckMeta[];

export type CheckId = (typeof MATRIX)[number]['id'];

export function checkMeta(id: CheckId): CheckMeta {
  const meta = MATRIX.find((m) => m.id === id);
  if (!meta) throw new Error(`unknown check id: ${id}`);
  return meta;
}

/**
 * AI crawler user-agents an explicit robots.txt group can address — versioned
 * DATA like the matrix. Vendor six + common trainers; extend via drift/self-config
 * (upstream canon: github.com/ai-robots-txt/ai.robots.txt).
 */
export const AI_BOT_USER_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Meta-ExternalAgent',
  'Meta-ExternalFetcher',
  'CCBot',
  'Bytespider',
  'Applebot-Extended',
] as const;

export interface LevelBand {
  level: number;
  name: string;
  minComposite: number;
}

/**
 * Level bands — calibrated 2026-07-30 against /api/scan (the machine-readable
 * surface): three live reference points match exactly (spintax L4,
 * cloudflare.com L3, vercel L2 — see scripts/calibrate.mts). CF's web-UI is
 * known to disagree with /api/scan on the L4/L5 border (spintax 79: UI said
 * L5 the same day) — web-UI parity is a deliberate open question for M1.5,
 * documented in ROADMAP; do not "fix" the bands by eye.
 */
export const LEVELS = [
  { level: 5, name: 'Agent-Native', minComposite: 80 },
  { level: 4, name: 'Agent-Integrated', minComposite: 65 },
  { level: 3, name: 'Agent-Readable', minComposite: 45 },
  { level: 2, name: 'Bot-Aware', minComposite: 25 },
  { level: 1, name: 'Basic Web Presence', minComposite: 1 },
  { level: 0, name: 'Not Ready', minComposite: 0 },
] as const satisfies readonly LevelBand[];
