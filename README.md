# Agent Readiness Inspector

Browser extension by [301.st](https://301.st) that checks any site for AI-agent
readiness — the open standards (RFC 9309, RFC 8288, RFC 9727, RFC 8414/9728,
Content Signals, MCP, Agent Skills, llms.txt, …) behind Cloudflare's Agent
Readiness score — **right in your browser, on the current tab**, including pages
behind login that external scanners can't reach.

Status: **M2 complete** — working extension (engine, panel, dashboard), not yet
published. Spec: [`docs/spec.md`](docs/spec.md) · roadmap:
[`docs/ROADMAP.md`](docs/ROADMAP.md) · backlog: [`docs/TODO.md`](docs/TODO.md) ·
positioning: [`docs/branding.md`](docs/branding.md).

## What it does today

- **22 checks** mirroring the live isitagentready matrix (ids and categories
  included), each with a raw-evidence verdict and a copy-paste fix prompt.
- **Side panel** (Chrome/Edge) or popup (Firefox): one-click scan of the current
  tab → composite score, level 0–5, per-category breakdown, evidence checklist.
- **Dashboard**: saved sites, batch scans, score history with sparklines,
  optional-check settings, and an inside-vs-outside diff against Cloudflare's
  official URL Scanner (needs your own CF token, off by default).
- **Calibrated**: `npm run calibrate` diffs our verdicts against the live tool —
  currently **0 unexplained divergences**, levels match on all reference sites.
  The four deliberate differences live in `src/shared/diff.ts`
  (`EXPECTED_DIVERGENCES`, shared with the in-product diff); `scripts/calibrate.mts`
  carries their long-form reasoning for the CI report.

## Stack

WXT + TypeScript + Vanilla DOM, Manifest V3. Biome for lint/format, Vitest for
tests. Same conventions as the rest of the 301.st extension portfolio
(redirect-inspector).

## Development

```bash
npm install
npm run dev          # WXT dev mode (Chrome)
npm run check        # tsc (app + scripts) + biome + vitest — the full gate
npm run build        # production build to dist/
npm run build:icons  # regenerate the MDI sprite from scripts/build-icons.mjs
```

Verification beyond unit tests:

```bash
npx tsx scripts/e2e-smoke.mts        # loads the built extension in Chromium,
                                     # scans live reference sites, screenshots
npm run calibrate                    # our engine vs the live Cloudflare tool
node scripts/capture-fixtures.mjs    # refresh the committed response fixtures
```

## Layout

- `src/checks/` — the pure check-engine: no DOM, no `chrome.*`, no fetch. The
  matrix is versioned **data** (`config.ts`), pinned to a drift snapshot by test.
- `src/probe/` — service-worker probe layer (credentials policy, timeouts, pool).
- `src/shared/` — storage, messaging, CF client, diff, i18n, theme, icons.
- `src/entrypoints/` — background, panel (popup/side panel), dashboard, welcome.
- `ci/drift/snapshots/` — normalized snapshots of upstream sources; a scheduled
  workflow diffs them and files an issue when a standard or the CF tool moves.

## Privacy

Client-side, zero-telemetry: probes go only to the site being scanned, results
are stored locally, and scan history is recorded **only for sites you explicitly
save** (enforced at the single write point, not just promised in prose). The one
outbound exception shipped today is the Cloudflare URL Scanner call — opt-in,
with your own token kept locally. Anything added later (e.g. the planned 301.st
news panel) stays opt-in by the same rule.
