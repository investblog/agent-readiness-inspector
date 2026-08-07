![Agent Readiness Inspector](store-assets/promo-marquee-1400x560.png)

# Agent Readiness Inspector

Browser extension by [301.st](https://301.st) that audits websites for
AI-agent readiness. It runs 22 standards-based checks in the browser and shows
the score, evidence, and copy-ready fix prompts beside the current tab.

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/agent-readiness-inspector/diofmjhnegmcccocikabageabmaokobd) [![Firefox Add-ons](https://img.shields.io/badge/Firefox-Add--ons-FF7139?logo=firefox&logoColor=white)](https://addons.mozilla.org/firefox/addon/agent-readiness-inspector/) [![Edge Add-ons](https://img.shields.io/badge/Edge-Add--ons-0078D7?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/agent-readiness-inspector/jkhmlkoehfmmpgihkknnopanjcipmiho) [![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)

Chrome and Edge use a native side panel. Firefox provides the same interface as
a popup and sidebar. Because the audit runs in the browser, it can inspect
staging sites and many authenticated pages that external scanners cannot reach;
browser cookie protections may still limit session access on some sites.

Published in all three stores. Every submission uses the Linux-built packages
from the matching [GitHub Release](https://github.com/investblog/agent-readiness-inspector/releases)
— a locally built archive is never uploaded to a store.

## Features

- **22 readiness checks** - robots.txt and AI crawler rules, sitemaps, Link
  headers, llms.txt, Markdown negotiation, Content Signals, Agent Skills, API
  Catalogs, MCP Server Cards, OAuth discovery, Web Bot Auth, WebMCP, and
  emerging agentic commerce protocols.
- **Evidence and fixes** - every result includes the observed response and a
  copy-ready prompt for addressing failures.
- **Saved-site dashboard** - batch rescans, score history, sparklines, and
  optional-check settings.
- **Monitoring** - scheduled rescans, regression detection, a local alert
  inbox, and optional browser notifications.
- **Browsing controls** - optional automatic scans plus score and unread-alert
  badges on the toolbar icon.
- **Dark and light themes** with English and Russian UI.
- **Local-first storage** - scan results, saved sites, history, settings, and
  alerts stay in browser storage.

Agent Readiness Inspector is an independent implementation of open web
standards. It is not affiliated with or endorsed by Cloudflare.

## Install

| Browser | Link |
|---------|------|
| Chrome | [Chrome Web Store](https://chromewebstore.google.com/detail/agent-readiness-inspector/diofmjhnegmcccocikabageabmaokobd) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/agent-readiness-inspector/) |
| Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/agent-readiness-inspector/jkhmlkoehfmmpgihkknnopanjcipmiho) |

For development, load the unpacked target from `dist/` after running the
corresponding build command.

## Development

```bash
npm ci
npm run dev            # Chrome MV3 development mode
npm run dev:firefox    # Firefox MV2 development mode
npm run check          # TypeScript + Biome + Vitest
npm run zip:all        # Chrome, Firefox, Edge, and Firefox source ZIPs
```

Additional verification:

```bash
npx tsx scripts/e2e-smoke.mts  # live Chromium extension smoke test
npm run calibrate              # compare against the live reference scanner
node scripts/capture-fixtures.mjs
```

## Architecture

- `src/checks/` - pure TypeScript check engine with no DOM, browser API, or
  network access.
- `src/probe/` - service-worker probe layer for target requests, timeouts, and
  credential policy.
- `src/shared/` - storage, messaging, scoring, regression detection, i18n,
  theme, and icons.
- `src/entrypoints/` - background worker, popup/side panel, dashboard, and
  welcome screen.
- `ci/drift/snapshots/` - pinned upstream snapshots monitored by the scheduled
  drift workflow.

The production targets are Chrome MV3, Edge MV3, and Firefox MV2. The extension
uses WXT, strict TypeScript, Vanilla DOM, Biome, and Vitest, with no runtime npm
dependencies.

## Privacy

The extension has no analytics and sends no scan or browsing data to 301.st, and
saved data remains in local browser storage. Two requests go elsewhere, both
described in the privacy policy: a DNS-over-HTTPS lookup of the audited site's
`_index._agents` name, which the DNS-AID check needs, and — only if you switch
on the optional blog updates — a read of a public JSON feed on 301.sh.

User-selected links open their destination normally. After uninstall, the
browser opens a visible 301.st feedback page without scan results, settings, or
a unique user identifier in the URL. See the full
[privacy policy](docs/privacy-policy.md).

## Releasing

Release tags are created only by the `Cut release` GitHub Actions workflow after
the complete quality gate and all packages succeed on Linux. The workflow then
dispatches `Release`, which rebuilds the packages and attaches them to a GitHub
Release.

A locally built archive is never uploaded to a store: the working copy is
Windows, and a store package is the one artifact nobody re-reads before users
get it.

`Submit to stores` takes a `hold` option that uploads the package and stops,
leaving it as a draft for a human to publish. Use it whenever the listing needs
editing first — Chrome offers a listing language only once the uploaded package
contains that `_locales` directory. Firefox has no such state and spends the
version number on upload, so it goes last.

Both releases so far reached the stores by hand. `v0.1.0` predated the
automation; `v0.1.1` because the Edge API credential turned out to be invalid on
its first real use — see the backlog.

See [store submission guidance](docs/store-listings/submission-guide.md) for the
package map, listing copy, assets, privacy declarations, and required secrets.

## Related

- [Redirect Inspector](https://github.com/investblog/redirect-inspector) -
  real-time redirect analysis in the browser.
- [301.st](https://301.st) - domain operations, redirects, and traffic routing.
