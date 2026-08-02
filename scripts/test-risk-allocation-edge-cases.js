// ============================================
// SYNTHETIC TEST — Step 8 Phase 3 review point 5
//
// riskAssessment.js's Fase 4 branch (highRisk: null — "sisa cash/stablecoin"
// has no stated band) and its "legacyPhase unknown" branch had never been
// exercised by any smoke test — the live run in this project's sandbox only
// ever resolved to legacyPhase 2 (BTC Leadership). Same spirit as
// test-state-disambiguation.js: synthetic `decision` objects to actually reach
// the branches live data hasn't hit yet, instead of trusting them on inspection
// alone. Also exercises portfolioAllocation.js's null-ambiguity fix (point 1)
// and the band-edge MIN_POSITION_USD check (point 2) from the same review.
//
// Run: node scripts/test-risk-allocation-edge-cases.js
// ============================================

import { assessRisk } from '../src/decision/riskAssessment.js';
import { computeAllocation } from '../src/decision/portfolioAllocation.js';

let pass = 0, fail = 0;
function check(label, condition) {
  console.log(`  ${condition ? '✓ PASS' : '✗ FAIL'} — ${label}`);
  if (condition) pass++; else fail++;
}

// ── Test 1: Fase 4 (Distribution) — highRisk band genuinely undefined,
// distinct from "portfolioSize missing". ────────────────────────────────────
console.log('=== Test 1: Fase 4 — highRisk band undefined for this phase ===');
{
  const decision = { state: 'Distribution', legacyPhase: 4, resolution: 'matched', isManualReview: false };
  const risk = assessRisk(decision);
  check('riskProfile is defensif', risk.riskProfile === 'defensif');
  check('coreBandPct is 70-100', risk.coreBandPct?.min === 70 && risk.coreBandPct?.max === 100);
  check('highRiskBandPct is null (not defined by source table)', risk.highRiskBandPct === null);

  const alloc = computeAllocation(risk, 1000);
  check('coreBandUSD computed correctly ($700-$1000)', alloc.coreBandUSD?.min === 700 && alloc.coreBandUSD?.max === 1000);
  check('highRiskBandUSD is null', alloc.highRiskBandUSD === null);
  check('highRiskBandUnavailableReason says "not defined for this phase", NOT "portfolioSize missing"',
    alloc.highRiskBandUnavailableReason?.includes('tidak didefinisikan untuk fase ini'));
  check('coreBandUnavailableReason is null (core band IS defined)', alloc.coreBandUnavailableReason === null);
}

// ── Test 2: legacyPhase unknown — riskProfile/bands must degrade to null with
// a reason, not silently default to some phase's numbers. ───────────────────
console.log('\n=== Test 2: legacyPhase unknown (state=UNKNOWN) ===');
{
  const decision = { state: 'UNKNOWN', legacyPhase: null, resolution: 'no-match-insufficient-data', isManualReview: false };
  const risk = assessRisk(decision);
  check('riskProfile is null', risk.riskProfile === null);
  check('coreBandPct is null', risk.coreBandPct === null);
  check('reasons mentions legacyPhase tidak diketahui', risk.reasons.some(r => r.includes('legacyPhase tidak diketahui')));

  const alloc = computeAllocation(risk, 1000);
  check('coreBandUSD is null even though portfolioSize IS set', alloc.coreBandUSD === null);
  check('coreBandUnavailableReason correctly blames the undefined band, not portfolioSize',
    alloc.coreBandUnavailableReason?.includes('tidak didefinisikan untuk fase ini'));
}

// ── Test 3 (review point 2 regression): small portfolioSize at Fase 3 —
// coreBand's own minimum edge should be flagged even though total
// portfolioSize clears MIN_POSITION_USD on its own. ──────────────────────────
console.log('\n=== Test 3: portfolioSize=$150 at Fase 3 (agresif) — band-edge check ===');
{
  const decision = { state: 'High Beta Rotation', legacyPhase: 3, resolution: 'matched', isManualReview: false };
  const risk = assessRisk(decision);
  const alloc = computeAllocation(risk, 150);
  check('coreBandUSD.min is $45 (150 * 30%)', alloc.coreBandUSD?.min === 45);
  check('portfolioSize ($150) itself is above MIN_POSITION_USD ($50) — precondition for this test', 150 >= 50);
  check('reasons flags coreBand minimum below minPositionUSD despite portfolioSize passing its own check',
    alloc.reasons.some(r => r.includes('coreBand minimum') && r.includes('di bawah minPositionUSD')));
}

// ── Test 4: sanity regression — portfolioSize null, defined band (Fase 2) —
// confirms the OTHER null-cause path still reports correctly. ────────────────
console.log('\n=== Test 4: portfolioSize unset at Fase 2 (regression sanity check) ===');
{
  const decision = { state: 'BTC Leadership', legacyPhase: 2, resolution: 'matched', isManualReview: false };
  const risk = assessRisk(decision);
  const alloc = computeAllocation(risk, null);
  check('coreBandUSD is null', alloc.coreBandUSD === null);
  check('coreBandUnavailableReason says "portfolioSize belum diset", NOT "not defined for this phase"',
    alloc.coreBandUnavailableReason === 'portfolioSize belum diset');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
