// ============================================
// INDICATOR — single measured signal (Step 4 domain entity, implemented)
//
// Every provider returns an array of these. Consumers (formatter, senders, future
// scoring/decision engine) only ever READ `.signal`/`.normalizedValue` — they never
// recompute it themselves. This is the structural fix for N-A/N-C/N-D/N-E: NVT
// ratio, CME premium, Phase 4 skew, and stablecoin growth were each computed
// independently in up to 4 presentation-layer locations (formatter.js twice,
// telegram-sender.js, discord-sender.js); two had already drifted to disagree
// before being hotfixed. With this shape, the computation happens exactly once,
// inside the owning provider.
//
// `bounds` is colocated with the indicator definition itself (fixes N1): the old
// sanity-validator.js maintained a separate BOUNDS array with independently
// guessed field-path getters into fetcher output, and 4 of its 22 entries had
// silently drifted out of sync with the real field paths, disabling those checks
// without anyone noticing. Declaring bounds next to the value that's being bounded
// makes that class of drift structurally impossible, not just currently absent.
// ============================================

export function makeIndicator({
  name,
  category,        // 'macro' | 'crypto' | 'derivatives' | 'onchain' | 'geopolitical'
  measurementType,  // MEASUREMENT_TYPE.*
  trustTier,        // TRUST_TIER.*
  rawValue,
  normalizedValue = null, // reserved for Step 7's scoring engine
  signal = null,          // '✅' | '⚠️' | '🔴' | null
  bounds = null,          // { min, max, hint }
  source,                 // a DataSource (see dataSource.js)
  weight = null,          // reserved for Step 7
}) {
  const boundsViolation = (bounds && typeof rawValue === 'number' && !source.skipped)
    ? (rawValue < bounds.min || rawValue > bounds.max)
    : false;

  return {
    name,
    category,
    measurementType,
    trustTier,
    rawValue,
    normalizedValue,
    signal,
    bounds,
    boundsViolation,
    source,
    weight,
    computedAt: new Date().toISOString(),
  };
}
