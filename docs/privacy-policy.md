# Privacy Policy — Agent Readiness Inspector

_Draft for M1.5. Publish at a stable URL (301.st page or GitHub Pages) and link
it from both store listings. Last updated: 2026-07-31._

**Short version: the extension does not collect, transmit or sell your data.
Everything it produces stays in your browser.**

## What the extension does

Agent Readiness Inspector audits websites against open, published standards for
AI agents (robots.txt, sitemaps, Link headers, markdown content negotiation,
Content Signals, MCP server cards, API catalogs, OAuth discovery and similar).
The audit is a set of ordinary HTTP requests to the site you are auditing,
performed by the extension itself.

## What we collect

**Nothing.** There is no analytics, no telemetry, no crash reporting, no
identifiers, no ad or tracking code, and no server operated by us that receives
your data. We cannot see which sites you scan.

## What is stored, and where

All of it is stored locally in your browser (`chrome.storage.local`) and never
leaves your device except as described in "Network requests" below:

| Data | Why | Retention |
|---|---|---|
| Sites you explicitly save | so the dashboard can list and rescan them | until you remove the site |
| Scan history for saved sites (score, level, per-check pass/fail) | to show trends and detect regressions | last 50 scans per site, oldest dropped |
| Your settings (optional checks, watch interval, notification preference) | to keep your choices | until changed |
| A Cloudflare API token, only if you add one | to run the optional external scan | until you disconnect it |

Scanning a page from the panel does **not** record history: history is written
only for sites you deliberately saved. Removing a site deletes its history with
it. Uninstalling the extension removes everything.

## Network requests

The extension makes requests only to:

1. **The site being audited** — the audit itself. Requests for public machine
   files (`/robots.txt`, `/.well-known/*`, sitemaps) are sent **without**
   cookies. The page itself may be re-fetched **with** your cookies so the audit
   reflects what you actually see, including pages behind a login; that content
   is used for the verdict and is not stored beyond the scan.
2. **api.cloudflare.com** — only if you connect a Cloudflare token and press
   "external scan". This asks Cloudflare's URL Scanner to audit the same site
   from outside so the two views can be compared. Cloudflare's handling of that
   request is governed by their own privacy policy.

No other destination is contacted. There is no "phone home" on install, update
or scan.

## Permissions, and why each is needed

- **Host access to websites** — the audit is HTTP requests to the site you
  choose; without it the extension cannot read `robots.txt` or a site's headers.
  It is never used to inject anything into pages or to read page content beyond
  the audited responses.
- **storage** — keeps saved sites, history and settings on your device.
- **alarms** — schedules rescans for sites you put on watch.
- **notifications** _(optional, asked only when you enable watch alerts)_ —
  shows a message when a previously passing check starts failing. Declining it
  leaves watch mode working silently.

## Your data, your control

Saved sites and their history can be deleted individually from the dashboard,
and everything disappears when the extension is uninstalled. There is nothing
for us to delete on request, because we never receive anything.

## Children

The extension is a developer/webmaster tool and is not directed at children.

## Changes

Material changes to this policy will be reflected here with a new "last updated"
date, and — where the change affects what leaves your browser — called out in
the extension's release notes.

## Contact

Questions: [301.st/contact](https://301.st/contact) ·
Issues: [github.com/investblog/agent-readiness-inspector/issues](https://github.com/investblog/agent-readiness-inspector/issues)
