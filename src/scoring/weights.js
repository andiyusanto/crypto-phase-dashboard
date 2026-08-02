// ============================================
// WEIGHT CONFIG
//
// Weight is derived PRIMARILY from `indicator.trustTier` — already correctly
// assigned per-indicator by every Step 6 provider — not a fresh hardcoded table
// of ~50 indicator names (which would risk silent drift the moment a name
// changes, the same class of bug N1 was: a parallel list whose keys quietly stop
// matching reality). This file only holds the small set of EXCEPTIONS.
//
// Extensibility: adding indicator #51 needs no change here at all, as long as its
// provider sets trustTier correctly — that's the whole point of reusing it.
// ============================================

import { classifySignal } from './signalClassifier.js';

export const BASE_WEIGHT = Object.freeze({ high: 2, low: 1 });

// Step 4B redundancy clusters — these indicators are the same underlying signal
// as another one already being scored, and would double-count it if weighted
// independently. Forced to 0 regardless of trustTier. Still visible/reported by
// the provider layer for display — just excluded from scoring.
export const SUPPRESSED = new Set([
  'Realized Price Multiple (MVRV proxy)', // near-duplicate of NUPL proxy; MVRV true is the trustworthy member of this cluster
  'Altseason Proxy',                       // literally computed FROM the 4 individual *-BTC ratios, which are scored separately
]);

// Returns the weight to use for this indicator in category scoring, or 0 if it
// should not contribute (suppressed, bounds violation, skipped source, or no
// classifiable directional signal).
export function getIndicatorWeight(indicator) {
  if (SUPPRESSED.has(indicator.name)) return 0;
  if (indicator.boundsViolation) return 0;
  if (indicator.source?.skipped) return 0;
  if (classifySignal(indicator) === null) return 0;

  let w = BASE_WEIGHT[indicator.trustTier] ?? 0;

  // Stale data still counts, but at reduced weight — per Step 7's brief, this
  // must be a decided, justified discount rather than a silent binary
  // include/exclude. Halving is a deliberately simple, easy-to-explain choice;
  // revisit once Step 6's freshness data has enough history to justify something
  // more precise than a flat discount.
  if (indicator.source?.isStale) w *= 0.5;

  return w;
}
