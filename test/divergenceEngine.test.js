// ============================================
// UNIT TESTS — Step 11, DivergenceEngine (Step 8 Phase 1)
//
// All 23 rules had only ever been exercised against whatever live data
// happened to be available on a given smoke-test run — never against a
// synthetic case specifically crafted to trigger fired:true, fired:false, or
// each rule's notEvaluable branch. This doesn't cover all 23 individually
// (that'd be excessive for the marginal gain), but covers: the aggregate
// shape (total/evaluated/notEvaluable/fired accounting), the 3 permanently
// hardcoded-notEvaluable rules, the `approximate` flag propagation, severity
// derivation, and — most importantly — a direct regression test for the
// Exchange Reserve sign-direction bug found and fixed earlier this session
// (etf-strongoutflow-reserve-down used the wrong signal value for "reserve
// turun", contradicting reserve-down-sharp-mvrv-high's use of the same
// real-world condition).
// Run: node --test test/divergenceEngine.test.js
// ============================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDivergences, RULES } from '../src/decision/divergenceEngine.js';

function ind(name, rawValue, signal = null, trustTier = 'high') {
  return { name, rawValue, signal, trustTier, source: { skipped: false } };
}

function baseProviders() {
  return { crypto: { indicators: [] }, derivatives: { indicators: [] }, onchain: { indicators: [] }, macro: { indicators: [] } };
}

function findRule(id) {
  const r = RULES.find(x => x.id === id);
  assert.ok(r, `precondition: rule "${id}" must exist in RULES — if this fails, the rule was renamed/removed`);
  return r;
}

describe('evaluateDivergences — aggregate accounting', () => {
  test('RULES.length is 23 — locks in the count this session\'s own audit corrected from a previously-wrong "18"', () => {
    assert.equal(RULES.length, 23);
  });

  test('empty providersOutput → everything notEvaluable, nothing fired, total accounted for', () => {
    const r = evaluateDivergences(baseProviders());
    assert.equal(r.total, 23);
    assert.equal(r.evaluated, 0);
    assert.equal(r.notEvaluable, 23);
    assert.deepEqual(r.fired, []);
    assert.equal(r.all.length, 23);
  });

  test('evaluated + notEvaluable always sums to total, regardless of input', () => {
    const p = baseProviders();
    p.derivatives.indicators.push(ind('Long/Short Ratio', 2.0));
    p.crypto.indicators.push(ind('Fear & Greed Index', 20));
    const r = evaluateDivergences(p);
    assert.equal(r.evaluated + r.notEvaluable, r.total);
  });
});

describe('hardcoded always-notEvaluable rules (Kategori C gaps — genuinely missing data, not a bug)', () => {
  for (const id of ['oi-up-basis-negative', 'stabledom-up-total2-up', 'price-up-volume-down']) {
    test(`${id} is notEvaluable regardless of what data is supplied (evaluate() ignores its input entirely)`, () => {
      const rule = findRule(id);
      // evaluate() for these 3 rules takes zero parameters — calling it with
      // none (rather than a crafted idx()) is itself the proof it has no data
      // dependency to feed in the first place.
      const result = rule.evaluate();
      assert.equal(result.evaluable, false);
      assert.equal(result.fired, false);
    });
  }
});

describe('funding-vs-feargreed-opposite — representative two-indicator rule', () => {
  const rule = findRule('funding-vs-feargreed-opposite');
  function idxFor(p) {
    const byName = (list, name) => list.find(i => i.name === name) ?? null;
    return {
      crypto: (n) => byName(p.crypto.indicators, n),
      derivatives: (n) => byName(p.derivatives.indicators, n),
      onchain: (n) => byName(p.onchain.indicators, n),
      macro: (n) => byName(p.macro.indicators, n),
    };
  }

  test('fires when funding bullish (✅) and Fear&Greed bearish (🔴) — opposite directions', () => {
    const p = baseProviders();
    p.derivatives.indicators.push(ind('BTC Funding Rate 8h (%)', 0.08, '✅'));
    p.crypto.indicators.push(ind('Fear & Greed Index', 15, '🔴'));
    const result = rule.evaluate(idxFor(p));
    assert.equal(result.evaluable, true);
    assert.equal(result.fired, true);
  });

  test('does not fire when both agree (both ✅)', () => {
    const p = baseProviders();
    p.derivatives.indicators.push(ind('BTC Funding Rate 8h (%)', 0.08, '✅'));
    p.crypto.indicators.push(ind('Fear & Greed Index', 70, '✅'));
    const result = rule.evaluate(idxFor(p));
    assert.equal(result.evaluable, true);
    assert.equal(result.fired, false);
  });

  test('notEvaluable when one side missing', () => {
    const p = baseProviders();
    p.derivatives.indicators.push(ind('BTC Funding Rate 8h (%)', 0.08, '✅'));
    const result = rule.evaluate(idxFor(p));
    assert.equal(result.evaluable, false);
  });
});

