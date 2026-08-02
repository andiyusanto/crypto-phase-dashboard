// ============================================
// STATE MACHINE — Step 8 Phase 2
//
// Implements Step 5's 10-state design as real code (Step 5 was explicitly a
// no-implementation design step). Ground rules carried over from that design:
//
// - Entry conditions are checked against NAMED indicators from
//   src/providers/index.js's fetchAllProviders() output directly — NOT Step 7's
//   aggregate category scores. A category score of -0.18 can't tell you whether
//   BTC Dominance is rising; state determination needs the specific facts.
// - Every state's load-bearing (LB) checks are evaluated with the same honesty
//   discipline as DivergenceEngine: a check with no data is UNAVAILABLE, not
//   silently false. State match strength = satisfied / (total checks that had
//   data), with the unavailable count reported alongside — never hidden.
// - Historical duration is `method: 'heuristic'` per Step 5 — hardcoded,
//   publicly-known estimates, explicitly unvalidated against this project's own
//   data (market_state_history has no history yet to validate against).
// - Divergence blocking threshold: reuses ConfidenceScore's existing ≥2
//   high-severity-divergence threshold (Step 8 Phase 1) rather than inventing a
//   new number — both represent the same underlying idea ("the system doesn't
//   trust its own signals enough to act"), so one threshold, reused, not two
//   separately-guessed ones. This resolves the "how many divergences = Critical
//   blocking" question that Phase 1 deliberately deferred — resolved now by
//   reuse, not by fresh empirical data (which still doesn't exist — see
//   Phase 1's own review).
// ============================================

import { classifySignal } from '../scoring/signalClassifier.js';

const HIGH_SEVERITY_BLOCK_THRESHOLD = 2; // reused from confidenceScore.js — see file header

function idx(providersOutput) {
  const byName = (list, name) => {
    const ind = list?.find(i => i.name === name);
    if (!ind || ind.source?.skipped) return null;
    return ind;
  };
  return {
    crypto:      (name) => byName(providersOutput.crypto?.indicators, name),
    derivatives: (name) => byName(providersOutput.derivatives?.indicators, name),
    onchain:     (name) => byName(providersOutput.onchain?.indicators, name),
    macro:       (name) => byName(providersOutput.macro?.indicators, name),
  };
}

