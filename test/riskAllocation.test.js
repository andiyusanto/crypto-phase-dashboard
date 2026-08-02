// ============================================
// UNIT TESTS — Step 8 Phase 3 review point 5, migrated to node:test (Step 11)
//
// Migrated from scripts/test-risk-allocation-edge-cases.js (same cases,
// node:test/assert instead of a hand-rolled counter). riskAssessment.js's
// Fase 4 branch (highRisk: null — "sisa cash/stablecoin" has no stated band)
// and its "legacyPhase unknown" branch had never been exercised by any live
// smoke test — the live sandbox only ever resolved to legacyPhase 2 (BTC
// Leadership). Also covers portfolioAllocation.js's null-ambiguity fix
// (review point 1) and the band-edge MIN_POSITION_USD check (review point 2).
// Run: node --test test/riskAllocation.test.js
// ============================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assessRisk } from '../src/decision/riskAssessment.js';
import { computeAllocation } from '../src/decision/portfolioAllocation.js';

describe('riskAssessment + portfolioAllocation — edge cases', () => {
  test('Fase 4 (Distribution) — highRisk band genuinely undefined, distinct from "portfolioSize missing"', () => {
    const decision = { state: 'Distribution', legacyPhase: 4, resolution: 'matched', isManualReview: false };
    const risk = assessRisk(decision);
    assert.equal(risk.riskProfile, 'defensif');
    assert.equal(risk.coreBandPct.min, 70);
    assert.equal(risk.coreBandPct.max, 100);
    assert.equal(risk.highRiskBandPct, null);

    const alloc = computeAllocation(risk, 1000);
    assert.equal(alloc.coreBandUSD.min, 700);
    assert.equal(alloc.coreBandUSD.max, 1000);
    assert.equal(alloc.highRiskBandUSD, null);
    assert.match(alloc.highRiskBandUnavailableReason, /tidak didefinisikan untuk fase ini/);
    assert.equal(alloc.coreBandUnavailableReason, null, 'core band IS defined, should have no unavailable reason');
  });

  test('legacyPhase unknown (state=UNKNOWN) — must degrade to null with a reason, never silently default to another phase\'s numbers', () => {
    const decision = { state: 'UNKNOWN', legacyPhase: null, resolution: 'no-match-insufficient-data', isManualReview: false };
    const risk = assessRisk(decision);
    assert.equal(risk.riskProfile, null);
    assert.equal(risk.coreBandPct, null);
    assert.ok(risk.reasons.some(r => r.includes('legacyPhase tidak diketahui')));

    const alloc = computeAllocation(risk, 1000);
    assert.equal(alloc.coreBandUSD, null, 'must be null even though portfolioSize IS set');
    assert.match(alloc.coreBandUnavailableReason, /tidak didefinisikan untuk fase ini/, 'must blame the undefined band, not portfolioSize');
  });

  test('review point 2 regression: small portfolioSize at Fase 3 — band\'s own edge flagged even when total portfolioSize clears MIN_POSITION_USD', () => {
    const decision = { state: 'High Beta Rotation', legacyPhase: 3, resolution: 'matched', isManualReview: false };
    const risk = assessRisk(decision);
    const alloc = computeAllocation(risk, 150);
    assert.equal(alloc.coreBandUSD.min, 45, '150 * 30% = 45');
    assert.ok(150 >= 50, 'precondition: portfolioSize itself clears MIN_POSITION_USD on its own');
    assert.ok(
      alloc.reasons.some(r => r.includes('coreBand minimum') && r.includes('di bawah minPositionUSD')),
      'must flag the band edge despite portfolioSize passing its own check'
    );
  });

  test('regression sanity: portfolioSize unset at Fase 2 — the OTHER null-cause path reports correctly', () => {
    const decision = { state: 'BTC Leadership', legacyPhase: 2, resolution: 'matched', isManualReview: false };
    const risk = assessRisk(decision);
    const alloc = computeAllocation(risk, null);
    assert.equal(alloc.coreBandUSD, null);
    assert.equal(alloc.coreBandUnavailableReason, 'portfolioSize belum diset');
  });
});
