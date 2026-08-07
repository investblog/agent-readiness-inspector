import { describe, expect, it } from 'vitest';
import { detectStacks, REPAIR_KITS, repairKitFor } from './repair-kits';
import type { ProbeResponse } from './types';

function res(headers: Record<string, string>): ProbeResponse {
  const url = 'https://example.com/';
  return { url, status: 200, headers, body: '', finalUrl: url, redirected: false };
}

describe('detectStacks', () => {
  it('falls back to generic with no response at all', () => {
    expect(detectStacks(undefined)).toEqual(['generic']);
  });

  it('falls back to generic when nothing is recognisable', () => {
    expect(detectStacks(res({ server: 'gws' }))).toEqual(['generic']);
  });

  it('recognises each stack from the header it actually sends', () => {
    expect(detectStacks(res({ 'cf-ray': 'abc' }))).toContain('cloudflare');
    expect(detectStacks(res({ 'x-vercel-id': 'abc' }))).toContain('vercel');
    expect(detectStacks(res({ 'x-nf-request-id': 'abc' }))).toContain('netlify');
    expect(detectStacks(res({ server: 'nginx/1.25' }))).toContain('nginx');
    expect(detectStacks(res({ 'x-powered-by': 'Next.js' }))).toContain('nextjs');
  });

  it('reports BOTH when a platform sits behind a CDN', () => {
    // a Vercel app proxied by Cloudflare is both, and the fix goes in different
    // files for each — silently picking one sends half the readers wrong
    const stacks = detectStacks(res({ 'x-vercel-id': 'abc', 'cf-ray': 'def' }));
    expect(stacks).toContain('vercel');
    expect(stacks).toContain('cloudflare');
    expect(stacks.indexOf('vercel')).toBeLessThan(stacks.indexOf('cloudflare'));
  });
});

describe('repairKitFor', () => {
  it('returns nothing for a check with no kit yet', () => {
    expect(repairKitFor('oauthDiscovery', ['cloudflare'])).toBeUndefined();
  });

  it('picks the recipe for the detected stack', () => {
    const found = repairKitFor('markdownNegotiation', ['cloudflare']);
    expect(found?.stack).toBe('cloudflare');
    expect(found?.recipe.where).toContain('Worker');
  });

  it('falls back to the generic recipe rather than showing nothing', () => {
    // the requirement and the verify command are stack-independent and are the
    // most useful half of a kit — withholding them helps nobody.
    // 'generic' as the INPUT on purpose: asserting the absence of a netlify
    // recipe would turn red the day someone adds one, which is a wrong reason
    // for a test to fail.
    const found = repairKitFor('markdownNegotiation', ['generic']);
    expect(found?.stack).toBe('generic');
    expect(found?.kit.verify).toContain('curl');
  });

  it('names the other detected stacks instead of hiding them', () => {
    const found = repairKitFor('linkHeaders', ['vercel', 'cloudflare']);
    expect(found?.stack).toBe('vercel');
    expect(found?.alsoDetected).toEqual(['cloudflare']);
  });

  it('routes a Next.js site to the Next.js recipe, not to generic', () => {
    // detectStacks emits 'nextjs'; before the review no kit had a nextjs
    // recipe, so the one stack with a first-class answer got the generic
    // "you need to write code" text
    const found = repairKitFor('markdownNegotiation', ['nextjs', 'vercel']);
    expect(found?.stack).toBe('nextjs');
    expect(found?.recipe.snippet).toContain("from 'next/server'");
  });
});

describe('kit content stays usable', () => {
  it('every kit can answer someone on an unknown stack', () => {
    for (const [id, kit] of Object.entries(REPAIR_KITS)) {
      expect(kit.recipes.generic, `${id} has no generic recipe`).toBeDefined();
    }
  });

  it('every kit closes the loop: a command and what it should print', () => {
    for (const [id, kit] of Object.entries(REPAIR_KITS)) {
      expect(kit.verify.length, `${id} verify`).toBeGreaterThan(0);
      expect(kit.expect.length, `${id} expect`).toBeGreaterThan(0);
      // a recipe without a check is advice; the placeholder is what makes the
      // command runnable by the reader rather than a copy of ours
      expect(kit.verify, `${id} verify is not runnable`).toContain('YOUR-SITE');
    }
  });

  it('repairs only checks that exist in the matrix', async () => {
    const { MATRIX } = await import('./config');
    const ids = new Set(MATRIX.map((m) => m.id as string));
    for (const id of Object.keys(REPAIR_KITS)) expect(ids.has(id), `${id} is not a check`).toBe(true);
  });
});