// Each check returns true/false, or `null` if the data it needs isn't available
// this run — never guessed.
//
// heuristicDurationDays PROVENANCE — revised after live web research (previously
// unsourced numbers from general memory, the weakest-grounded figures in this
// whole file at the time). Two tiers of confidence, both weaker than this
// project's own internal precedents (Confidence Score's 1/3, 2/3, 70%) but no
// longer bare guesses either:
// 1. Liquidity Contraction & Liquidity Stabilization map onto well-studied,
//    named public phenomena (bear markets, accumulation phases) with clustered
//    historical data across 3 independent cycles — cited per-state below.
// 2. The 7-state "expansion cluster" (BTC Leadership through Retail Mania) has
//    NO external source, because nobody else divides a bull run into this
//    project's specific 7 sub-rotations — only the SUM of this cluster maps to
//    a publicly documented concept ("altseason", 2-8 months, avg 4-5,
//    peak/explosive phase 4-8 weeks). The individual per-state split within
//    that total remains this project's own proportional judgment, honestly
//    still unverified state-by-state — only the aggregate is grounded.
const STATES = [
  {
    id: 'Liquidity Contraction', legacyPhase: 0,
    // 3 independent historical bear markets (2014-15, 2018-19, 2022-23) cluster
    // tightly at 363-410 days, avg 383 — narrower AND better-grounded than the
    // original 180-540d guess. Source: CryptoRank/CoinGecko Research bear-market
    // duration analysis.
    heuristicDurationDays: { min: 350, max: 420 },
    allowOneMiss: true, // see evaluateState() — loosened from strict-AND on review
    expectedNext: ['Liquidity Stabilization'],
    checks: [
      { name: 'Fed Trifecta kontraksi', evaluate: (p) => p.macro?.liquidity?.overallStatus === 'DATA_UNAVAILABLE' ? null : p.macro.liquidity.overallStatus === 'KONTRAKSI' },
      { name: 'VIX panic', evaluate: (p, i) => { const v = i.macro('VIX'); return v ? v.signal === '🔴' : null; } },
      // Replaced "BTC 24h turun" on Step 8 Phase 2 review point 3: a 1-day
      // snapshot was structurally mismatched for a state spanning up to ~420
      // days. BTC vs 200d MA is a genuine multi-month trend signal, not a
      // single point — a sustained bear market means price is well below its
      // own 200-day average, not just "red today".
      { name: 'BTC jauh di bawah 200d MA', evaluate: (p, i) => { const ma = i.onchain('BTC vs 200d MA (%)'); return ma?.rawValue == null ? null : ma.rawValue < -20; } },
      { name: 'Fear & Greed ekstrem takut', evaluate: (p, i) => { const g = i.crypto('Fear & Greed Index'); return g?.rawValue == null ? null : g.rawValue < 25; } },
    ],
  },
  {
    id: 'Liquidity Stabilization', legacyPhase: 1,
    // Widened from the original 60-180d: documented accumulation phases run
    // 12-18 months post-bottom, with the "acceleration phase" (~this state's
    // exit point, when BTC starts sustained outperformance) beginning on
    // average 7.8 months (~234d) in. Source: AInvest bear-market-bottom timing
    // analysis.
    heuristicDurationDays: { min: 60, max: 240 },
    allowOneMiss: true,
    expectedNext: ['BTC Leadership'], failBackTo: 'Liquidity Contraction',
    checks: [
      { name: 'Fed Trifecta stop memburuk', evaluate: (p) => p.macro?.liquidity?.overallStatus === 'DATA_UNAVAILABLE' ? null : p.macro.liquidity.overallStatus !== 'KONTRAKSI' },
      { name: 'MVRV di zona rendah', evaluate: (p, i) => { const mv = i.onchain('MVRV Ratio (true)'); return mv?.rawValue == null ? null : mv.rawValue < 1.5; } },
      { name: 'Exchange Reserve akumulasi', evaluate: (p, i) => { const er = i.onchain('BTC Exchange Reserve (k BTC)'); return er ? er.signal === '✅' : null; } },
      // Replaced "BTC 24h higher-low (proxy)" on Step 8 Phase 2 review point 3
      // — "higher low" is inherently a multi-point pattern (needs ≥2 troughs to
      // compare), structurally impossible to detect from one snapshot, not just
      // a weak proxy for it. BTC vs 200d MA "recovering but still negative"
      // (-30% to 0%) is an honest fit for "stabilizing" instead: no longer in
      // freefall, not yet a confirmed uptrend either.
      { name: 'BTC vs 200d MA membaik (belum uptrend)', evaluate: (p, i) => { const ma = i.onchain('BTC vs 200d MA (%)'); return ma?.rawValue == null ? null : (ma.rawValue >= -30 && ma.rawValue < 0); } },
    ],
  },
  {
    id: 'BTC Leadership', legacyPhase: 2,
    // Part of the "expansion cluster" — see file header. Not independently
    // sourced; this state's share of the externally-grounded 2-8 month
    // altseason total.
    heuristicDurationDays: { min: 14, max: 60 },
    allowOneMiss: true,
    expectedNext: ['ETH Leadership', 'Large Cap Rotation', 'Distribution'],
    checks: [
      // Replaced "BTC 24h naik" on Step 8 Phase 2 review point 3 — WoW% is a
      // better timescale match for a 14-60 day state than a single-day snapshot.
      { name: 'BTC naik WoW', evaluate: (p, i) => { const px = i.crypto('BTC Price WoW (%)'); return px?.rawValue == null ? null : px.rawValue > 0; } },
      { name: 'BTC Dominance naik WoW', evaluate: (p, i) => { const d = i.crypto('BTC Dominance WoW (pts)'); return d?.rawValue == null ? null : d.rawValue > 0; } },
      { name: 'Fed ekspansi', evaluate: (p) => p.macro?.liquidity?.overallStatus === 'DATA_UNAVAILABLE' ? null : p.macro.liquidity.overallStatus === 'EKSPANSI' },
      { name: 'MVRV menuju fair value', evaluate: (p, i) => { const mv = i.onchain('MVRV Ratio (true)'); return mv?.rawValue == null ? null : (mv.rawValue >= 1.0 && mv.rawValue <= 2.0); } },
    ],
  },
  {
    id: 'ETH Leadership', legacyPhase: 2,
    // Expansion cluster — see file header (BTC Leadership comment).
    heuristicDurationDays: { min: 7, max: 30 },
    expectedNext: ['Large Cap Rotation', 'Distribution'],
    checks: [
      // weekly.js's fetchRatioTrend() uses 'breakout' for ETH/BTC's positive
      // direction (its own threshold is >2% WoW, stricter than the other 3
      // ratios' >3% 'naik') instead of 'naik' like SOL/AVAX/XRP — a pre-existing
      // naming inconsistency in that file, not introduced here. Both accepted.
      { name: 'ETH/BTC naik', evaluate: (p, i) => { const r = i.crypto('ETH/BTC ratio'); return r ? (r.signal === 'naik' || r.signal === 'breakout') : null; } },
      { name: 'BTC Dominance turun WoW', evaluate: (p, i) => { const d = i.crypto('BTC Dominance WoW (pts)'); return d?.rawValue == null ? null : d.rawValue < 0; } },
    ],
  },
  {
    id: 'Large Cap Rotation', legacyPhase: 2,
    // Expansion cluster — see file header.
    heuristicDurationDays: { min: 5, max: 30 },
    expectedNext: ['Infrastructure Rotation', 'Distribution'],
    checks: [
      { name: 'SOL/BTC naik', evaluate: (p, i) => { const r = i.crypto('SOL/BTC ratio'); return r ? r.signal === 'naik' : null; } },
      { name: 'AVAX/BTC naik', evaluate: (p, i) => { const r = i.crypto('AVAX/BTC ratio'); return r ? r.signal === 'naik' : null; } },
      { name: 'XRP/BTC naik', evaluate: (p, i) => { const r = i.crypto('XRP/BTC ratio'); return r ? r.signal === 'naik' : null; } },
      { name: 'TOTAL2 naik WoW', evaluate: (p, i) => { const t = i.crypto('TOTAL2 WoW (%)'); return t?.rawValue == null ? null : t.rawValue > 0; } },
    ],
    minSatisfiedOfFirstN: { n: 3, min: 2 }, // "≥2-3 rasio large-cap uptrend simultan" per Step 5 — needs at least 2 of the 3 ratio checks, not all
  },
  {
    id: 'Infrastructure Rotation', legacyPhase: 2,
    // Expansion cluster — see file header.
    heuristicDurationDays: { min: 3, max: 21 },
    expectedNext: ['DeFi Rotation', 'High Beta Rotation', 'Distribution'],
    confidenceCeiling: 'sedang', // Step 5's own finding: weakest instrumentation of all 10 states — no per-asset L2 fetcher exists
    checks: [
      { name: 'L2 TVL tidak risk-off', evaluate: (p, i) => { const l2 = i.crypto('L2 TVL Total ($B)'); return l2 ? l2.signal !== '🔴' : null; } },
      { name: 'TVL DeFi naik WoW', evaluate: (p, i) => { const t = i.crypto('TVL DeFi ($B)'); return t ? t.signal === '✅' : null; } },
    ],
  },
  {
    id: 'DeFi Rotation', legacyPhase: 3,
    // Expansion cluster — see file header.
    heuristicDurationDays: { min: 3, max: 21 },
    expectedNext: ['High Beta Rotation', 'Distribution'],
    confidenceCeiling: 'sedang', // same instrumentation gap as Infrastructure Rotation
    checks: [
      { name: 'TVL DeFi naik WoW kuat', evaluate: (p, i) => { const t = i.crypto('TVL DeFi ($B)'); return t ? t.signal === '✅' : null; } },
    ],
  },
  {
    id: 'High Beta Rotation', legacyPhase: 3,
    // Together with Retail Mania below, this pair maps to altseason's
    // documented "peak phase" (mid/small-cap explosive returns) — sourced at
    // 4-8 weeks (28-56d) total. Split across the two states, upper bounds
    // widened from the original 3-21d to reach that combined range. Source:
    // Lambda Finance BTC dominance / altseason regime history.
    heuristicDurationDays: { min: 7, max: 35 },
    expectedNext: ['Retail Mania', 'Distribution'],
    checks: [
      { name: 'Funding Streak ≥3 hari', evaluate: (p, i) => { const s = i.derivatives('Funding Rate Streak (days > 0.05%)'); return s?.rawValue == null ? null : s.rawValue >= 3; } },
      { name: 'Fear & Greed greed', evaluate: (p, i) => { const g = i.crypto('Fear & Greed Index'); return g?.rawValue == null ? null : g.rawValue > 60; } },
    ],
  },
  {
    id: 'Retail Mania', legacyPhase: 3,
    // Paired with High Beta Rotation above against the "peak phase" 4-8 week
    // (28-56d) source — see that state's comment. Historically short-lived.
    heuristicDurationDays: { min: 7, max: 21 },
    allowOneMiss: true,
    expectedNext: ['Distribution'], failBackTo: 'High Beta Rotation',
    checks: [
      { name: 'Google Trends ekstrem', evaluate: (p, i) => { const t = i.crypto('Google Trends "bitcoin"'); return t?.rawValue == null ? null : t.rawValue > 80; } },
      { name: 'Fear & Greed ekstrem greed', evaluate: (p, i) => { const g = i.crypto('Fear & Greed Index'); return g?.rawValue == null ? null : g.rawValue > 75; } },
      { name: 'Funding Streak ≥7 hari', evaluate: (p, i) => { const s = i.derivatives('Funding Rate Streak (days > 0.05%)'); return s?.rawValue == null ? null : s.rawValue >= 7; } },
      // BUG FIX (found on review, verified against CLAUDE.md's exact table
      // text): -10 to -30 is documented as "Phase 3 late (leveraged longs
      // accumulate)" — euphoria/mania, matching this state. +10 to +30 is
      // documented as "Phase 4 capitulation" — FEAR, the opposite of mania.
      // Math.abs() treated both directions as equally "ekstrem mania", which
      // would have fired this check on capitulation readings too.
      { name: 'Perp Sentiment ekstrem (leveraged longs)', evaluate: (p, i) => { const ps = i.derivatives('Perp Sentiment Proxy'); return ps?.rawValue == null ? null : ps.rawValue < -20; } },
    ],
  },
  {
    id: 'Distribution', legacyPhase: 4,
    // Source material only loosely bounds this ("a few weeks to some months"),
    // no tight clustering like the bear-market data — widened upper bound from
    // 90d to 120d to better cover "some months" rather than tightened, since
    // the source itself doesn't support more precision than that.
    heuristicDurationDays: { min: 14, max: 120 },
    allowOneMiss: true,
    expectedNext: ['Liquidity Contraction'], // closes the cycle
    checks: [
      { name: 'Exchange Reserve distribusi', evaluate: (p, i) => { const er = i.onchain('BTC Exchange Reserve (k BTC)'); return er ? er.signal === '🔴' : null; } },
      { name: 'MVRV distribusi', evaluate: (p, i) => { const mv = i.onchain('MVRV Ratio (true)'); return mv?.rawValue == null ? null : mv.rawValue > 3.5; } },
      { name: 'Stablecoin rotasi cash', evaluate: (p, i) => { const s = i.crypto('Stablecoin Supply Growth WoW (%)'); return s ? s.signal?.includes('🔴') ?? false : null; } },
    ],
  },
];

