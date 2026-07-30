---
name: browser-use
description: Playwright browser usage — console/result mode vs UI/user-in-the-loop. Apply when driving a real browser (auth, forms, UI verification), not headless scraping.
---

# browser-use

Two modes — pick by who must act. (Headless scraping for research is `search-escalation`.)

## Console mode — agent drives, the user sees only the result
The agent runs the work through the browser (e.g. `browser_evaluate` with inline JS: fetch
an authed endpoint, read the return value / console). The user sees the outcome, not the steps.

- Use for: authed reads, verification, an action under a session/fingerprint-bound auth.
- Authed/session work goes through the user's **already-logged-in browser**, NOT curl (an
  agent-shell curl fails fingerprint/cookie checks → 401). No secret or token is passed to the agent.

## UI mode — agent prepares, the user commits
A visible browser; the agent acts on the page like a user.

- The agent **fills form fields from prepared data** (the tedious part).
- [CRITICAL] **Passwords and secrets: the user types them.** The agent never enters or reads a password.
- The agent fills, then **waits** — the **user clicks submit / the final button**. The agent
  does not commit a consequential action itself (submit, pay, delete, deploy); it stages it
  and hands the click to the user.

## Before any action
- Confirm destructive operations (delete, bulk, deploy, pay) with the user; use dry-run where available.
- Log the result in the conversation (audit trail).
- Endpoint, auth, and account specifics are project-specific — see the project, not this rule.

## Cost & limits (Playwright MCP)
Each step is an API call, so a multi-step flow is token-heavy (a full scenario can run 100K+ tokens);
there are no built-in asserts or retry, and the accessibility tree may not match the visual state.
Use the browser for interactive work, verification, and **smoke** testing — not large regression
suites (for CI use a real test runner like Playwright Test, not the MCP). Structured UI / E2E testing
— read-only, UI-only (no direct API), screenshot per step, pass/fail report — → the `e2e` agent.
