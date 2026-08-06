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
      - [x] Welcome CTA opens the side panel as well as the reference site —
        DONE 2026-08-05 (src/entrypoints/welcome/main.ts). The first run used to
        show spintax.net with the panel shut, i.e. the page and none of the
        product. Both APIs are gesture-bound, confirmed against the docs rather
        than from memory: Chrome "This may only be called in response to a user
        action" (open() is Chrome 116+, takes tabId or windowId, at least one);
        Firefox "only ... from inside the handler for a user action". So the
        window id is resolved at page load — awaiting it inside the click would
        spend the gesture — and openPanel() runs before the awaited tabs.create.
        Chromium and Firefox are told apart by feature detection, not BROWSER.
        Verified: typecheck, Biome, 254 tests, both builds, and the shipped
        welcome chunk carries both API names with the calls in the right order
        (`()=>{E(),o.tabs.create(...)}`). NOT yet verified in a running browser —
        load dist/chrome-mv3 unpacked and click the CTA once before release.
        Still open, and pairs with this: the M3.5 onboarding item below.
      - [ ] Firefox UX debt: host permissions are opt-in there → tab.url is
        undefined until granted; add permissions.request() flow + FF-specific
        error copy before the next Firefox update (M1-b review debt)
      - [ ] 3P-cookie block detection → session indicator (protocol field
        `session` already reserved)
      - [x] Auto-submit secrets: all 10 set 2026-08-06 and validated end to end.
        The three per-extension identifiers are derived in
        docs/store-listings/submission-guide.md; Edge's did NOT need approval,
        Partner Center issues the Product ID when the submission is created. The
        seven account-level credentials had to come from their original source:
        they exist in the other nine extension repos but cannot be read back out
        of any of them, because GitHub never discloses a secret's value.
        Verified by a dry run rather than by assuming (run 31100568253,
        `stores=all`, `dry_run=true`): chrome, edge and firefox all green, and
        the log shows `DRY RUN: Skipped upload and publishing`, so no AMO version
        number was spent. Note `tag=main` — the only tag is v0.1.0, which
        submit.yml deliberately skips, and `tag` is just a checkout ref.
        - [ ] The Firefox job DOES run on `stores=all` via workflow_dispatch,
          confirmed by that run. Intended — releases normally go to all three at
          once — but the comment in geo-tier-builder's store-submit.yml claims no
          caller can auto-submit Firefox, which is only true of tag pushes. Fix
          the comment there so the next reader is not misled.
      - [ ] Next release waits for Edge and then ships all three in one pass
        (decided 2026-08-06). Nothing shipped since v0.1.0 is urgent, and one
        pass keeps the three listings on the same version. When Edge approves:
        fill its store link, bump the version in package.json +
        package-lock.json + wxt.config.ts, then Cut release with `all`.
      - [ ] Store links: Chrome and Firefox filled in store-links.ts 2026-08-06,
        both reviews pages verified 200; Edge still in review, its URL stays
        empty so getStoreInfo() keeps that link hidden. Close when Edge lands.
        Edge does get its own build (`npm run build:edge`), so BROWSER is 'edge'
        there and it will never show the Chrome link.
        - [x] Do it per store the moment that store approves, not in one batch
          after all three: the review link is what collects ratings, and the
          first days after publication are when the traffic is there.
          getStoreInfo() returns null while the URL is empty, so the footer
          link simply stays hidden until then — no release is blocked by a
          store that is still in review.
        - Both point at the store's REVIEWS page rather than the listing, since
          the link reads "Rate us". This differs from redirect-inspector, which
          deep-links reviews on Chrome but uses the plain listing on AMO.
      - [ ] Footer GitHub link has no icon while everything beside it does
        (301.st carries its logo): add `github` to the sprite manifest in
        scripts/build-icons.mjs, rebuild with `npm run build:icons`, and render
        it via icon('github', …) in the popup and welcome footers
        (src/entrypoints/popup/index.html, src/entrypoints/welcome/index.html —
        both are plain-text "GitHub" today). Same pass should decide whether
        the rate link gets a store glyph and whether the dashboard footer,
        which has no GitHub link at all, should get one.
      - [x] Store banner 1400×560 built from the mascot:
        store-assets/promo-marquee-1400x560.png
- [x] M2 — dashboard: saved sites, batch, history, light CF Connect + external
      scan diff — DONE 2026-07-30 (plan: .agents/plans/done/m2-dashboard.md)
      - [ ] Verify the external scan live: needs a Cloudflare token with
        `URL Scanner: Edit` (only DoD item left open in M2)
- [ ] M2.5 — repair kits: SKILL.md + stack recipes + verify loop (spec §8.0; content work, parallelizable)
- [x] M3 — watch: alarms + diff + regression notifications — DONE 2026-07-31
      (plan: .agents/plans/done/m3-watch.md)
- [x] M3.5 — icon as a surface: score of the current tab while browsing (opt-in
      auto-scan) + unread monitoring count, precedence alert > score — DONE
      2026-08-02 (plan: .agents/plans/done/m3.5-ambient-badge.md)
      - [ ] The score on the icon appears only after something scans that tab,
        and with auto-scan off (the default) the side panel is the only thing
        that does — dashboard scans carry no tabId, so they paint nothing.
        Reported as "the counter only works with the side panel open".
        Candidate fixes: seed the badge from stored history for saved sites (no
        traffic), repaint on tab activation from that seed, and surface the
        auto-scan switch during onboarding. The unread-alert count does NOT
        have this problem — it is painted from storage by the background and is
        covered by the live smoke with no panel open.
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
