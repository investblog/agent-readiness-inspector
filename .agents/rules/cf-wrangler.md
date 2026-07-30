---
name: cf-wrangler
description: Cloudflare via Wrangler + MCP. Apply when the project uses Cloudflare (Workers/Pages/D1/KV/R2).
---

# cf-wrangler

Cloudflare spans domains (TS → coding/web, Workers deploy → devops, D1 → db). One rule, one chain.

Two paths — split by purpose:

- management / queries (D1, KV) → Cloudflare MCP;
- deploy, local dev, migrations → `wrangler` CLI.

Access: pick the auth channel (OAuth / Global API Key / Scoped Bearer Token) per `cf-auth` —
a wrong header (`1000`/`9109`/`10000`) means the wrong channel, not a broken key. Always
`wrangler whoami` → verify `account_id` before a prod operation.

Chain: `wrangler` CLI + Cloudflare MCP (D1/KV/R2/Workers); language checks per the project's
`quality-*` rules. Token handling → see `secrets`.
