// ============================================
// SIGNAL CLASSIFIER
//
// This codebase already has a de facto -1/0/+1 classification convention baked
// into almost every fetcher's `.signal` field (✅/⚠️/🔴 — see fedliquidity.js,
// formatter.js's whole scorecard section, etc). The Scoring Engine doesn't invent
// a new normalization scheme per indicator — it systematizes what's already there.
//
// Indicators whose `.signal` has no recognizable ✅/⚠️/🔴 (e.g. plain trend words
// like "naik"/"turun", or raw values with signal:null) return `null` here rather
// than being guessed at — "naik" is bullish for Hash Rate but bearish for DXY, so
// generic word-guessing would be exactly the kind of unjustified magic-number
// classification this project's audit history warns against. Those indicators are
// excluded from scoring (weights.js) and reported as a known gap, not silently
// misclassified.
// ============================================

export function classifySignal(indicator) {
  const s = indicator?.signal;
  if (!s || typeof s !== 'string') return null;
  if (s.includes('✅')) return 1;
  if (s.includes('🔴')) return -1;
  if (s.includes('⚠️')) return 0;
  return null;
}
