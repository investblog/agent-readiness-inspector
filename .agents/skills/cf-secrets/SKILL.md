---
name: cf-secrets
description: Manage Cloudflare Workers secrets via wrangler — list / put / rotate / distribute / check. Apply when adding, rotating, distributing, syncing, or auditing a Cloudflare Worker secret.
---

# cf-secrets

Procedure for Cloudflare Workers secrets. Extends the `secrets` rule (principle) and
`cf-wrangler`. Project-specific data — the secret→worker map, account id, worker config
paths — lives in the project (a project copy of this skill or `./.agents/REGISTRY.md`),
NOT here.

## Sources of truth

- **`wrangler secret`** — the real values in the Worker runtime (prod).
- **`.dev.vars`** (gitignored) — local desired state; the sync source for `wrangler dev`.
- *(optional)* **`.secrets`** (gitignored) — operational reference for manual admin ops,
  not deployed. Whether a project uses it is the project's choice.

Invariant: `.dev.vars` ↔ `wrangler secret` should match by key list (verify with `check`).
A project with multiple Workers reads `.dev.vars` per Worker dir and uses one `--config`
per Worker.

## Auth (check before any prod op)

- OAuth (`wrangler login`) — beware: a different CF account may be logged in on the machine.
- Scoped API token: `export CLOUDFLARE_API_TOKEN=…` (Workers Scripts Read+Edit, account-scoped) —
  the path for prod when OAuth points elsewhere.
- `npx wrangler whoami` → confirm the expected `account_id` before acting.

## Subcommands

### list
Show names only — **never values**. Per Worker config, then diff against `.dev.vars` keys.
```bash
for cfg in <worker configs>; do
  echo "=== $cfg ==="; npx wrangler secret list --config "$cfg"
done
```

### put NAME
Add a secret to the target Worker(s). **Confirm first**: name, target Workers, and source —
`generate` (`openssl rand -hex 32`), `from-env` (read existing `.dev.vars`), or `provide`
(value via a secure channel, never chat).
```bash
# 1. value → temp file (never echo to stdout/chat)
openssl rand -hex 32 > /tmp/secret_val && chmod 600 /tmp/secret_val   # if generate
# 2. distribute per Worker via stdin pipe (NOT interactive — interactive leaks to shell history)
for cfg in <target configs>; do cat /tmp/secret_val | npx wrangler secret put NAME --config "$cfg"; done
# 3. cleanup
shred -u /tmp/secret_val 2>/dev/null || rm -f /tmp/secret_val
# 4. REDEPLOY (mandatory — a new version picks up the new secret); use the project's ship/deploy
# 5. if generated: append to .dev.vars via a script (no echo), with a purpose+date comment
# 6. verify: npx wrangler secret list --config <cfg> | grep NAME
```

### rotate NAME
Like `put`, plus: **extra confirmation** (can break running services). Two special cases:
- an **encryption key** that protects at-rest data (AES-GCM of stored tokens) → ❌ STOP: requires
  a re-encryption migration; do it via a plan/ADR, not this skill.
- a **session/JWT signing key** → rotation invalidates all active sessions (mass logout);
  no migration, but warn and rotate in a low-traffic window.
After redeploy the old version still serves the old value until cutover (short window).
Overwrite (not append) the value in `.dev.vars`.

### distribute NAME
The secret is already in `.dev.vars`; deploy it to **another** Worker.
```bash
grep "^NAME=" .dev.vars | cut -d= -f2- | tr -d '\n' > /tmp/secret_val
for cfg in <new target configs>; do cat /tmp/secret_val | npx wrangler secret put NAME --config "$cfg"; done
shred -u /tmp/secret_val   # then redeploy the targets
```

### check
Audit the sources of truth → a desync report (names only): in prod but missing from
`.dev.vars` (can't rotate), in `.dev.vars` but not deployed, undocumented. Report keys, never values.

## Critical rules

[CRITICAL] Never output a secret value to chat, console.log, an error message, or a commit.

- Never commit `.dev.vars` / `.secrets` / `/tmp/secret_*`.
- Never `wrangler secret put` interactively (value lands in shell history) — always stdin pipe.
- Never skip redeploy after put/rotate (the value won't be picked up).
- Never `wrangler secret delete` from prod without explicit user confirmation.
- Always `shred -u` (or `rm -f`) temp files; confirm with the user on any write.
