---
name: cf-free-tier
description: Verify live Cloudflare limits before designing on a CF service. Apply before any architecture or code decision that uses a CF service.
---

# cf-free-tier

[CRITICAL] Do NOT propose or build a feature on a CF service (Workers, Pages, D1, R2, KV,
Email, Stream, AI, Queues, Cron) from memory of its limits. LLM knowledge of CF limits is
systematically stale — quotas change, beta→GA moves features and pricing between plans.

Before any design decision or code:
1. **WebFetch** the live limits page: `developers.cloudflare.com/<service>/platform/limits/`.
2. **WebSearch** "Cloudflare <service> free tier <year>" if the page is incomplete.
3. Record the numbers with the source URL + date — in the discussion, the plan, or a code
   comment next to the binding/fetch.

Check per service: storage cap, request/op cap (day/month), Workers CPU time per request
(critical for architecture), bandwidth/egress, free-vs-paid feature gates, upgrade triggers.
The pattern choice (pre-signed URL vs worker proxy, etc.) depends on the actual limit — fetch first.

## Limits are inputs, not a mandate
Fetched limits inform the decision; they do NOT mean "design around the free plan". Compare the
ceiling to actual/projected usage and state the paid-plan cost next to it — the free-vs-paid choice
is the user's budget call, never a silent design constraint. (Real incident: an architecture was
rejected over a free-tier ceiling ~200× the project's traffic; the paid plan cost $5/mo.)