function evaluateState(state, providersOutput) {
  const i = idx(providersOutput);
  const results = state.checks.map(c => ({ name: c.name, result: c.evaluate(providersOutput, i) }));
  const available = results.filter(r => r.result !== null);
  const satisfied = available.filter(r => r.result === true);

  let matched;
  if (state.minSatisfiedOfFirstN) {
    // e.g. Large Cap Rotation: "≥2 of the first 3 ratio checks", not strict AND —
    // Step 5's own explicit language, kept as its own special case rather than
    // forced to fit the general allowOneMiss rule below (2/3 = 66.7%, which a
    // blind ratio formula shared with 4-check states would NOT reproduce
    // consistently — reviewed and deliberately kept state-specific).
    const { n, min } = state.minSatisfiedOfFirstN;
    const firstN = results.slice(0, n).filter(r => r.result === true).length;
    const rest = results.slice(n).filter(r => r.result !== false); // remaining checks must not be false (true or unavailable OK)
    matched = firstN >= min && rest.every(r => r.result !== false);
  } else if (state.allowOneMiss) {
    // Loosened from strict-AND on review: with ≥3 available checks, tolerate
    // exactly one disagreeing — "available - 1" required satisfied. Below 3
    // available, this collapses back to strict-AND (a "majority" of 1-2 isn't
    // meaningfully looser and would just be permissive for no good reason).
    // This single rule deliberately produces 3-of-4 for the four states with 4
    // checks AND 2-of-3 for Distribution's 3 checks — the same "allow one
    // miss" principle, not two separately-tuned numbers.
    const required = available.length >= 3 ? available.length - 1 : available.length;
    matched = available.length > 0 && satisfied.length >= required;
  } else {
    matched = available.length > 0 && satisfied.length === available.length;
  }

  return {
    stateId: state.id,
    matched,
    satisfiedCount: satisfied.length,
    availableCount: available.length,
    totalChecks: state.checks.length,
    unavailable: results.filter(r => r.result === null).map(r => r.name),
    details: results,
    confidenceCeiling: state.confidenceCeiling ?? null,
    // Near-miss: didn't match, but had real evidence (≥2 available) and most of
    // it agreed — useful for Decision Engine even when nothing fully matched,
    // instead of "no-match" being a total dead end.
    nearMiss: !matched && available.length >= 2 && (satisfied.length / available.length) >= 0.5,
    matchStrength: available.length > 0 ? parseFloat((satisfied.length / available.length).toFixed(2)) : null,
  };
}

