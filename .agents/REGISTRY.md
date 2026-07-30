# REGISTRY — Agent Readiness Inspector

Adaptation log: WHY the project environment is the way it is (the WHAT graph lives
in `map.yaml` / `.agents.lock.yaml`).

## 2026-07-30 — bootstrap (Claude Code)
- Bootstrapped from library commit `8967634`; domains coding + web + qa + cloudflare
  (user-selected). `cloudflare` picked even though the extension is not hosted on CF:
  spec M4 (one-click fix via CF Rules API) and the optional URL Scanner integration
  need `cf-auth` / `cf-free-tier` / `edge-compat` discipline.
- No project-bound MCP (user choice). `playwright` used from the global machine
  server; `codegraph` deferred until there is enough code for grep pain; `cloudflare`
  MCP deferred until M4.
- Toolchain scaffolded by copying conventions from `W:\Projects\redirect-inspector`
  (user request: "stack and styles from redirect-inspector"): package.json scripts +
  devDeps (WXT 0.19, TS 5.7, Biome 2.3, Vitest 4), tsconfig, biome.json,
  .gitattributes; `src/assets/css/{theme,popup}.css` copied verbatim;
  `src/public/icons/*` copied as PLACEHOLDERS (replace before store release, see
  docs/TODO.md).
- Claude hook commands in `.claude/settings.json` use the resolved Git-for-Windows
  shell `W:\Program Files\Git\bin\bash.exe` (native Windows: bare `bash` may be the
  WSL launcher).
- Spec draft moved from Downloads to `docs/spec.md` as the product source of truth.

## 2026-07-30 — UI icon sprite (Claude Code, user decision)
- RI icons are NOT copied for the UI — only the sprite PRINCIPLE is (inline
  `<symbol id="i-mono-*">` + `<use>`, fill="currentColor" so both color themes
  drive icon color; same mechanism as 301-ui `build:icons`).
- Own icons come from `@mdi/svg` (Pictogrammers MDI, Apache-2.0 — no attribution
  required, noted for store listing anyway). Generator: `scripts/build-icons.mjs`
  (manifest of names → svgo → sprite + generated `icon-names.ts` union +
  `dev/icons-preview.html` with light/dark panes). devDeps added: @mdi/svg, svgo.
- Toolbar/store PNGs (16–128) remain RI placeholders until own art (M1.5).
