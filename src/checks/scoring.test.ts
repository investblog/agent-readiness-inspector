import { describe, expect, it } from 'vitest';
import type { CheckId } from './config';
import { checkMeta } from './config';
import { scoreResults } from './scoring';
import type { CheckResult, CheckStatus } from './types';

function result(id: CheckId, status: CheckStatus): CheckResult {
  const meta = checkMeta(id);
  return {
    id,
    category: meta.category,
    standard: meta.standard,
    scored: meta.scored,
    status,
    evidence: 'test',
    fixPrompt: '',
    docUrl: meta.docUrl,
  };
}

// The spintax.net web-UI reference point (2026-07-30): categories
// 100/100/100/57, composite 79 = 11 passed / 14 applicable, Level 4-5 border.
const SPINTAX_LIKE: CheckResult[] = [
  result('robotsTxt', 'pass'),
  result('sitemap', 'pass'),
  result('linkHeaders', 'pass'),
  result('dnsAid', 'pass'),
  result('markdownNegotiation', 'pass'),
  result('contentSignals', 'pass'),
  result('robotsTxtAiRules', 'pass'),
  result('webBotAuth', 'na'), // excluded from the denominator
  result('agentSkills', 'pass'),
  result('apiCatalog', 'pass'),
  result('mcpServerCard', 'pass'),
  result('oauthDiscovery', 'pass'),
  result('oauthProtectedResource', 'fail'),
  result('authMd', 'fail'),
  result('webMcp', 'fail'),
];

describe('scoreResults', () => {
  it('computes the check-weighted composite (spintax reference: 11/14 = 79)', () => {
    const card = scoreResults(SPINTAX_LIKE);
    expect(card.composite).toBe(79);
    expect(card.categories.discoverability).toEqual({ score: 100, passed: 4, applicable: 4 });
    expect(card.categories.contentAccessibility).toEqual({ score: 100, passed: 1, applicable: 1 });
    expect(card.categories.botAccessControl).toEqual({ score: 100, passed: 2, applicable: 2 });
    expect(card.categories.discovery).toEqual({ score: 57, passed: 4, applicable: 7 });
  });

  it('maps composite to a level band (79 → Agent-Integrated per /api/scan point)', () => {
    const card = scoreResults(SPINTAX_LIKE);
    expect(card.level).toBe(4);
    expect(card.levelName).toBe('Agent-Integrated');
  });

  it('excludes na from the denominator instead of penalizing', () => {
    const withFail = scoreResults([result('robotsTxt', 'pass'), result('webBotAuth', 'fail')]);
    const withNa = scoreResults([result('robotsTxt', 'pass'), result('webBotAuth', 'na')]);
    expect(withFail.composite).toBe(50);
    expect(withNa.composite).toBe(100);
  });

  it('ignores unscored checks (commerce preview, llms.txt info)', () => {
    const card = scoreResults([result('robotsTxt', 'pass'), result('ucp', 'fail'), result('llmsTxt', 'fail')]);
    expect(card.composite).toBe(100);
    expect(card.categories.commerce).toBeUndefined();
  });

  it('scores an empty result set as 0 / Not Ready', () => {
    const card = scoreResults([]);
    expect(card.composite).toBe(0);
    expect(card.level).toBe(0);
    expect(card.levelName).toBe('Not Ready');
  });
});
