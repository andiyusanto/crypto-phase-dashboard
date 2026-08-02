// ============================================
// UNIT TESTS — Step 11, ConfidenceScore (Step 8 Phase 1)
//
// This project's own sandbox has never once observed a live "tinggi"
// confidence run — Fed Trifecta (Layer 0) has been DATA_UNAVAILABLE on every
// single smoke test this whole session (FRED key/rate-limit issues), which
// structurally caps every live run at "sedang" or below. That means the
// "tinggi" branch of computeConfidenceScore()'s logic — the branch that
// matters most, since it's the one requiring every condition to be earned —
// has NEVER actually been exercised, live or otherwise, until this file.
// Also locks in the "rendah" downgrade paths (both the original layer0+
// conflict compound rule AND the two extensions added on this session's own
// review: >=2 high-severity divergences alone, and >=3 thin categories alone).
// Run: node --test test/confidenceScore.test.js
// ============================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeConfidenceScore } from '../src/decision/confidenceScore.js';

function ind(name, signal, category) {
  return { name, category, signal, source: { skipped: false } };
}

// 8 positive + 2 negative = 10 signals, ratio 0.8 >= 0.7 threshold, sample 10 >= min 3.
function healthyAgreementIndicators() {
  const pos = Array.from({ length: 8 }, (_, i) => ind(`Pos${i}`, '✅', 'crypto'));
  const neg = Array.from({ length: 2 }, (_, i) => ind(`Neg${i}`, '🔴', 'crypto'));
  return [...pos, ...neg];
}

function baseProvidersOutput(liquidityOverrides = {}) {
  return {
    macro: {
      indicators: [],
      liquidity: { trifectaScore: null, overallStatus: 'DATA_UNAVAILABLE', ...liquidityOverrides },
    },
    crypto: { indicators: [] },
    derivatives: { indicators: [] },
    onchain: { indicators: [] },
  };
}

// All 6 categories comfortably above both COVERAGE_MIN_RATIO(1/3) and
// COVERAGE_MIN_COUNT(3) — "healthy" coverage baseline for tests to override.
function healthyAllScores() {
  const cat = (label) => ({ label, indicatorsScored: 5, indicatorsExcluded: 1 });
  return {
    liquidity: cat('Liquidity Score'), macro: cat('Macro Score'), crypto: cat('Crypto Score'),
    derivatives: cat('Derivatives Score'), onchain: cat('On-Chain Score'), war: cat('War Score'),
  };
}

function noDivergences() { return { fired: [], evaluated: 20, notEvaluable: 3 }; }

describe('"tinggi" — must be earned, never the default (this session\'s own structural fix)', () => {
  test('all 4 conditions met (Layer0 >=2/3, agreement >=70%, coverage healthy, no high-severity divergence) -> "tinggi"', () => {
    const p = baseProvidersOutput({ trifectaScore: '3/3', overallStatus: 'EKSPANSI' });
    p.crypto.indicators.push(...healthyAgreementIndicators());
    const r = computeConfidenceScore(p, healthyAllScores(), noDivergences());
    assert.equal(r.level, 'tinggi');
    assert.match(r.reasons[0], /Semua syarat "tinggi" terpenuhi/);
  });

  test('Layer0 exactly at 2/3 boundary still qualifies (">=", not ">")', () => {
    const p = baseProvidersOutput({ trifectaScore: '2/3', overallStatus: 'EKSPANSI' });
    p.crypto.indicators.push(...healthyAgreementIndicators());
    const r = computeConfidenceScore(p, healthyAllScores(), noDivergences());
    assert.equal(r.level, 'tinggi');
  });
});

describe('"sedang" — the honest default when something is short of "tinggi" but not badly broken', () => {
  test('Layer 0 DATA_UNAVAILABLE alone (everything else healthy) -> "sedang", not "tinggi", not "rendah"', () => {
    const p = baseProvidersOutput(); // trifectaScore: null, overallStatus: DATA_UNAVAILABLE — this session's sandbox reality on every live run
    p.crypto.indicators.push(...healthyAgreementIndicators());
    const r = computeConfidenceScore(p, healthyAllScores(), noDivergences());
    assert.equal(r.level, 'sedang');
    assert.match(r.reasons.join(' '), /Layer 0 \(Fed Trifecta\) tidak tersedia/);
  });

  test('agreement below 70% alone -> "sedang"', () => {
    const p = baseProvidersOutput({ trifectaScore: '3/3', overallStatus: 'EKSPANSI' });
    // 5 positive, 5 negative -> ratio exactly 0.5, below 0.7
    p.crypto.indicators.push(...Array.from({ length: 5 }, (_, i) => ind(`P${i}`, '✅', 'crypto')));
    p.crypto.indicators.push(...Array.from({ length: 5 }, (_, i) => ind(`N${i}`, '🔴', 'crypto')));
    const r = computeConfidenceScore(p, healthyAllScores(), noDivergences());
    assert.equal(r.level, 'sedang');
  });

  test('agreement sample below MIN_AGREEMENT_SAMPLE(3) -> ratio null, treated as not-high, "sedang"', () => {
    const p = baseProvidersOutput({ trifectaScore: '3/3', overallStatus: 'EKSPANSI' });
    p.crypto.indicators.push(ind('OnlyOne', '✅', 'crypto')); // sample size 1 < 3
    const r = computeConfidenceScore(p, healthyAllScores(), noDivergences());
    assert.equal(r.level, 'sedang');
    assert.match(r.reasons.join(' '), /sample cuma 1, butuh ≥3/);
  });
});

