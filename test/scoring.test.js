// ============================================
// UNIT TESTS — Step 11, Scoring Engine (Step 7)
//
// signalClassifier.js / weights.js / categoryScore.js are pure functions —
// everything downstream (ConfidenceScore, StateMachine, RiskAssessment) sits
// on top of them, but until now they'd only ever been exercised indirectly
// via scripts/smoke-test-scoring.js against whatever live data happened to be
// available that run. No case here has ever been individually confirmed
// against a controlled input before.
// Run: node --test test/scoring.test.js  (or `npm test` for the whole suite)
// ============================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifySignal } from '../src/scoring/signalClassifier.js';
import { getIndicatorWeight, BASE_WEIGHT, SUPPRESSED } from '../src/scoring/weights.js';
import { computeCategoryScore } from '../src/scoring/categoryScore.js';

function ind(overrides = {}) {
  return {
    name: 'Test Indicator', trustTier: 'high', signal: '✅', boundsViolation: false,
    source: { skipped: false, isStale: false },
    ...overrides,
  };
}

describe('classifySignal', () => {
  test('✅ maps to +1', () => { assert.equal(classifySignal(ind({ signal: '✅' })), 1); });
  test('🔴 maps to -1', () => { assert.equal(classifySignal(ind({ signal: '🔴' })), -1); });
  test('⚠️ maps to 0', () => { assert.equal(classifySignal(ind({ signal: '⚠️' })), 0); });
  test('null signal returns null (never guessed)', () => { assert.equal(classifySignal(ind({ signal: null })), null); });
  test('plain trend text ("naik") with no emoji returns null — word-guessing is explicitly out of scope per this file\'s own header', () => {
    assert.equal(classifySignal(ind({ signal: 'naik' })), null);
  });
  test('undefined indicator does not throw, returns null', () => { assert.equal(classifySignal(undefined), null); });
  test('signal embedded in longer string still classifies (e.g. "✅ Tether printing — bullish Phase 1/2")', () => {
    assert.equal(classifySignal(ind({ signal: '✅ Tether printing — bullish Phase 1/2' })), 1);
  });
  test('precedence: ✅ checked before 🔴 when (hypothetically) both present', () => {
    assert.equal(classifySignal(ind({ signal: '✅🔴' })), 1);
  });
});

describe('getIndicatorWeight', () => {
  test('high trust, fresh, valid signal → BASE_WEIGHT.high (2)', () => {
    assert.equal(getIndicatorWeight(ind({ trustTier: 'high' })), BASE_WEIGHT.high);
  });
  test('low trust, fresh, valid signal → BASE_WEIGHT.low (1)', () => {
    assert.equal(getIndicatorWeight(ind({ trustTier: 'low' })), BASE_WEIGHT.low);
  });
  test('SUPPRESSED name → 0 regardless of trustTier/freshness/signal', () => {
    const name = [...SUPPRESSED][0];
    assert.ok(name, 'precondition: SUPPRESSED set must be non-empty for this test to mean anything');
    assert.equal(getIndicatorWeight(ind({ name, trustTier: 'high' })), 0);
  });
  test('boundsViolation:true → 0', () => {
    assert.equal(getIndicatorWeight(ind({ boundsViolation: true })), 0);
  });
  test('source.skipped:true → 0', () => {
    assert.equal(getIndicatorWeight(ind({ source: { skipped: true, isStale: false } })), 0);
  });
  test('no classifiable signal → 0', () => {
    assert.equal(getIndicatorWeight(ind({ signal: 'naik' })), 0);
  });
  test('unknown/missing trustTier → 0 (BASE_WEIGHT has no fallback entry)', () => {
    assert.equal(getIndicatorWeight(ind({ trustTier: 'medium' })), 0);
  });
  test('isStale halves the weight — high trust stale = 1, not 2', () => {
    assert.equal(getIndicatorWeight(ind({ trustTier: 'high', source: { skipped: false, isStale: true } })), 1);
  });
  test('isStale halves low trust too — 1 * 0.5 = 0.5', () => {
    assert.equal(getIndicatorWeight(ind({ trustTier: 'low', source: { skipped: false, isStale: true } })), 0.5);
  });
});

describe('computeCategoryScore', () => {
  test('empty indicator list → score null, not 0 ("neutral" is a real claim, per this file\'s own header)', () => {
    const r = computeCategoryScore([], 'Test Score');
    assert.equal(r.score, null);
    assert.equal(r.indicatorsScored, 0);
    assert.equal(r.indicatorsExcluded, 0);
  });

  test('all-excluded list → score null, all land in excluded[] with reasons', () => {
    const r = computeCategoryScore([ind({ signal: null }), ind({ boundsViolation: true })], 'Test Score');
    assert.equal(r.score, null);
    assert.equal(r.indicatorsScored, 0);
    assert.equal(r.indicatorsExcluded, 2);
    assert.ok(r.excluded.every(e => typeof e.reason === 'string' && e.reason.length > 0));
  });

  test('all-bullish high-trust → score is exactly 1 (fully bullish ceiling)', () => {
    const r = computeCategoryScore([ind({ name: 'A', signal: '✅' }), ind({ name: 'B', signal: '✅' })], 'Test Score');
    assert.equal(r.score, 1);
    assert.equal(r.indicatorsScored, 2);
  });

  test('all-bearish → score is exactly -1 (fully bearish floor)', () => {
    const r = computeCategoryScore([ind({ name: 'A', signal: '🔴' }), ind({ name: 'B', signal: '🔴' })], 'Test Score');
    assert.equal(r.score, -1);
  });

  test('weighted average: 1 bullish high(w2) + 1 bearish low(w1) → (2 - 1)/3 = 0.333', () => {
    const r = computeCategoryScore([
      ind({ name: 'A', trustTier: 'high', signal: '✅' }),
      ind({ name: 'B', trustTier: 'low', signal: '🔴' }),
    ], 'Test Score');
    assert.equal(r.score, 0.333);
  });

  test('exclusionReason precedence: boundsViolation wins over skipped when both true', () => {
    const r = computeCategoryScore([ind({ boundsViolation: true, source: { skipped: true, isStale: false } })], 'Test Score');
    assert.match(r.excluded[0].reason, /bounds violation/);
  });

  test('contribution objects carry enough for Step 8 explainability (name, trustTier, signal, weight, contribution)', () => {
    const r = computeCategoryScore([ind({ name: 'A', trustTier: 'high', signal: '✅' })], 'Test Score');
    const c = r.contributions[0];
    assert.equal(c.name, 'A');
    assert.equal(c.trustTier, 'high');
    assert.equal(c.signal, 1);
    assert.equal(c.weight, 2);
    assert.equal(c.contribution, 2);
  });
});