describe('approximate flag propagation', () => {
  test('hashrate-down-price-stable is marked approximate:true when fired', () => {
    const rule = findRule('hashrate-down-price-stable');
    const p = baseProviders();
    p.onchain.indicators.push(ind('Hash Rate (EH/s, 7d avg)', 500, '🔴'));
    p.crypto.indicators.push(ind('BTC Price Change 24h (%)', 1.5));
    const byName = (list, name) => list.find(i => i.name === name) ?? null;
    const i = { onchain: (n) => byName(p.onchain.indicators, n), crypto: (n) => byName(p.crypto.indicators, n) };
    const result = rule.evaluate(i);
    assert.equal(result.fired, true);
    assert.equal(result.approximate, true);
  });

  test('minerrev-down-hashrate-stable is NOT approximate (both sides use real WoW% thresholds, per this session\'s own review finding)', () => {
    const rule = findRule('minerrev-down-hashrate-stable');
    const p = baseProviders();
    p.onchain.indicators.push(ind('Miner Revenue ($M/day)', 10, '🔴'));
    p.onchain.indicators.push(ind('Hash Rate (EH/s, 7d avg)', 500, '⚠️'));
    const byName = (list, name) => list.find(i => i.name === name) ?? null;
    const i = { onchain: (n) => byName(p.onchain.indicators, n) };
    const result = rule.evaluate(i);
    assert.equal(result.fired, true);
    assert.equal(result.approximate, false);
  });
});

describe('Exchange Reserve sign-direction regression (bug fixed earlier this session)', () => {
  // Convention established by reserve-down-sharp-mvrv-high and confirmed by
  // formatter.js's own reference table: ✅ = reserve DECLINING (akumulasi),
  // 🔴 = reserve RISING (distribusi). etf-strongoutflow-reserve-down used 🔴
  // for "reserve turun" before the fix — this locks the correct convention in.
  function idxOnchain(p) {
    const byName = (list, name) => list.find(i => i.name === name) ?? null;
    return { onchain: (n) => byName(p.onchain.indicators, n) };
  }

  test('etf-strongoutflow-reserve-down fires when reserve signal is ✅ (declining) — the corrected direction', () => {
    const rule = findRule('etf-strongoutflow-reserve-down');
    const p = baseProviders();
    p.onchain.indicators.push(ind('ETF Flow proxy', -3));
    p.onchain.indicators.push(ind('BTC Exchange Reserve (k BTC)', 2650, '✅'));
    const result = rule.evaluate(idxOnchain(p));
    assert.equal(result.fired, true);
  });

  test('etf-strongoutflow-reserve-down does NOT fire when reserve signal is 🔴 (rising) — would have been the bug', () => {
    const rule = findRule('etf-strongoutflow-reserve-down');
    const p = baseProviders();
    p.onchain.indicators.push(ind('ETF Flow proxy', -3));
    p.onchain.indicators.push(ind('BTC Exchange Reserve (k BTC)', 2650, '🔴'));
    const result = rule.evaluate(idxOnchain(p));
    assert.equal(result.fired, false);
  });

  test('reserve-down-sharp-mvrv-high uses the SAME ✅=decline convention (internal consistency check)', () => {
    const rule = findRule('reserve-down-sharp-mvrv-high');
    const p = baseProviders();
    p.onchain.indicators.push(ind('BTC Exchange Reserve (k BTC)', 2650, '✅'));
    p.onchain.indicators.push(ind('MVRV Ratio (true)', 4.0));
    const result = rule.evaluate(idxOnchain(p));
    assert.equal(result.fired, true);
  });
});

describe('severity derivation (both HIGH trust -> "high", else "medium")', () => {
  function idxFor(p) {
    const byName = (list, name) => list.find(i => i.name === name) ?? null;
    return {
      crypto: (n) => byName(p.crypto.indicators, n), derivatives: (n) => byName(p.derivatives.indicators, n),
      onchain: (n) => byName(p.onchain.indicators, n), macro: (n) => byName(p.macro.indicators, n),
    };
  }

  test('both indicators HIGH trust -> severity "high" in evaluateDivergences() output', () => {
    const p = baseProviders();
    p.derivatives.indicators.push(ind('BTC Funding Rate 8h (%)', 0.08, '✅', 'high'));
    p.crypto.indicators.push(ind('Fear & Greed Index', 15, '🔴', 'high'));
    const r = evaluateDivergences(p);
    const fired = r.fired.find(d => d.id === 'funding-vs-feargreed-opposite');
    assert.ok(fired, 'precondition: rule must have fired for this test to check its severity');
    assert.equal(fired.severity, 'high');
  });

  test('one indicator LOW trust -> severity downgrades to "medium"', () => {
    const p = baseProviders();
    p.derivatives.indicators.push(ind('BTC Funding Rate 8h (%)', 0.08, '✅', 'high'));
    p.crypto.indicators.push(ind('Fear & Greed Index', 15, '🔴', 'low'));
    const r = evaluateDivergences(p);
    const fired = r.fired.find(d => d.id === 'funding-vs-feargreed-opposite');
    assert.ok(fired);
    assert.equal(fired.severity, 'medium');
  });
});
