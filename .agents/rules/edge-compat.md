---
name: edge-compat
description: Cloudflare Workers runtime constraints. Apply when writing or reviewing runtime code for CF Workers/Pages.
---

# edge-compat

Runtime code that reaches a CF Worker (incl. via an adapter like `@astrojs/cloudflare`) must
be edge-compatible. Build-time code (config, integrations, build scripts) may use Node. The
runtime vs build-time zones are project-specific — if unsure, treat the code as runtime.

## Forbidden in runtime
- Node APIs: `fs`, `path`, `process`, `child_process`, `os`, `net`, `http`, `https`, `stream`.
- The Node `crypto` module; `Buffer` (without an explicit polyfill); `__dirname`/`__filename`; dynamic `require()`.
- `process.env.<NAME>` in runtime (Node-only) — read bindings via the runtime env instead.
- Dependencies that pull any of the above internally.

## Allowed
- `crypto.subtle` (Web Crypto), `crypto.getRandomValues`.
- `fetch` / `Request` / `Response` / `URL` / `URLSearchParams`, `TextEncoder` / `TextDecoder`.
- Edge-compatible npm packages — the marker is `"workerd"` / `"edge-light"` / `"worker"` in the
  package `exports`/`engines`, or a stated edge compatibility.

## Bindings
- Access via the runtime env binding (e.g. `Astro.locals.runtime.env.<NAME>`), not `process.env`.
- Binding types come from generated typings (`wrangler types`) — do not hand-edit.

## Checks
- Vet a new package's edge-compatibility **before** installing (ties to `env-setup`).
- A prod build failing on a Node-only API means something Node-only reached runtime — fix it, don't silence it.
