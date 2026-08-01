# Backlog — Agent Readiness Inspector

Detailed plan with DoD per milestone: `docs/ROADMAP.md` (built 2026-07-30 from
the revised spec). This file is the index.

- [ ] M0 — check-engine: all §3 checks + versioned matrix config + fixtures + calibration harness
- [x] M1 — main surface (side panel / popup): current-tab scan, score/level,
      evidence checklist, fix-prompt copy; live smoke green (spintax 75/L4,
      soft-404 exemplar 0/L0) — DONE 2026-07-30
- [ ] M1.5 — store beta: own icons, privacy policy, listing, Chrome + AMO submit
      - [x] Privacy policy drafted: docs/privacy-policy.md (needs a public URL)
      - [x] Icon DECIDED 2026-08-01: the 301.st robot mascot. Source lives at
        src/assets/brand-icon.svg; `npm run build:brand-icons` regenerates the
        packaged PNGs. Web surfaces render the SVG so its currentColor eyes
        follow the theme; the PNGs use the brand colour (the only one legible
        on light, Chrome-grey and dark toolbars alike).
      - [ ] Firefox UX debt: host permissions are opt-in there → tab.url is
        undefined until granted; add permissions.request() flow + FF-specific
        error copy before AMO submit (M1-b review)
      - [ ] 3P-cookie block detection → session indicator (protocol field
        `session` already reserved)
      - [ ] Store links: fill store-links.ts URLs after publication; decide
        whether Edge gets its own build (BROWSER===chrome would show the
        Chrome store link to Edge users otherwise)
      - [ ] Store banner 1400×560 (RI's assets/banner-1400x560.png is the
        format reference) — build it from the mascot
- [x] M2 — dashboard: saved sites, batch, history, light CF Connect + external
      scan diff — DONE 2026-07-30 (plan: .agents/plans/done/m2-dashboard.md)
      - [ ] Verify the external scan live: needs a Cloudflare token with
        `URL Scanner: Edit` (only DoD item left open in M2)
- [ ] M2.5 — repair kits: SKILL.md + stack recipes + verify loop (spec §8.0; content work, parallelizable)
- [x] M3 — watch: alarms + diff + regression notifications — DONE 2026-07-31
      (plan: .agents/plans/done/m3-watch.md)
- [ ] M4 — fix-apply + full CF Connect wizard (spec §8.1)
- [ ] M5 — 301.st layer: news panel, cross-promo, spintax.net as living reference

Open questions (spec §13, non-blocking for M0): monetization — decide before
M1.5 listing; fix-prompt/weights hosting — decide before M2 (bundle until then).
Name DECIDED 2026-07-30: Agent Readiness Inspector. Branding, positioning and
store-listing copy: docs/branding.md (pains → positioning → CWS title/description).

Infrastructure:
- [x] GitHub repo: github.com/investblog/agent-readiness-inspector (public)
- [x] Drift-watch CI: doc-watch job live (daily cron; 11 sources seeded; `drift` label)
- [ ] Drift-watch CI: calibration job (needs the M0 harness)

Scaffold debts:
- [x] UI icons: own MDI sprite (`npm run build:icons` → `src/assets/icons-sprite.svg`,
      currentColor for both themes; extend the manifest in `scripts/build-icons.mjs`)
- [ ] Toolbar/store PNGs (16–128) are still RI placeholders — own art before M1.5
- [ ] Locales: only en + ru seeded; extend to RI's 7 before public release
