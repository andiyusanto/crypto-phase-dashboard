// ============================================
// CATEGORY SCORE
//
// Computes a traceable weighted score in [-1, +1] (-1 = fully bearish, 0 =
// neutral, +1 = fully bullish) from a list of Indicators. Every score returned
// carries which indicators contributed how much AND which were excluded and why
// — an opaque single number is not enough for Step 8's Decision Engine, which
// needs explainable output.
// ============================================

import { classifySignal } from './signalClassifier.js';
import { getIndicatorWeight } from './weights.js';

function exclusionReason(indicator, weight) {
  if (weight > 0) return null;
  if (indicator.boundsViolation) return 'bounds violation — value flagged implausible, excluded per Sanity Bounds philosophy';
  if (indicator.source?.skipped) return `source skipped: ${indicator.source.skipReason ?? 'unknown'}`;
  if (classifySignal(indicator) === null) return 'no classifiable directional signal (raw value only, or non-emoji trend text)';
  return 'suppressed (redundant with another scored indicator)';
}

// `label` — human-readable name for this score (used in the returned object and
// in logging), e.g. "Macro Score", "Liquidity Score".
export function computeCategoryScore(indicators, label) {
  const contributions = [];
  const excluded = [];

  for (const ind of indicators) {
    const weight = getIndicatorWeight(ind);
    if (weight <= 0) {
      excluded.push({ name: ind.name, reason: exclusionReason(ind, weight) });
      continue;
    }
    const signal = classifySignal(ind);
    contributions.push({
      name: ind.name,
      trustTier: ind.trustTier,
      signal,
      weight,
      contribution: signal * weight,
    });
  }

  const totalWeight = contributions.reduce((s, c) => s + c.weight, 0);
  const weightedSum  = contributions.reduce((s, c) => s + c.contribution, 0);
  const score = totalWeight > 0 ? parseFloat((weightedSum / totalWeight).toFixed(3)) : null;

  return {
    label,
    score,                      // null if nothing could be scored — never silently defaults to 0 ("neutral" is a real claim, not "we don't know")
    indicatorsScored: contributions.length,
    indicatorsExcluded: excluded.length,
    contributions,
    excluded,
  };
}
