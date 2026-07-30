// ScanSuccess → compact history snapshot (plan m2-dashboard.md: statuses only,
// no evidence — heavy and reproducible by a rescan).

import type { CheckId, CheckStatus } from '@/checks';
import type { ScanSuccess } from './messaging';
import type { ScanSnapshot } from './storage';

export function snapshotFromScan(scan: ScanSuccess): ScanSnapshot {
  const statuses: Partial<Record<CheckId, CheckStatus>> = {};
  for (const result of scan.results) statuses[result.id] = result.status;
  return {
    scannedAt: scan.scannedAt,
    composite: scan.scorecard.composite,
    level: scan.scorecard.level,
    statuses,
  };
}
