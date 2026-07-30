# Backlog — Agent Readiness Inspector

Detailed plan with DoD per milestone: `docs/ROADMAP.md` (built 2026-07-30 from
the revised spec). This file is the index.

- [ ] M0 — check-engine: all §3 checks + versioned matrix config + fixtures + calibration harness
- [ ] M1 — popup: current-tab scan, score/level, evidence checklist, fix-prompts
- [ ] M1.5 — store beta: own icons, privacy policy, listing, Chrome + AMO submit
- [ ] M2 — dashboard: saved sites, batch, history, light CF Connect + external scan diff
- [ ] M2.5 — repair kits: SKILL.md + stack recipes + verify loop (spec §8.0; content work, parallelizable)
- [ ] M3 — watch: alarms + diff + regression notifications (can move earlier if M2 drags)
- [ ] M4 — fix-apply + full CF Connect wizard (spec §8.1)
- [ ] M5 — 301.st layer: news panel, cross-promo, spintax.net as living reference

Open questions (spec §13, non-blocking for M0): monetization — decide before
M1.5 listing; fix-prompt/weights hosting — decide before M2 (bundle until then).
Name DECIDED 2026-07-30: Agent Readiness Inspector. Branding, positioning and
store-listing copy: docs/branding.md (pains → positioning → CWS title/description).

Infrastructure:
- [ ] Push repo to GitHub (prerequisite for drift-watch CI)
- [ ] Drift-watch CI: doc-watch job (auto-Issues on upstream changes; can precede M0)
- [ ] Drift-watch CI: calibration job (needs the M0 harness)

Scaffold debts:
- [x] UI icons: own MDI sprite (`npm run build:icons` → `src/assets/icons-sprite.svg`,
      currentColor for both themes; extend the manifest in `scripts/build-icons.mjs`)
- [ ] Toolbar/store PNGs (16–128) are still RI placeholders — own art before M1.5
- [ ] Locales: only en + ru seeded; extend to RI's 7 before public release
