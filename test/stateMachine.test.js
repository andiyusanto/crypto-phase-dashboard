// ============================================
// UNIT TESTS — Step 8 Phase 2 review point 4, migrated to node:test (Step 11)
//
// Migrated from scripts/test-state-disambiguation.js (kept the same cases and
// reasoning verbatim — only the assertion mechanism changed, from a hand-rolled
// pass/fail counter to node:test/assert). determineState()'s multi-match
// disambiguation logic (prefer previousState's expectedNext, else highest
// matchStrength) had never been exercised by any live smoke test, because
// `previousState` is always null until persistence is wired up (Step 8 Phase 3
// deliberately left this to future work). This constructs controlled synthetic
// input to actually execute that code path.
// Run: node --test test/stateMachine.test.js
// ============================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { determineState } from '../src/decision/stateMachine.js';

function ind(name, category, rawValue, signal = null, skipped = false) {
  return { name, category, rawValue, signal, source: { skipped } };
}

const noDivergence = { fired: [], evaluated: 0, notEvaluable: 23 };
const midConfidence = { level: 'sedang' };

function baseProviders() {
  return {
    macro: { indicators: [], liquidity: { trifectaScore: null, overallStatus: 'DATA_UNAVAILABLE' } },
    crypto: { indicators: [] },
    derivatives: { indicators: [] },
    onchain: { indicators: [] },
    geopolitical: [],
  };
}

describe('determineState — multi-match disambiguation', () => {
  test('expectedNext preference overrides matchStrength when previousState has a stake', () => {
    const p = baseProviders();
    // Large Cap Rotation match: 2 of 3 ratios "naik" + TOTAL2 WoW > 0 (its own
    // minSatisfiedOfFirstN rule) — deliberately imperfect (matchStrength < 1).
    p.crypto.indicators.push(
      ind('SOL/BTC ratio', 'crypto', 1.2, 'naik'),
      ind('AVAX/BTC ratio', 'crypto', 0.05, 'naik'),
      ind('XRP/BTC ratio', 'crypto', 0.3, 'turun'), // the one "miss"
      ind('TOTAL2 WoW (%)', 'crypto', 5, null),
    );
    // DeFi Rotation match: single check, TVL DeFi ✅ — a "perfect" 1/1 match
    // (matchStrength = 1.0, objectively stronger than Large Cap Rotation's).
    p.crypto.indicators.push(ind('TVL DeFi ($B)', 'crypto', 90, '✅'));

    const result = determineState(p, noDivergence, midConfidence, 'ETH Leadership'); // expectedNext: ['Large Cap Rotation', 'Distribution']

    assert.ok(
      result.candidates.some(c => c.stateId === 'DeFi Rotation' || result.state === 'DeFi Rotation'),
      'precondition: DeFi Rotation must have actually matched for this test to mean anything'
    );
    assert.equal(result.resolution, 'multiple-matched-disambiguated');
    assert.equal(result.state, 'Large Cap Rotation', 'must win via expectedNext preference despite weaker matchStrength than DeFi Rotation');
  });

  test('falls through to matchStrength when previousState\'s expectedNext gives no preference', () => {
    const p = baseProviders();
    p.crypto.indicators.push(
      ind('SOL/BTC ratio', 'crypto', 1.2, 'naik'),
      ind('AVAX/BTC ratio', 'crypto', 0.05, 'naik'),
      ind('XRP/BTC ratio', 'crypto', 0.3, 'turun'),
      ind('TOTAL2 WoW (%)', 'crypto', 5, null),
    );
    p.crypto.indicators.push(ind('TVL DeFi ($B)', 'crypto', 90, '✅'));
    // Explicitly false (not just absent) so Infrastructure Rotation's own "L2
    // TVL tidak risk-off" check fails and it does NOT also match — isolates
    // this test to exactly 2 competing states. Without this, Infrastructure
    // Rotation shares the "TVL DeFi naik WoW" check with DeFi Rotation and
    // both tie at matchStrength 1.0 — a test-construction flaw this session
    // itself hit once (unrelated to the disambiguation logic being tested).
    p.crypto.indicators.push(ind('L2 TVL Total ($B)', 'crypto', 5, '🔴'));

    // previousState = 'Retail Mania' — expectedNext ['Distribution'] only,
    // doesn't include either matched state, so this must fall through.
    const result = determineState(p, noDivergence, midConfidence, 'Retail Mania');

    assert.equal(result.resolution, 'multiple-matched-disambiguated');
    assert.equal(result.state, 'DeFi Rotation', 'must win on matchStrength (1.0) when expectedNext gives no preference');
  });

  test('single clean match — regression sanity check', () => {
    const p = baseProviders();
    p.onchain.indicators.push(ind('MVRV Ratio (true)', 'onchain', 1.5, '✅'));
    p.crypto.indicators.push(ind('BTC Price WoW (%)', 'crypto', 5, null));
    const result = determineState(p, noDivergence, midConfidence, null);
    assert.equal(result.resolution, 'matched');
    assert.equal(result.state, 'BTC Leadership');
  });
});
