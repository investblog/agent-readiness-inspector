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
data. The extension processes audit data in your browser. The only optional
third-party transfer is a Cloudflare URL Scanner request that you explicitly
enable and start.**

## Data the extension handles

To perform its user-facing audit, the extension handles:

- the URL and origin of a site you choose to scan;
- HTTP response status, headers, and up to 512 KB of response text from the
  audited site;
- scan verdicts, scores, and timestamps;
- sites you save, monitoring alerts, and extension settings;
- a Cloudflare Account ID and API token, only if you connect Cloudflare.

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
| Cloudflare Account ID and API token | Optional external scan | Until you disconnect Cloudflare or remove the extension |
| Session score cache | Avoid repeated scans while browsing | Up to 100 origins; entries expire after 10 minutes and the cache ends with the browser session |

A manual scan of an unsaved site does not create persistent scan history.
Removing a saved site removes its history and related alerts. Uninstalling the
extension removes its local data. Cloudflare credentials are stored in the
browser's local extension storage and are not separately encrypted by the
extension.

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

### Cloudflare URL Scanner (optional)

Cloudflare Connect is off by default. If you enter credentials and approve the
feature, the extension sends your Cloudflare API token to
`api.cloudflare.com` to verify it. When you press "External scan," it sends the
target URL and Account ID, authenticated by that token, to Cloudflare's URL
Scanner and polls Cloudflare for the result. Cloudflare therefore receives the
target URL, Account ID, API token, your IP address, and ordinary request
metadata. Cloudflare's privacy policy governs its processing.

In Firefox 140 and later, the extension also requests Firefox's optional
`authenticationInfo` and `browsingActivity` data permissions before making
these Cloudflare requests. Declining leaves all local auditing available.

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
No person at 301.st can read your scan data or Cloudflare credentials.

The extension's use of information received from browser APIs complies with
the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Your controls

You can remove a saved site and its history, clear monitoring alerts, disable
watch or auto-scan, disconnect Cloudflare, revoke optional permissions in the
browser, or uninstall the extension to remove all extension data.

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
