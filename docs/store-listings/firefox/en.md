# Agent Readiness Inspector

## Summary

Audit sites for AI-agent readiness: robots.txt, llms.txt, Markdown negotiation, MCP, Content Signals. Local, no analytics.

## Description

**See what AI agents can actually discover, read, and use on the current site.**

Agent Readiness Inspector runs 22 standards-based checks directly in Firefox:

- robots.txt, sitemap, and AI crawler rules
- llms.txt and markdown negotiation
- Content Signals and Web Bot Auth
- Link headers, Agent Skills, and API Catalogs
- MCP Server Cards, OAuth discovery, and WebMCP
- emerging agent-commerce protocols

Every scan includes a comparable score and readiness level, raw evidence for
each verdict, and prioritized fix prompts you can copy into a coding agent.

Use the toolbar popup for a quick scan or open the same report in the Firefox
sidebar. Save sites to build local score history, scan several sites from the
dashboard, and put selected sites on watch. Monitoring records regressions in a
local inbox; browser notifications are optional.

Because the audit runs inside Firefox, it can inspect staging sites and many
authenticated pages that an external scanner cannot reach. Firefox privacy and
cookie protections may limit session access on some sites.

### Repair kits

A failed check comes with the fix: what the standard requires, the change for
the stack the site appears to run on (Cloudflare, Vercel, Netlify, nginx,
Next.js), and the one command that proves it landed.

### Privacy

Website URLs and response content are handled only to produce the audit.
Results, saved sites, history, settings, and alerts remain in local Firefox
extension storage. 301.st receives no scan or browsing data. There is no
analytics, telemetry, advertising, or remotely hosted code. The extension
declares no data collection. One check reads DNS, asking a public
DNS-over-HTTPS resolver whether the audited hostname publishes agent-discovery
records.

The extension needs access to websites because its single purpose is to audit
any HTTP or HTTPS site you choose. It does not inject content into visited
pages.

Agent Readiness Inspector is an independent implementation of open web
standards. It is not affiliated with or endorsed by Cloudflare.
