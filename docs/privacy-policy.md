---
title: Privacy Policy - Agent Readiness Inspector
permalink: /privacy/
---

# Privacy Policy - Agent Readiness Inspector

Last updated: August 2, 2026

Agent Readiness Inspector is a browser extension for Microsoft Edge, Google
Chrome, and Mozilla Firefox. It audits websites against open standards used by
AI agents.

**The developer, 301.st, does not collect, receive, sell, or use your browsing
data. The extension processes audit data in your browser, and transfers none of
it to any third party.**

## Data the extension handles

To perform its user-facing audit, the extension handles:

- the URL and origin of a site you choose to scan;
- HTTP response status, headers, and up to 512 KB of response text from the
  audited site;
- scan verdicts, scores, and timestamps;
- sites you save, monitoring alerts, and extension settings.

The extension does not include analytics, advertising, telemetry, crash
reporting, tracking identifiers, or remotely hosted code.

## Local storage and retention

Data is stored only in the browser profile:

| Data | Purpose | Retention |
|---|---|---|
| Saved site origins | Dashboard, batch scans, and monitoring | Until you remove the site |
| Scan history for saved sites | Trends and regression detection | Latest 50 scans per site |
| Monitoring alerts | Local alert inbox | Latest 50 alerts |
| Settings | Your selected checks and preferences | Until changed or the extension is removed |
| Session score cache | Avoid repeated scans while browsing | Up to 100 origins; entries expire after 10 minutes and the cache ends with the browser session |

A manual scan of an unsaved site does not create persistent scan history.
Removing a saved site removes its history and related alerts. Uninstalling the
extension removes its local data.

## Network requests

### The site being audited

The audit consists of HTTP requests to the site you selected. Public machine
files such as `robots.txt`, sitemaps, and `/.well-known/` resources are fetched
without cookies. The site's root page and its markdown variants may be fetched
with the current browser session so the audit can reflect authenticated pages.
Response data is evaluated locally and is not sent to 301.st.

Requests may also occur later when you explicitly put a saved site on watch,
or while browsing if you enable the off-by-default auto-scan setting. A site
receives normal network information such as your IP address and request
headers. If the site redirects a request, the browser follows that redirect.
The destination site's own privacy policy applies.

### DNS lookups

One check, DNS-AID, asks whether a site publishes `_index._agents` SVCB records
and whether that answer is DNSSEC-validated. Browsers expose no DNS API, so the
extension performs this as a DNS-over-HTTPS request to Cloudflare's public
resolver at `cloudflare-dns.com`. The resolver receives the queried name — the
audited hostname prefixed with `_index._agents` — and ordinary request metadata
such as your IP address. It receives no page content, no cookies, and nothing
about what you were reading. Cloudflare's privacy policy governs its processing.

### Removed: Cloudflare URL Scanner comparison

Earlier versions offered an optional comparison that sent an API token, Account
ID and target URL to `api.cloudflare.com`. That feature was removed in v0.1.1,
along with Firefox's `authenticationInfo` and `browsingActivity` data
permissions, which existed only to serve it. Any credentials a previous version
stored are deleted when this version first runs.

### Links opened by you

The extension contains links to standards documentation, GitHub, and 301.st.
They open only when you select them. The destination's privacy policy applies.

The extension sends no analytics and makes no install or update tracking request
to 301.st. When you uninstall the extension, the browser opens the visible
`301.st/contact` feedback page with campaign parameters identifying the extension
and the uninstall action. No scan results, saved sites, settings, or unique user
identifier are included in that URL. The destination receives the ordinary
request information described above under "Links and third-party destinations."

## Permissions

- **Access to websites (`<all_urls>`)**: required to audit whichever HTTP or
  HTTPS site you choose, read its response headers, and fetch its machine files.
  The extension does not inject promotional content into pages.
- **Storage**: keeps settings, saved sites, local history, alerts, credentials,
  and the short-lived session score cache.
- **Alarms**: schedules rescans only for sites you put on watch.
- **Side panel** (Edge and Chrome): displays the audit next to the current tab.
- **Notifications** (optional): shows a browser notification for a detected
  regression. Monitoring still works through the local inbox if declined.

## Sharing, sale, and human access

301.st has no server receiving extension audit data and cannot access data in
your browser profile. We do not sell user data or use it for advertising,
creditworthiness, or any purpose unrelated to the extension's single purpose.
No person at 301.st can read your scan data.

The extension's use of information received from browser APIs complies with
the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Your controls

You can remove a saved site and its history, clear monitoring alerts, disable
watch or auto-scan, revoke optional permissions in the browser, or uninstall the
extension to remove all extension data.

## Children

The extension is a developer and webmaster tool and is not directed at
children.

## Changes

Material changes will appear on this page with a new date. Changes that affect
data leaving the browser will also be disclosed in the extension UI or release
notes as required.

## Contact

Questions: [301.st/contact](https://301.st/contact)
Issues: [github.com/investblog/agent-readiness-inspector/issues](https://github.com/investblog/agent-readiness-inspector/issues)
