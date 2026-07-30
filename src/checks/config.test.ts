import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkMeta, MATRIX, PROBE } from './config';

describe('matrix config vs live isitagentready snapshot', () => {
  it('mirrors the drift snapshot exactly (drift-watch guards the upstream)', () => {
    const snapshot = fs
      .readFileSync(path.join(process.cwd(), 'ci', 'drift', 'snapshots', 'isitagentready-matrix.txt'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .sort();
    // our matrix minus our own additions (llms.txt info check) = CF's live matrix
    const ours = MATRIX.filter((m) => m.id !== 'llmsTxt')
      .map((m) => `${m.category}/${m.id}`)
      .sort();
    expect(ours).toEqual(snapshot);
  });

  it('has unique ids and resolvable metadata', () => {
    const ids = MATRIX.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(checkMeta(id)).toBeDefined();
  });

  it('keeps commerce and info checks out of the score', () => {
    for (const m of MATRIX) {
      if (m.category === 'commerce' || m.id === 'llmsTxt') expect(m.scored).toBe(false);
      else expect(m.scored).toBe(true);
    }
  });

  it('declares probes from the PROBE registry only', () => {
    const known = new Set<string>(Object.values(PROBE));
    for (const m of MATRIX) for (const p of m.probes) expect(known.has(p)).toBe(true);
  });
});
