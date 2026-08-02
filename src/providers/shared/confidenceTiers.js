// ============================================
// CONFIDENCE TIERS — Step 4B's indicator trust classification, encoded as data
// instead of implicit knowledge in an audit doc. Providers tag every Indicator
// with these so consumers (Step 5's state machine, Step 7's scoring engine) know
// which signals are load-bearing vs advisory instead of treating all ~50
// indicators as equally reliable.
// ============================================

export const MEASUREMENT_TYPE = Object.freeze({
  DIRECT:   'direct',    // official/direct data — measures exactly what it claims
  PROXY:    'proxy',     // estimate/substitute standing in for something else
  INVENTED: 'invented',  // this project's own formula, no external benchmark
});

export const TRUST_TIER = Object.freeze({
  HIGH: 'high', // load-bearing — safe to use for state-machine entry/exit conditions
  LOW:  'low',  // advisory-only — informs but must not be load-bearing on its own
});
