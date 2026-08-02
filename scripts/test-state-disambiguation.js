// ============================================
// SYNTHETIC TEST — Step 8 Phase 2 review point 4
//
// determineState()'s multi-match disambiguation logic (prefer previousState's
// expectedNext, else highest matchStrength) had never been exercised by any
// live smoke test, because `previousState` is always null until Step 8 Phase 3
// wires up persistence to db/postgres's market_state_history. This constructs
// controlled synthetic input to actually execute that code path now, instead
// of leaving it as an untested assumption.
//
// Not a full test framework (Step 11 hasn't set that up yet) — a targeted,
// one-off verification script, same spirit as the smoke-test-*.js scripts but
// with synthetic data instead of live fetches, specifically to reach branches
// live data in this sandbox has never triggered.
//
// Run: node scripts/test-state-disambiguation.js
// ============================================

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

let pass = 0, fail = 0;
function check(label, condition) {
  console.log(`  ${condition ? '✓ PASS' : '✗ FAIL'} — ${label}`);
  if (condition) pass++; else fail++;
}

// ── Test 1: two states match; previousState's expectedNext should win over
// matchStrength, even if the other match is "stronger". ──────────────────────
console.log('=== Test 1: expectedNext preference should override matchStrength ===');
{
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

  check('Both Large Cap Rotation and DeFi Rotation actually matched (precondition)',
    result.candidates.some(c => c.stateId === 'DeFi Rotation' || result.state === 'DeFi Rotation'));
  check('Resolution is multiple-matched-disambiguated', result.resolution === 'multiple-matched-disambiguated');
  check('Large Cap Rotation wins (in previousState=ETH Leadership\'s expectedNext), NOT DeFi Rotation despite weaker matchStrength',
    result.state === 'Large Cap Rotation');
  console.log(`  resolvedState=${result.state}, resolution=${result.resolution}`);
}

// ── Test 2: two states match, NEITHER is in previousState's expectedNext —
// should fall through to matchStrength-based tie-break. ──────────────────────
console.log('\n=== Test 2: fallback to matchStrength when expectedNext has no match ===');
{
  const p = baseProviders();
  p.crypto.indicators.push(
    ind('SOL/BTC ratio', 'crypto', 1.2, 'naik'),
    ind('AVAX/BTC ratio', 'crypto', 0.05, 'naik'),
    ind('XRP/BTC ratio', 'crypto', 0.3, 'turun'),
    ind('TOTAL2 WoW (%)', 'crypto', 5, null),
  );
  p.crypto.indicators.push(ind('TVL DeFi ($B)', 'crypto', 90, '✅'));
  // Explicitly false (not just absent) so Infrastructure Rotation's own "L2 TVL
  // tidak risk-off" check fails and it does NOT also match — isolates this
  // test to exactly 2 competing states, avoiding an unintended 3-way tie
  // (Infrastructure Rotation shares the "TVL DeFi naik WoW" check with DeFi
  // Rotation, which caused this test to initially fail for the wrong reason —
  // a test-construction flaw, not a disambiguation-logic bug).
  p.crypto.indicators.push(ind('L2 TVL Total ($B)', 'crypto', 5, '🔴'));

  // previousState = 'Retail Mania' — expectedNext ['Distribution'] only,
  // doesn't include either matched state, so this must fall through.
  const result = determineState(p, noDivergence, midConfidence, 'Retail Mania');

  check('Resolution is multiple-matched-disambiguated', result.resolution === 'multiple-matched-disambiguated');
  check('DeFi Rotation wins on matchStrength (1.0) when expectedNext gives no preference',
    result.state === 'DeFi Rotation');
  console.log(`  resolvedState=${result.state}, resolution=${result.resolution}`);
}

// ── Test 3: single clean match — sanity check nothing regressed. ─────────────
console.log('\n=== Test 3: single match (regression sanity check) ===');
{
  const p = baseProviders();
  p.onchain.indicators.push(ind('MVRV Ratio (true)', 'onchain', 1.5, '✅'));
  p.crypto.indicators.push(ind('BTC Price WoW (%)', 'crypto', 5, null));
  const result = determineState(p, noDivergence, midConfidence, null);
  check('Resolution is matched (single state)', result.resolution === 'matched');
  check('Resolved state is BTC Leadership', result.state === 'BTC Leadership');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
