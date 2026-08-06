import { describe, expect, it } from 'vitest';
import { type ScanSnapshot, StorageLayer } from '@/shared/storage';
import { FakeArea } from '@/shared/test-support';
import { SCORE_TTL_MS } from './score-cache';
import { isFromHistory, storedScore } from './stored-score';

const NOW = 1_700_000_000_000;

function snap(composite: number, at: number): ScanSnapshot {
  return { scannedAt: at, composite, level: 4, statuses: {} };
}

async function store(): Promise<StorageLayer> {
  const layer = new StorageLayer(new FakeArea());
  await layer.migrate();
  return layer;
}

describe('storedScore', () => {
  it('returns nothing for a site the user never saved', async () => {
    const s = await store();
    expect(await storedScore(s, 'https://example.com')).toBeUndefined();
  });

  it('returns nothing for a saved site with no history yet', async () => {
    const s = await store();
    await s.addSite('https://example.com');
    expect(await storedScore(s, 'https://example.com')).toBeUndefined();
  });

  it('returns the LAST snapshot of a saved site', async () => {
    const s = await store();
    await s.addSite('https://example.com');
    await s.appendSnapshot('https://example.com', snap(40, NOW - 90_000));
    await s.appendSnapshot('https://example.com', snap(79, NOW - 1_000));
    const score = await storedScore(s, 'https://example.com');
    expect(score?.composite).toBe(79);
    expect(score?.at).toBe(NOW - 1_000);
  });

  it('derives level and name together from the stored composite', async () => {
    const s = await store();
    await s.addSite('https://example.com');
    // the snapshot claims level 2 while 79 sits in the level-4 band: the pair
    // shown in the tooltip must be self-consistent, not half-recorded and
    // half-recomputed. (79 and not 80 on purpose — the L5 floor is 80, which is
    // the boundary Cloudflare's own two surfaces disagree about.)
    await s.appendSnapshot('https://example.com', { scannedAt: NOW, composite: 79, level: 2, statuses: {} });
    const score = await storedScore(s, 'https://example.com');
    expect(score?.level).toBe(4);
    expect(score?.levelName).toBe('Agent-Integrated');
  });

  it('does not leak a deleted site', async () => {
    const s = await store();
    await s.addSite('https://example.com');
    await s.appendSnapshot('https://example.com', snap(79, NOW));
    await s.removeSite('https://example.com');
    expect(await storedScore(s, 'https://example.com')).toBeUndefined();
  });
});

describe('isFromHistory', () => {
  const score = { composite: 79, level: 5, levelName: 'Agent-Native', at: NOW };

  it('is false for a score inside the session cooldown', () => {
    expect(isFromHistory(score, NOW + SCORE_TTL_MS - 1)).toBe(false);
  });

  it('is true once the score is older than the cooldown', () => {
    // the session cache drops entries past the TTL, so anything this old was
    // seeded from storage and its tooltip has to carry a date
    expect(isFromHistory(score, NOW + SCORE_TTL_MS)).toBe(true);
  });
});
