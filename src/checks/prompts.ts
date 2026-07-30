// Fix-prompt library v1 — keyed by check.id (spec §8). Short prompts only;
// the full repair kits (SKILL.md + stack recipes) are M2.5 content (spec §8.0).

import type { CheckId } from './config';

const DEFAULT_PROMPT =
  'This agent-readiness check failed. Read the linked standard and implement it for this site, ' +
  'then re-run the scan to confirm the check passes.';

export const FIX_PROMPTS: Partial<Record<CheckId, string>> = {
  robotsTxt:
    'Add a robots.txt at the site root (RFC 9309). Include explicit user-agent blocks for AI agents ' +
    '(GPTBot, ClaudeBot, etc.) stating what they may crawl, and reference your sitemap.',
};

export function fixPrompt(id: CheckId): string {
  return FIX_PROMPTS[id] ?? DEFAULT_PROMPT;
}
