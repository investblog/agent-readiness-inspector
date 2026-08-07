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
      - [ ] Edge API credentials are INVALID — found 2026-08-07 on the first
        real call ever made to that API (v0.1.0 was submitted by hand). The
        upload answered 401 "API Key is Invalid" on
        `v1/products/{id}/submissions/draft/package` after the token step
        "succeeded". It succeeded because Edge's getToken() in
        publish-browser-extension performs NO network call — it wraps the API
        key in an object — so `dry_run=true` can never validate Edge, and the
        2026-08-06 dry run that reported all three green was, for Edge,
        meaningless. Needs a human in Partner Center: check whether the API key
        expired or was rotated, regenerate it, and update the EDGE_API_KEY
        secret. Chrome and Firefox creds are unaffected.
      - [ ] Release v0.1.1 — UNBLOCKED 2026-08-07. Edge approved, its link is
        in, the version is already bumped in all three files, and the three
        builds are green. Remaining: `Cut release` with `submit=all`. Note that
        `all` DOES submit Firefox (confirmed by the 2026-08-06 dry run) and AMO
        burns the version number whether or not the release is later pulled —
        so this is the irreversible step, not the tag.
      - [x] Store links — COMPLETE 2026-08-07, Edge approved and filled in.
        Chrome and Firefox point at their reviews pages; Edge points at the
        listing because it has none — `/reviews` there answers 200 with an empty
        shell, which is exactly how a status-code check gets fooled, so it was
        verified by looking for the extension name in the HTML. Each build
        carries only its own link, confirmed in the three built packages.
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
- [x] M2.5 — repair kits — DONE 2026-08-07. Four top-fail checks
      (markdownNegotiation, linkHeaders, contentSignals, robotsTxtAiRules) with
      per-stack recipes, a verify command and the evidence it should print.
      Stack detected from headers we already read, and ALL matches reported: a
      Vercel app behind Cloudflare is both, and the fix goes in different files
      for each. Bundled rather than fetched from 301.st as the roadmap allowed —
      it is small text, and an optional network feature is the exact shape that
      cost this project three defects and a removal in one week.
      The verify loop earned its place immediately: run against a site that
      passes all four, the robotsTxtAiRules command printed nothing, because the
      validator also accepts a plain `User-agent: *` group while my command
      grepped for named crawlers. A reader passing via wildcard would have
      concluded the fix failed. Requirement and command both corrected against
      the validator. Eleven tests, including a content guard that every kit has
      a generic recipe and a runnable command.
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
- [x] M5 — 301.st layer — the two remaining pieces were already built and are
      confirmed in place 2026-08-07: the foldable 301.st block in the dashboard
      plus footer links across popup/welcome/dashboard, and spintax.net as the
      living reference in the welcome CTA and tips.
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
- [x] M5 — feed follow-up — DONE 2026-08-07, simpler than the "catch me up"
      button this line proposed. Enabling now files the single newest post and
      marks the rest seen. Zero new UI, and it fixes the real problem: filing
      nothing left a new subscriber with an empty inbox until the blog published
      again, which can be a week and is indistinguishable from a broken feature.
      One entry is not spam and shows the feature in the shape it will always
      take.

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
- [x] Locales — DECIDED 2026-08-07, and the decision is asymmetric. Store
      listings expanded to de, es, pt-BR, fr; the extension UI stays en + ru.
      A listing is bought once and moves store search, which is where the
      SEO/agency segment in branding.md actually looks; a UI locale is 136
      strings forever, multiplied by every string added later, and the
      indie-dev segment reads English anyway. There is still no demand signal
      to choose on — AMO showed 1 daily user three days after publication — so
      this is a bet, and the cheap reversible half is the one taken.
      The four are generated from one source per language by
      scripts/build-listings.mjs; `--check` runs inside `npm run check` and was
      verified by hand-editing a generated file. NOT native-reviewed.
      CORRECTION, same day: "the manifest is untouched" was wrong, and asserted
      without checking. The Chrome Web Store builds its localized-listing
      language menu from the `_locales` directories in the uploaded package —
      "Each item in the list corresponds to one of the _locales/LOCALE_CODE
      directories that you uploaded" — so the four listings had nowhere to go.
      The generator now also writes a SPARSE _locales/<lang>/messages.json with
      only extName and extDescription; both vendors document falling back to the
      default locale for every key a locale omits, so the UI stays English. The
      trade-off to know: a German user sees a German name and description over
      an English interface.
      SECOND CORRECTION, from comparing against redirect-inspector: `_locales`
      directories are named with an UNDERSCORE (`pt_BR`). The hyphenated one I
      shipped would simply not be found — the locale would not exist and its
      listing language would never appear, with nothing failing loudly. The
      listing FILES keep the hyphen, which is how the stores spell it. Turkish
      added while there, so the set now matches RI exactly: de en es fr pt_BR
      ru tr. Where we diverge from RI is deliberate: it translates all 106
      strings in all seven locales; we translate two and fall back, because
      this tool's readers are developers and SEO teams.
      - [ ] Expand the UI beyond en + ru only when installs name a language.