// `previousState` — the last known state id (from market_state_history once
// persisted), or null on first run. `divergenceResult`/`confidence` — Phase 1's
// outputs.
export function determineState(providersOutput, divergenceResult, confidence, previousState = null) {
  const evaluations = STATES.map(s => evaluateState(s, providersOutput));
  const matches = evaluations.filter(e => e.matched);

  const highSeverityFired = divergenceResult.fired.filter(d => d.severity === 'high');
  const blocked = highSeverityFired.length >= HIGH_SEVERITY_BLOCK_THRESHOLD;

  // Geopolitical severity-5 — per Step 5's design, this should force extra
  // scrutiny, NOT fabricate a state transition the data itself doesn't
  // support. Found live in this session's own smoke test: a severity-5
  // Russia-Ukraine event co-occurred with BTC Leadership genuinely matching
  // 2/2 available checks (price up, MVRV healthy) — forcing "Distribution"
  // (whose own 3 checks were all unmet) produced a state label that
  // contradicted both the matched evidence AND the Overall Cycle Score's sign.
  // Severity-5 now only flags for manual review + caps confidence; it never
  // overrides `resolvedState` away from what the data actually matched.
  const severity5 = (providersOutput.geopolitical ?? []).filter(g => g.severity === 5);

  let resolvedState, isManualReview = false, resolution;

  if (blocked) {
    // Divergence-blocking is different in kind from the geopolitical case: it
    // means the indicators THEMSELVES are internally contradicting each other
    // (≥2 high-severity divergences) — there's no coherent "matched" state to
    // report at all, so staying at previousState (or UNKNOWN) is the honest
    // answer, not a fabrication.
    resolvedState = previousState ?? 'UNKNOWN';
    resolution = 'inconclusive';
    isManualReview = true;
  } else if (matches.length === 1) {
    resolvedState = matches[0].stateId;
    resolution = 'matched';
  } else if (matches.length > 1) {
    // Multiple states matched simultaneously — prefer, in order:
    // 1. `previousState`'s own expected-next state (cycle continuity)
    // 2. Highest match strength (satisfied/available ratio) — a clean 2/2
    //    match is stronger evidence than a 2/3 match that only passed because
    //    allowOneMiss tolerated one disagreement, REGARDLESS of which one had
    //    more total checks available. Fixed on review: the previous version
    //    sorted by availableCount alone, which live-tested into picking a
    //    weaker (66.7%) match over a cleaner (100%) one just because it had
    //    one more available check — available breadth was ranked above match
    //    quality, backwards from what "which state are we more confidently in"
    //    should mean.
    // 3. Available count as a final tiebreak only when strength ties.
    const prevExpected = STATES.find(s => s.id === previousState)?.expectedNext ?? [];
    const preferred = matches.find(m => prevExpected.includes(m.stateId));
    resolvedState = preferred?.stateId ?? matches.sort((a, b) =>
      (b.matchStrength - a.matchStrength) || (b.availableCount - a.availableCount)
    )[0].stateId;
    resolution = 'multiple-matched-disambiguated';
  } else {
    resolvedState = previousState ?? 'UNKNOWN';
    resolution = 'no-match-insufficient-data';
  }

  // Geopolitical severity-5 always forces manual review + caps confidence,
  // independent of which resolution branch above fired — it's an annotation on
  // top of the resolved state, not a branch that picks the state itself.
  if (severity5.length > 0) isManualReview = true;

  const stateDef = STATES.find(s => s.id === resolvedState);
  const evaluation = evaluations.find(e => e.stateId === resolvedState);

  // Confidence for this state = Phase 1's overall confidence, capped further by
  // this specific state's own instrumentation ceiling if it has one (e.g.
  // Infrastructure/DeFi Rotation, per Step 5).
  const rank = { tinggi: 3, sedang: 2, rendah: 1 };
  let stateConfidence = confidence.level;
  if (stateDef?.confidenceCeiling && rank[stateDef.confidenceCeiling] < rank[stateConfidence]) {
    stateConfidence = stateDef.confidenceCeiling;
  }
  if (blocked || severity5.length > 0) stateConfidence = rank[stateConfidence] > rank['sedang'] ? 'sedang' : stateConfidence;

  // Candidates: every near-miss state, ranked by match strength — surfaced
  // regardless of resolution outcome, so a "no-match-insufficient-data" result
  // isn't a dead end for Step 8 Phase 3 / Step 9's consumers. Added on review:
  // loosening the match threshold alone doesn't help when a state's checks are
  // mostly UNAVAILABLE (not false) — this gives visibility into "closest
  // candidates" even when literally nothing has enough available evidence to
  // match under any threshold.
  const candidates = evaluations
    .filter(e => e.stateId !== resolvedState && (e.matched || e.nearMiss))
    .sort((a, b) => (b.matchStrength ?? 0) - (a.matchStrength ?? 0))
    .map(e => ({ stateId: e.stateId, matchStrength: e.matchStrength, satisfiedCount: e.satisfiedCount, availableCount: e.availableCount }));

  return {
    state: resolvedState,
    legacyPhase: stateDef?.legacyPhase ?? null,
    resolution, // 'matched' | 'multiple-matched-disambiguated' | 'no-match-insufficient-data' | 'inconclusive'
    isManualReview,
    confidence: stateConfidence,
    expectedNext: stateDef?.expectedNext ?? [],
    failBackTo: stateDef?.failBackTo ?? null,
    evaluation, // the matched state's own check breakdown (satisfied/available/unavailable)
    allEvaluations: evaluations, // every state's check breakdown, for explainability
    candidates, // other states that matched or came close, ranked — never empty just because resolvedState is UNKNOWN
    blockedByDivergence: blocked ? highSeverityFired.map(d => d.id) : [],
    // Renamed from `geopoliticalOverride` on review: this no longer changes
    // `state` (see fix above), it only flags manual-review + caps confidence —
    // the old name implied it altered the resolved state, which was the bug.
    geopoliticalFlag: severity5.length ? severity5.map(g => g.region) : [],
  };
}

export function projectTimeline(resolvedState) {
  const stateDef = STATES.find(s => s.id === resolvedState.state);
  if (!stateDef) {
    return { method: 'heuristic', available: false, reason: `unknown state "${resolvedState.state}"` };
  }
  // No persisted `market_state_history` entries exist yet to know elapsed time
  // in the current state (Step 6 Phase 3's table is unused until Phase 3 of
  // this step wires persistence in) — reported honestly, not fabricated as 0.
  return {
    method: 'heuristic', // per Step 5 — NOT a Bayesian/HMM model, that's Phase 2/ACCIS v2, out of scope
    available: true,
    heuristicDurationDays: stateDef.heuristicDurationDays,
    elapsedDaysInState: null,
    elapsedKnown: false,
    elapsedReason: 'belum ada histori market_state_history — elapsed time baru bisa dihitung setelah persistensi berjalan beberapa siklus',
    estimatedETA: null, // cannot compute remaining time without known elapsed
    caveat: `estimasi ${stateDef.heuristicDurationDays.min}-${stateDef.heuristicDurationDays.max} hari adalah heuristik dari pengetahuan siklus BTC publik, belum divalidasi terhadap data project ini sendiri`,
    expectedNext: stateDef.expectedNext,
  };
}

export { STATES };
