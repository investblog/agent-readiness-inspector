---
name: cf-auth
description: Cloudflare API auth — 3 channels, do not confuse them. Apply before any Cloudflare API or wrangler operation.
---

# cf-auth

Three ways to authenticate to the CF API, each with its own scope / risk / use. Pick the
channel BEFORE the request. A wrong auth header returns `1000` / `9109` / `10000` — that is
not a broken key, it is the wrong channel. Account ids, DB names, endpoints are project-specific.

## 1. wrangler (OAuth session)
- Scope: the ONE logged-in platform account. Auth: `wrangler login` (OAuth). Verify: `wrangler whoami`.
- Use: deploy platform workers, D1 on platform DBs (`wrangler d1 execute`), `wrangler secret put`, KV.
- Don't: use against another account → `10000` (wrangler is not cross-account).
- Risk: low (dashboard-logged; session rotates on `wrangler logout`).

## 2. Global API Key (X-Auth headers)
- Scope: ALL of the owner-user's accounts. Auth: `X-Auth-Email` + `X-Auth-Key` headers (NOT Bearer).
- Use: ad-hoc one-off diagnostics on a client account — a **targeted `account_id` is mandatory** (no sweeping).
- Don't: regular ops (build a backend endpoint with an account token, channel 3); a Bearer header (→ 401);
  `/user/tokens/verify` (a Global Key returns `1000` there — verify via `GET /user`); `dash.cloudflare.com/*`
  via curl (UI → 403). A safety classifier may block Global-Key use as "credential exploration" — a
  targeted single-account request + an explicit permission allow pass it.
- [CRITICAL] Risk: HIGH — blast radius = every account of the user. Treat it as a root credential;
  `shred -u` temp files; never echo the value (key-name only via `awk -F=`). See `secrets`.

## 3. Scoped Bearer Token (per account)
- Scope: ONE account. Auth: `Authorization: Bearer <token>`. Account-scoped, phased permissions
  (Workers Scripts:Edit, D1:Edit, …); store encrypted, never plain outside the runtime.
- Use: backend/regular ops acting for one account (create D1, deploy, migrate, verify a token via
  `/user/tokens/verify`).
- Don't: cross-account ops (scoped to one account_id); materialize the token in chat.
- Permissions are **per-resource**: a token may list zones yet be denied their DNS records —
  "zones visible" is not evidence of DNS access. Probe the specific permission before relying on it.
- Risk: low when the token never leaves its runtime; rotate in the CF dashboard.

## Error code → channel
- `1000` on `/user/tokens/verify` → NOT proof of a Global Key: **account-owned** tokens also return
  `1000` there while working as Bearer everywhere else. Verify a token by a probe call it should
  permit (e.g. list the target resource); reserve X-Auth on `/user` for a suspected Global Key.
- `9109` → the token's scope is wrong for this endpoint (check scope).
- `10000` on `/accounts/{id}/*` → auth not allowed for this account_id (wrong account, or wrong login).
- `403 Challenge` on `dash.cloudflare.com/*` → that's the UI; switch to `api.cloudflare.com`.

## Anti-patterns
- Bearer on a Global API Key → `1000`/`10000` (wrong format).
- `dash.cloudflare.com/*` via curl → 403 (UI, not API).
- wrangler with a foreign `account_id` → `10000`.
- Spending 30 min guessing auth formats — ask the user for the shape, or one retry on the second format, then stop.
- Reading secrets without an explicit scope; echoing secret values. See `secrets`.
