import { describe, expect, it } from 'vitest';
import { LEVELS } from './config';
import { defaultCheckIds, runChecks } from './index';
import { levelFor } from './scoring';
import type { CheckContext } from './types';

const emptyCtx: CheckContext = { origin: 'https://example.com', responses: new Map() };

describe('defaultEnabled semantics (spec §3)', () => {
  it('excludes a2aAgentCard and llmsTxt from the default run', () => {
    const ids = defaultCheckIds();
    expect(ids).not.toContain('a2aAgentCard');
    expect(ids).not.toContain('llmsTxt');
    expect(ids).toContain('robotsTxt');
  });

  it('include overrides the default selection', () => {
    // off-by-default check runs when explicitly included…
    const included = runChecks(emptyCtx, { include: ['a2aAgentCard'] }).map((r) => r.id);
    expect(included).toEqual(['a2aAgentCard']);
    // …and a default run does not sneak it in
    const defaults = runChecks(emptyCtx).map((r) => r.id);
    expect(defaults).not.toContain('a2aAgentCard');
  });

  it('a default run yields a result for every default-enabled check (total registry)', () => {
    const ran = runChecks(emptyCtx)
      .map((r) => r.id)
      .sort();
    expect(ran).toEqual([...defaultCheckIds()].sort());
  });
});

describe('level band boundaries (calibration hypothesis — deliberate edges)', () => {
  it.each([
    [0, 0, 'Not Ready'],
    [1, 1, 'Basic Web Presence'],
    [24, 1, 'Basic Web Presence'],
    [25, 2, 'Bot-Aware'],
    [44, 2, 'Bot-Aware'],
    [45, 3, 'Agent-Readable'],
    [64, 3, 'Agent-Readable'],
    [65, 4, 'Agent-Integrated'],
    [79, 4, 'Agent-Integrated'],
    [80, 5, 'Agent-Native'],
    [100, 5, 'Agent-Native'],
  ])('composite %i → level %i (%s)', (composite, level, name) => {
    const band = levelFor(composite);
    expect(band.level).toBe(level);
    expect(band.name).toBe(name);
  });

  it('every band lower edge maps to its own level (guards minComposite typos)', () => {
    for (const band of LEVELS) {
      expect(levelFor(band.minComposite).level).toBe(band.level);
    }
  });
});
