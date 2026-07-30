# Agent Readiness Inspector

Browser extension by [301.st](https://301.st) that checks any site for AI-agent
readiness — the open standards (RFC 9309, RFC 8288, RFC 9727, Content Signals, MCP,
Agent Skills, llms.txt, …) behind Cloudflare's Agent Readiness score — **right in
your browser, on the current tab**, including pages behind login that external
scanners can't reach.

Status: pre-M0 scaffold. Product spec: [`docs/spec.md`](docs/spec.md), roadmap:
[`docs/TODO.md`](docs/TODO.md).

## Stack

WXT + TypeScript + Vanilla DOM, Manifest V3. Biome for lint/format, Vitest for
tests. Same conventions as the rest of the 301.st extension portfolio
(redirect-inspector).

## Development

```bash
npm install
npm run dev        # WXT dev mode (Chrome)
npm run check      # tsc + biome + vitest — the full quality gate
npm run build      # production build to dist/
```

`src/checks/` is the pure, framework-free check-engine (no DOM, no chrome.*) —
tested on response fixtures. Browser I/O lives in the service worker probe layer.

## Privacy

Client-side, zero-telemetry: probes go only to the site being scanned; results are
stored locally. The Cloudflare URL Scanner API and the 301.st news feed are explicit
opt-ins.
