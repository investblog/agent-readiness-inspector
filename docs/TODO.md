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
      - [x] Firefox UX debt — the premise was wrong and the real bug was next
        door. Checked 2026-08-06: the Firefox build is MV2 with `<all_urls>` in
        REQUIRED `permissions`, granted at install, so `tab.url` is fine and the
        planned permissions.request() flow for host access was never needed.
        What IS Firefox-only is the data-collection consent (gecko 140+), and it
        was broken: `permissions.request()` "can only be made inside the handler
        for a user action", and the Verify-and-save handler awaited storage —
        and then `contains()` — before asking. The gesture was gone by then, the
        request failed, and the user was told they had denied a prompt Firefox
        never showed. Reported from a live Firefox install with the panel open.
        Fixed the same way the welcome CTA was: the answer to "already granted?"
        is cached at page load, `ensureCfDataPermission()` is deliberately NOT
        async so `request()` runs in the click's own task, and the handler reads
        the stored token from the in-memory creds instead of awaiting storage.
        Third instance of one bug family now — worth remembering that any
        permission or panel API is gesture-bound and must precede every await.
      - [x] Session indicator — DONE 2026-08-07, but answering a narrower
        question than the item asked for, on purpose. "Are third-party cookies
        blocked" needs the `cookies` permission to answer properly, and it is
        not what the user needs to know. What the panel CLAIMS is that the page
        is fetched with your cookies so a site behind a login is graded
        honestly, and that claim went unverified on every scan while the
        protocol field answered `unknown` — an honesty claim nobody checks is
        the exact thing this tool exists to complain about.
        So the page is now fetched twice, with credentials and without, and the
        two are compared. Status difference or a different landing URL is the
        strong signal; a body-size difference counts only above 10%, because
        nonces, CSRF tokens and timestamps make any two fetches differ a little.
        When nothing differs the verdict is `none`, never `blocked`: no session
        and a suppressed session look identical from here, and only one of them
        is a defect — naming a cause we cannot see would be inventing one.
        The line shows in the panel only when it says something. Seven tests,
        verified by disabling the landing-URL comparison — that test alone went
        red. Cost: one extra request to the audited origin per scan.
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
        - [x] The Firefox job DOES run on `stores=all` via workflow_dispatch,
          confirmed by that run. Intended — releases normally go to all three at
          once — but the comment in geo-tier-builder's store-submit.yml claimed
          no caller can auto-submit Firefox, which is only true of tag pushes.
          Corrected there (2eef207) and in this repo's Cut release input, which
          said "Firefox stays manual" above a dropdown offering `all`. The same
          wording is still in the other nine callers.
      - [x] MCP Server Card follows the AI Catalog first — DONE 2026-08-06,
        after SEP-2127 split discovery on 2026-08-03 (surfaced by drift-watch:
        the proposal dropped "via .well-known" from its own title). The card
        moved out of .well-known to sit beside its server, so all five paths we
        probed became de-facto overnight, the two Cloudflare probes included.
        `/.well-known/ai-catalog.json` is now a PROBE, deliberately not a scored
        check: the composite mirrors CF's matrix and a new check would move every
        score. Because a card's address is only known after the catalog is read,
        the probe layer gained a second, dependent round (`runFollowUps`) driven
        by a pure extractor (`cardRefsFromCatalog`) — the engine still does no
        I/O. A catalog naming a card that does not resolve now FAILS instead of
        quietly falling through to the old paths: an unkept promise about an
        address is worse than no catalog. Old paths still pass, labelled
        "outside the current spec". Four new tests, and they were verified by
        breaking the media-type constant — exactly the three catalog tests went
        red.
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
      - [x] Footer GitHub link carries the mark — DONE 2026-08-06. `github`
        added to the sprite manifest (24 icons now), rendered in the popup,
        welcome and dashboard footers. The dashboard had no GitHub link at all
        and got one; its footer became a flex row, because two links with no gap
        read as one run-on label. Welcome needed the same gap on
        `.welcome__social-link`. The other half of the question is DECIDED
        AGAINST: the rate link gets no store glyph. Its label already names the
        store ("Rate us · Chrome Web Store"), and the three marks are vendor
        trademarks that are not in @mdi/svg — a glyph would cost licence
        questions to repeat what the words say.
      - [x] Store banner 1400×560 built from the mascot:
        store-assets/promo-marquee-1400x560.png
