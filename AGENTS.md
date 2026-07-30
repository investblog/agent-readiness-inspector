# Agent Readiness Inspector — AGENTS.md

Browser extension (301.st portfolio) that audits any site for AI-agent readiness —
the open standards behind Cloudflare's Agent Readiness score (isitagentready.com) —
in the browser, on the current tab, including pages behind login. Full product spec:
`docs/spec.md`. Stack mirrors `W:\Projects\redirect-inspector`: WXT + TypeScript +
Vanilla DOM, Manifest V3, Biome, Vitest.

## Pointer (where to look, in priority order)
- Rules: first `./.agents/rules/`, then the library `~/.agents/rules/`.
- Skills/agents: first `./.agents/`, then the library.
- Links and MCP configs: first the local `./.agents/map.yaml` + `./.agents/mcp-configs.yaml`;
  `~/.agents/...` — only to deploy a new rule. The build snapshot — in
  `./.agents/generated/.agents.lock.yaml`.
- Adaptation registry: `./.agents/REGISTRY.md` — WHY something was added/changed
  (the WHAT graph — in `map.yaml`, do not duplicate).
- **[CRITICAL] Plans, docs, and work-artifacts live ONLY in this project** —
  `./.agents/plans/{active,done}`, `./docs/`, the project tree. **NEVER write them to
  `~/.claude/`, `~/.codex/`, `~/.config/opencode/`, or any home/global agent folder**
  (see `project-docs`). Scratch/temp → session scratchpad or a gitignored project dir.
- On conflict the project wins (more specific overrides more general).

## Behavioral rules (base seed — expand as you work)
- **Think before coding.** State assumptions; if uncertain, ask. Present competing
  interpretations — don't pick silently. Name what's unclear and stop. Push back when
  a simpler path exists.
- **Simplicity first.** Minimum code that solves the problem — no speculative features,
  abstractions, flexibility, or error handling for impossible cases. 200 lines that
  could be 50 → rewrite.
- **Surgical changes.** Touch only what the request needs; every changed line traces
  to it. Match existing style; don't refactor what isn't broken or delete pre-existing
  dead code (mention it). Remove only the orphans your change created.
- **Goal-driven + verify.** Turn the task into a verifiable goal; brief plan, per-step
  verification; confirm by an independent check, not assertion (see `proof-loop`,
  `code-review`).
- **Chat answers: structured and plain.** Lead with the answer, then the why. No
  buzzwords; a genuine technical term is fine when it is the precise word.
- **Workspace hygiene — clean up when done.** Don't start or restart servers or spawn
  background processes unless asked; kill what you started, remove temp files. Leave
  the workspace as you found it, plus the intended change.
- **Don't block on a slow tool.** If a tool / MCP / index / server doesn't answer
  within a few seconds, proceed without it and say so.

### Project-specific
- **check-engine stays pure.** `src/checks/` is framework-agnostic TS: no DOM, no
  `chrome.*`, no fetch inside — a check consumes probe results and returns a
  `CheckResult`. All browser I/O lives in the probe layer (service worker). This is
  spec §5 and what makes M0 testable on fixtures.
- **Single-purpose / no page injection.** Never inject promo/news into third-party
  pages — store-policy risk (spec §2, §9). Promo lives only inside popup/dashboard UI.
- **Zero-telemetry default.** Network calls go only to the scanned target; Cloudflare
  URL Scanner API and the 301.st news feed are explicit opt-ins (spec §2, §10).
- **Mirror Cloudflare's matrix.** Check IDs, categories, and scoring mirror
  isitagentready so scores stay comparable (spec §3–§4). Weights live in config.

## Self-configuration (adapt and explain)
`~/.agents` provides a minimal shared baseline. Adapting to the project is standard
work. The ladder, when the project needs a tool/skill/rule:
1. Local in `./.agents/` — already there? use it.
2. No → in the baseline `~/.agents/`? pull the chain (`cp` the rule + linked
   skills/agents/MCP), append to the local `./.agents/map.yaml` and to the pointer.
   The trigger for "something new in the baseline" — an explicit user request or a
   one-shot scan `find ~/.agents/rules/ -type f` (not a constant diff).
3. Not anywhere → escalation: the `research` path (websearch → fetch → browser)
   to compare/find, install/attach into the project, append to the local map.

**Activate an agent by running it.** An agent entering this initialized project that
has no native config of its own renders its own part from the chain — its hooks/MCP
into its own file (Claude → `.claude/settings.json` + the `CLAUDE.md` symlink; codex →
`.codex/config.toml`; opencode → `opencode.json` + `.opencode/plugin/`), logged in
REGISTRY. No agent sets up another agent's environment.

Accounting: `./.agents/map.yaml` = WHAT is attached (the graph). `./.agents/REGISTRY.md`
= WHY (change log: what, version/source, date, rationale). Write ONLY changes — no
changes, the file is empty. Own skills (created via `/`) are also recorded in REGISTRY;
author them via the `skill-creator` library skill.

Autonomy boundaries:
- adapting the PROJECT (layers 1–3) — without asking, standard;
- changing the BASELINE `~/.agents` — only by agreement with the user.

[CRITICAL] Any attach/install/replace — with an explanation in REGISTRY.md.
Without the record, the next session does not know why the project environment is
the way it is.

## Attached at initialization
- Library version: commit `8967634` (see `.agents.lock.yaml`)
- Domains: coding, web, qa, cloudflare (+ always-on base)
- Rules, skills, agents, hooks: see `.agents.lock.yaml` — do not duplicate here
- MCP: no project-bound MCP; `playwright` is global machine infra (used, not rendered)
- cloudflare domain rationale: the extension is not hosted on CF, but M4 (one-click
  fix via CF Rules API) and the optional URL Scanner API integration need `cf-auth` /
  `cf-free-tier` discipline

Links are taken from `./.agents/map.yaml` (the local copy) via the pointer.
