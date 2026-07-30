// Scoring — spec §4. Composite = passed / applicable (check-weighted — the
// formula observed in the CF web-UI); `na` is excluded from the denominator;
// unscored checks (commerce, info) never enter the composite. Levels are
// calibrated against /api/scan (see LEVELS in config.ts).

import type { CategoryId } from './config';
import { LEVELS, type LevelBand } from './config';
import type { CheckResult } from './types';

export interface CategoryScore {
  score: number;
  passed: number;
  applicable: number;
}

export interface Scorecard {
  composite: number;
  level: number;
  levelName: string;
  categories: Partial<Record<CategoryId, CategoryScore>>;
}

function ratio(passed: number, applicable: number): number {
  return applicable > 0 ? Math.round((passed / applicable) * 100) : 0;
}

/** Map a composite 0–100 to its level band (exported for boundary tests). */
export function levelFor(composite: number): LevelBand {
  return LEVELS.find((l) => composite >= l.minComposite) ?? LEVELS[LEVELS.length - 1];
}

// Results carry their own `scored`/`category` (stamped from the matrix by the
// engine) — the scorer trusts them and never re-derives, so hand-built or
// config-versioned results score without a registry lookup that could throw.
export function scoreResults(results: readonly CheckResult[]): Scorecard {
  let passed = 0;
  let applicable = 0;
  const perCategory = new Map<CategoryId, { passed: number; applicable: number }>();

  for (const r of results) {
    if (!r.scored || r.status === 'na') continue;
    applicable += 1;
    const cat = perCategory.get(r.category) ?? { passed: 0, applicable: 0 };
    cat.applicable += 1;
    if (r.status === 'pass') {
      passed += 1;
      cat.passed += 1;
    }
    perCategory.set(r.category, cat);
  }

  const composite = ratio(passed, applicable);
  const band = levelFor(composite);

  const categories: Scorecard['categories'] = {};
  for (const [id, { passed: p, applicable: a }] of perCategory) {
    categories[id] = { score: ratio(p, a), passed: p, applicable: a };
  }

  return { composite, level: band.level, levelName: band.name, categories };
}