describe('"rendah" — compound original rule + this session\'s two independent extensions', () => {
  test('original rule: Layer0 weak/unavailable AND >=1 high-severity divergence -> "rendah"', () => {
    const p = baseProvidersOutput(); // Layer 0 unavailable = weak
    p.crypto.indicators.push(...healthyAgreementIndicators());
    const divergences = { fired: [{ id: 'x', severity: 'high' }], evaluated: 20, notEvaluable: 3 };
    const r = computeConfidenceScore(p, healthyAllScores(), divergences);
    assert.equal(r.level, 'rendah');
  });

  test('extension 1: >=2 high-severity divergences alone forces "rendah" even with healthy Layer 0', () => {
    const p = baseProvidersOutput({ trifectaScore: '3/3', overallStatus: 'EKSPANSI' });
    p.crypto.indicators.push(...healthyAgreementIndicators());
    const divergences = { fired: [{ id: 'a', severity: 'high' }, { id: 'b', severity: 'high' }], evaluated: 20, notEvaluable: 3 };
    const r = computeConfidenceScore(p, healthyAllScores(), divergences);
    assert.equal(r.level, 'rendah');
  });

  test('1 high-severity divergence alone (Layer 0 otherwise healthy) does NOT trigger "rendah" — needs 2, per extension 1\'s own threshold', () => {
    const p = baseProvidersOutput({ trifectaScore: '3/3', overallStatus: 'EKSPANSI' });
    p.crypto.indicators.push(...healthyAgreementIndicators());
    const divergences = { fired: [{ id: 'a', severity: 'high' }], evaluated: 20, notEvaluable: 3 };
    const r = computeConfidenceScore(p, healthyAllScores(), divergences);
    assert.equal(r.level, 'sedang'); // not tinggi (divergence present), not rendah (only 1, Layer0 healthy)
  });

  test('extension 2: >=3 thin categories alone forces "rendah" even with healthy Layer 0 and no divergences', () => {
    const p = baseProvidersOutput({ trifectaScore: '3/3', overallStatus: 'EKSPANSI' });
    p.crypto.indicators.push(...healthyAgreementIndicators());
    const allScores = healthyAllScores();
    // Thin: indicatorsScored=1 < COVERAGE_MIN_COUNT(3) — 3 categories made thin.
    allScores.liquidity.indicatorsScored = 1;
    allScores.macro.indicatorsScored = 1;
    allScores.onchain.indicatorsScored = 1;
    const r = computeConfidenceScore(p, allScores, noDivergences());
    assert.equal(r.level, 'rendah');
    assert.match(r.reasons.join(' '), /Coverage tipis di/);
  });

  test('2 thin categories alone (below the >=3 extension threshold) does NOT trigger "rendah"', () => {
    const p = baseProvidersOutput({ trifectaScore: '3/3', overallStatus: 'EKSPANSI' });
    p.crypto.indicators.push(...healthyAgreementIndicators());
    const allScores = healthyAllScores();
    allScores.liquidity.indicatorsScored = 1;
    allScores.macro.indicatorsScored = 1;
    const r = computeConfidenceScore(p, allScores, noDivergences());
    assert.equal(r.level, 'sedang'); // thin categories block "tinggi" but 2 < 3 doesn't force "rendah"
  });
});

describe('output shape carries divergence context (Step 8 Phase 3 review point 3\'s "don\'t drop context" discipline applies here too)', () => {
  test('divergencesEvaluated/notEvaluable/fired/highSeverity all reported, not just the final level', () => {
    const p = baseProvidersOutput({ trifectaScore: '3/3', overallStatus: 'EKSPANSI' });
    p.crypto.indicators.push(...healthyAgreementIndicators());
    const divergences = { fired: [{ id: 'a', severity: 'high' }], evaluated: 15, notEvaluable: 8 };
    const r = computeConfidenceScore(p, healthyAllScores(), divergences);
    assert.equal(r.divergencesEvaluated, 15);
    assert.equal(r.divergencesNotEvaluable, 8);
    assert.equal(r.divergencesFired, 1);
    assert.equal(r.divergencesHighSeverity, 1);
  });
});