- [x] M2 — dashboard: saved sites, batch, history, light CF Connect + external
      scan diff — DONE 2026-07-30 (plan: .agents/plans/done/m2-dashboard.md)
      - [x] External scan — REMOVED 2026-08-07 rather than fixed. Running it
        live found that the data it needed does not exist on any surface we can
        reach, and asking whether the feature was worth having answered itself.
        - Three ways checked before deciding: the URL Scanner API result
          carries no agent-readiness data at all; the public Radar report has no
          Agent Readiness tab; the authenticated dashboard does not have one
          either on this account. The strings and an AGENT_READINESS flag are in
          the dashboard bundle, so the feature exists — it is simply not
          reachable here, and guessing at a rollout is not a product plan.
        - The deeper reason is not the data, though. Diffing our verdict against
          a competitor's makes theirs the authority, and the source we would
          have imported is one our own write-ups document as probing paths the
          specification abandoned. The last word should be ours.
        - Removed: CF Connect settings, token storage and verification, the
          external diff UI, `cf-api.ts`, and Firefox's `authenticationInfo` /
          `browsingActivity` data permissions, which existed only for this.
          Storage went to v4 — the first migration that DELETES: stored
          credentials are wiped on upgrade, because a token whose feature is
          gone is pure risk. The privacy policy is updated accordingly; it is a
          published document and described a transfer that no longer happens.
        - Kept: the calibration vocabulary in `shared/diff.ts`, which is what
          the weekly drift-watch job uses. Comparison belongs in CI, for us —
          not in the user's report, showing someone else's number beside ours.
        - No replacement link to isitagentready.com either: it is a competitor,
          not a neutral reference.
- [ ] M2.5 — repair kits: SKILL.md + stack recipes + verify loop (spec §8.0; content work, parallelizable)
- [x] M3 — watch: alarms + diff + regression notifications — DONE 2026-07-31
      (plan: .agents/plans/done/m3-watch.md)
- [x] M3.5 — icon as a surface: score of the current tab while browsing (opt-in
      auto-scan) + unread monitoring count, precedence alert > score — DONE
      2026-08-02 (plan: .agents/plans/done/m3.5-ambient-badge.md)
      - [x] The score on the icon no longer needs the panel open — DONE
        2026-08-06, all three parts. The badge is seeded from stored history for
        SAVED sites (`src/background/stored-score.ts`), which costs no request
        and stays inside the privacy rule — doing it for every origin visited
        would turn the icon into a record of browsing. Tab activation repaints
        from that seed. Onboarding now names the auto-scan switch and says why
        it is off.
        A seeded number is dated in the tooltip rather than shown bare: badge.ts
        holds that a stale number is worse than none, and undated history IS
        stale. Anything older than the session cooldown must have come from
        storage (the cache drops expired entries), which is the whole test for
        "seeded". Seven tests; one of them caught the author, not the code —
        79 is a level-4 composite, because the L5 floor is 80, the very boundary
        Cloudflare's two surfaces disagree about.
- [ ] M4 — fix-apply (spec §8.1). The "full CF Connect wizard" half is moot:
      CF Connect was removed 2026-08-07, so M4 is fix-apply alone unless a
      reason to talk to Cloudflare reappears.
- [ ] M5 — 301.st layer: cross-promo, spintax.net as living reference
      - [x] 301.sh feed — DONE 2026-08-06. Posts are filed in the SAME inbox as
        regressions rather than getting a surface of their own, so there is one
        unread count and the toolbar badge already covers them with no change to
        the precedence rule. Opt-in and silent until then: no alarm and no
        request while it is off. Enabling seeds the seen-set instead of filing
        the backlog — seventeen unread items on switch-on reads as spam and
        would bury a real regression sitting beside them. The seen-set is
        separate from the inbox because the inbox is capped and dismissable, and
        "have we filed this" must outlive both. Notifications stay optional
        decoration: the inbox entry is what everyone gets, exactly as with
        regressions. Ten tests, and two real defects came out of writing them —
        the seen-set was stored newest-first, so its FIFO cap would have dropped
        the newest slugs and re-filed them forever, and the feed validator only
        ran on the network path, so anything else feeding the cycle bypassed it.
- [ ] M5 — feed follow-ups: a post older than the install is never shown (by
      design); consider surfacing the last few on enable behind an explicit
      "catch me up" instead of the current silent seed

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
