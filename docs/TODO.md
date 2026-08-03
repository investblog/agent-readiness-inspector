# Backlog — Agent Readiness Inspector

Detailed plan with DoD per milestone: `docs/ROADMAP.md` (built 2026-07-30 from
the revised spec). This file is the index.

- [x] M0 — check-engine: all §3 checks + versioned matrix config + fixtures +
      calibration harness — DONE 2026-07-30
- [x] M1 — main surface (side panel / popup): current-tab scan, score/level,
      evidence checklist, fix-prompt copy; live smoke green (spintax 75/L4,
      soft-404 exemplar 0/L0) — DONE 2026-07-30
- [ ] M1.5 — store beta: v0.1.0 submitted to Chrome, Firefox AMO, and Edge on
      2026-08-02; reviews pending. Close after decisions and public listing URLs.
      - [x] Privacy policy published:
        https://investblog.github.io/agent-readiness-inspector/privacy/
      - [x] Localized listings, reviewer notes, screenshots, and promo assets
        submitted from the GitHub-built v0.1.0 release packages.
      - [x] Icon DECIDED 2026-08-01: the 301.st robot mascot. Source lives at
        src/assets/brand-icon.svg; `npm run build:brand-icons` regenerates the
        packaged PNGs. Web surfaces render the SVG so its currentColor eyes
        follow the theme; the PNGs use the brand colour (the only one legible
        on light, Chrome-grey and dark toolbars alike).
      - [ ] Firefox UX debt: host permissions are opt-in there → tab.url is
        undefined until granted; add permissions.request() flow + FF-specific
        error copy before the next Firefox update (M1-b review debt)
      - [ ] 3P-cookie block detection → session indicator (protocol field
        `session` already reserved)
      - [ ] Store links: fill store-links.ts URLs after publication; decide
        whether Edge gets its own build (BROWSER===chrome would show the
        Chrome store link to Edge users otherwise)
      - [x] Store banner 1400×560 built from the mascot:
        store-assets/promo-marquee-1400x560.png
- [x] M2 — dashboard: saved sites, batch, history, light CF Connect + external
      scan diff — DONE 2026-07-30 (plan: .agents/plans/done/m2-dashboard.md)
      - [ ] Verify the external scan live: needs a Cloudflare token with
        `URL Scanner: Edit` (only DoD item left open in M2)
- [ ] M2.5 — repair kits: SKILL.md + stack recipes + verify loop (spec §8.0; content work, parallelizable)
- [x] M3 — watch: alarms + diff + regression notifications — DONE 2026-07-31
      (plan: .agents/plans/done/m3-watch.md)
- [ ] M4 — fix-apply + full CF Connect wizard (spec §8.1)
- [ ] M5 — 301.st layer: news panel, cross-promo, spintax.net as living reference

Decisions: name is Agent Readiness Inspector (2026-07-30); the extension has no
paid tier (2026-07-31). Fix prompts and weights remain bundled; reconsider remote
hosting only with M2.5/M4. Branding, positioning, and store-listing copy:
docs/branding.md.

Infrastructure:
- [x] GitHub repo: github.com/investblog/agent-readiness-inspector (public)
- [x] Drift-watch CI: doc-watch job live (daily cron; 11 sources seeded; `drift` label)
- [x] Drift-watch CI: weekly calibration job with drift issues on unexplained mismatches

Scaffold debts:
- [x] UI icons: own MDI sprite (`npm run build:icons` → `src/assets/icons-sprite.svg`,
      currentColor for both themes; extend the manifest in `scripts/build-icons.mjs`)
- [x] Toolbar/store PNGs use the 301.st robot mascot; generated from
      src/assets/brand-icon.svg
- [ ] Locales: en + ru shipped in v0.1.0; expand based on store demand
