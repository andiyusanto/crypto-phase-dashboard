// ============================================
// DIVERGENCE ENGINE — Step 8 Phase 1
//
// Implements Step 4's DivergenceEngine design: the 23 cross-indicator rules from
// formatter.js:780-802 (previously only prose the AI was asked to apply itself —
// this is C2/N-B's hidden-business-logic pattern, now made real code).
//
// CORRECTION: this project referred to these as "18 rules" throughout Step 2-7 of
// this session. Re-reading formatter.js:780-802 directly for this implementation
// found 23, not 18 — the earlier count was never re-verified against the source.
// Fixed here rather than perpetuated.
//
// HONEST DATA-AVAILABILITY AUDIT: not all 23 rules can be evaluated with what's
// currently exposed by Step 6's provider layer. Some need fields that exist in the
// underlying fetchers but were never promoted to a named Indicator (BTC vs 200d
// MA%, BTC price % change, a volume baseline average, TOTAL2 WoW%, Stablecoin
// Dominance WoW%, Active Addresses' exact WoW% rather than its 3-tier signal).
// Per this project's whole "excluded with a reason, never guess" discipline
// (Step 7's categoryScore.js), a rule with a missing input returns
// `evaluable: false` with a specific reason instead of being silently skipped or
// approximated with a mismatched substitute. A few rules use a DOCUMENTED,
// EXPLICIT approximation where a close proxy already exists (e.g. Open Interest's
// level-based signal standing in for a true WoW% change) — those are marked
// `approximate: true` so consumers can tell the difference from a clean evaluation.
// ============================================

import { classifySignal } from '../scoring/signalClassifier.js';

function idx(providersOutput) {
  const byName = (list, name) => {
    const ind = list.find(i => i.name === name);
    if (!ind || ind.source?.skipped) return null;
    return ind;
  };
  return {
    crypto:      (name) => byName(providersOutput.crypto.indicators, name),
    derivatives: (name) => byName(providersOutput.derivatives.indicators, name),
    onchain:     (name) => byName(providersOutput.onchain.indicators, name),
    macro:       (name) => byName(providersOutput.macro.indicators, name),
  };
}

const notEvaluable = (reason) => ({ evaluable: false, fired: false, reason });
const evaluated = (fired, approximate = false) => ({ evaluable: true, fired, approximate });

// Each rule: id, description (verbatim from formatter.js where possible),
// indicatorsInvolved (for trust-tier-derived severity), evaluate(i) → result.
const RULES = [
  {
    id: 'funding-vs-feargreed-opposite',
    description: 'Funding rate dan Fear & Greed menunjukkan arah berlawanan',
    indicatorsInvolved: ['BTC Funding Rate 8h (%)', 'Fear & Greed Index'],
    evaluate: (i) => {
      const f = i.derivatives('BTC Funding Rate 8h (%)'), g = i.crypto('Fear & Greed Index');
      if (!f || !g) return notEvaluable('funding rate atau Fear & Greed tidak tersedia run ini');
      const fs = classifySignal(f), gs = classifySignal(g);
      if (fs == null || gs == null) return notEvaluable('signal funding/F&G belum terklasifikasi');
      return evaluated((fs > 0 && gs < 0) || (fs < 0 && gs > 0));
    },
  },
  {
    id: 'btcdom-tvl-both-rising',
    description: 'BTC Dominance naik tapi TVL DeFi juga naik (alts accumulation senyap)',
    indicatorsInvolved: ['BTC Dominance WoW (pts)', 'TVL DeFi ($B)'],
    // Closed — Step 8 Kategori B. "BTC Dominance naik" now uses the real WoW
    // point-delta indicator instead of being unevaluable. TVL DeFi's own signal
    // is already WoW%-based (✅ = >+5%), an exact match for "naik", not an
    // approximation.
    evaluate: (i) => {
      const dom = i.crypto('BTC Dominance WoW (pts)'), tvl = i.crypto('TVL DeFi ($B)');
      if (!dom || !tvl || dom.rawValue == null) return notEvaluable('BTC Dominance WoW atau TVL DeFi tidak tersedia run ini');
      return evaluated(dom.rawValue > 0 && tvl.signal === '✅');
    },
  },
  {
    id: 'nupl-high-sopr-low',
    description: 'NUPL proxy > 0.5 tapi SOPR proxy < 0.95 (holder kaya historis, harga di bawah 30d avg → distribusi/koreksi dalam)',
    indicatorsInvolved: ['NUPL proxy', 'SOPR proxy'],
    evaluate: (i) => {
      const n = i.onchain('NUPL proxy'), s = i.onchain('SOPR proxy');
      if (!n || !s || n.rawValue == null || s.rawValue == null) return notEvaluable('NUPL atau SOPR proxy tidak tersedia run ini');
      return evaluated(n.rawValue > 0.5 && s.rawValue < 0.95);
    },
  },
  {
    id: 'oi-up-basis-negative',
    description: 'OI naik tapi Basis Rate negatif (leverage naik di tengah backwardation → sinyal divergen berbahaya)',
    indicatorsInvolved: ['Open Interest BTC ($B)', 'Basis Rate (annualized %)'],
    // Downgraded from "approximate" to not-evaluable after review: OI's
    // level-based signal (✅ = >$30B absolute level) is not a reliable stand-in
    // for "naik" (a rate-of-change concept) — OI can sit above $30B while
    // actually declining (false positive) or rise from a low base while staying
    // below $30B (false negative). Unlike the Exchange Reserve rules below,
    // there's no absolute-level threshold anywhere in this project that's
    // actually equivalent to the WoW change this rule asks for.
    evaluate: () => notEvaluable('OI hanya punya sinyal level absolut ($30B threshold), bukan WoW% — tidak reliable sebagai proxy "naik"'),
  },
  {
    id: 'longshort-high-feargreed-low',
    description: 'Long/Short Ratio > 1.8 tapi Fear & Greed < 40 (positioning bullish tapi sentiment takut → long squeeze probable)',
    indicatorsInvolved: ['Long/Short Ratio', 'Fear & Greed Index'],
    evaluate: (i) => {
      const ls = i.derivatives('Long/Short Ratio'), g = i.crypto('Fear & Greed Index');
      if (!ls || !g || ls.rawValue == null || g.rawValue == null) return notEvaluable('Long/Short Ratio atau Fear & Greed tidak tersedia run ini');
      return evaluated(ls.rawValue > 1.8 && g.rawValue < 40);
    },
  },
  {
    id: 'perpsentiment-high-basis-positive',
    description: 'Perp Sentiment Proxy > 10 tapi Basis Rate positif (perp bearish tapi basis contango → pasar tidak konsisten)',
    indicatorsInvolved: ['Perp Sentiment Proxy', 'Basis Rate (annualized %)'],
    evaluate: (i) => {
      const p = i.derivatives('Perp Sentiment Proxy'), b = i.derivatives('Basis Rate (annualized %)');
      if (!p || !b || p.rawValue == null || b.rawValue == null) return notEvaluable('Perp Sentiment Proxy atau Basis Rate tidak tersedia run ini');
      return evaluated(p.rawValue > 10 && b.rawValue > 0);
    },
  },
  {
    id: 'hashrate-down-price-stable',
    description: 'Hash Rate turun tajam (WoW < -5%) tapi harga stabil/naik (miner capitulation tersembunyi — sering precede dump)',
    indicatorsInvolved: ['Hash Rate (EH/s, 7d avg)', 'BTC Price Change 24h (%)'],
    // Closed — Step 8 Kategori B. "Harga stabil/naik" uses 24h change as proxy
    // (not a true WoW window) — same 24h-proxy convention formatter.js's own
    // dirFromDailyDiff() already uses elsewhere. "Stabil/naik" = change24h >= 0.
    evaluate: (i) => {
      const hr = i.onchain('Hash Rate (EH/s, 7d avg)'), px = i.crypto('BTC Price Change 24h (%)');
      if (!hr || !px || px.rawValue == null) return notEvaluable('Hash Rate atau BTC Price Change 24h tidak tersedia run ini');
      return evaluated(hr.signal === '🔴' && px.rawValue >= 0, true);
    },
  },
  {
    id: 'stabledom-up-total2-up',
    description: 'Stablecoin Dominance naik WoW tapi TOTAL2 juga naik (money masuk tapi ke stablecoin, bukan risk-on)',
    indicatorsInvolved: ['Stablecoin Dominance (%)', 'TOTAL2 WoW (%)'],
    // Partially closed — Step 8 Kategori B added TOTAL2 WoW, but Stablecoin
    // Dominance WoW% still doesn't exist (would need historical
    // totalMarketCapBillion tracking that daily_snapshot doesn't store — a
    // genuinely bigger lift, "Kategori C", not just exposing an existing field).
    // Kept honestly not-evaluable rather than approximated from the level-based
    // signal, same reasoning as oi-up-basis-negative.
    evaluate: () => notEvaluable('TOTAL2 WoW sekarang tersedia, tapi Stablecoin Dominance WoW% masih belum ada — butuh histori totalMarketCapBillion yang belum dilacak (Kategori C)'),
  },
  {
    id: 'realizedmult-high-longshort-low',
    description: 'Realized Price Multiple > 3.0x tapi Long/Short Ratio < 1.0 (valuasi stretched, positioning tidak konfirmasi → topping signal)',
    indicatorsInvolved: ['Realized Price Multiple (MVRV proxy)', 'Long/Short Ratio'],
    evaluate: (i) => {
      const rm = i.onchain('Realized Price Multiple (MVRV proxy)'), ls = i.derivatives('Long/Short Ratio');
      if (!rm || !ls || rm.rawValue == null || ls.rawValue == null) return notEvaluable('Realized Price Multiple atau Long/Short Ratio tidak tersedia run ini');
      return evaluated(rm.rawValue > 3.0 && ls.rawValue < 1.0);
    },
  },
  {
    id: 'minerrev-down-hashrate-stable',
    description: 'Miner Revenue turun tajam (WoW < -20%) tapi Hash Rate stabil (revenue crash bukan karena network, harga jatuh → miner stress)',
    indicatorsInvolved: ['Miner Revenue ($M/day)', 'Hash Rate (EH/s, 7d avg)'],
    evaluate: (i) => {
      const mr = i.onchain('Miner Revenue ($M/day)'), hr = i.onchain('Hash Rate (EH/s, 7d avg)');
      if (!mr || !hr) return notEvaluable('Miner Revenue atau Hash Rate tidak tersedia run ini');
      // Not actually an approximation on review: Miner Revenue's 🔴 signal is
      // computed from exactly the -20% WoW threshold this rule asks for, and
      // Hash Rate's ⚠️ (-1%..+1% WoW) is a faithful operationalization of
      // "stabil" — both sides use real WoW% thresholds, not a level-based
      // stand-in. Previously flagged `approximate: true` too cautiously.
      return evaluated(mr.signal === '🔴' && hr.signal === '⚠️');
    },
  },
  {
    id: 'activeaddr-down-total2-up',
    description: 'Active Addresses turun WoW tapi TOTAL2 naik (harga naik tanpa on-chain adoption → rally tidak sustainable)',
    indicatorsInvolved: ['Active Addresses WoW (%)', 'TOTAL2 WoW (%)'],
    // Closed — Step 8 Kategori B added both raw WoW% fields (previously only a
    // 3-tier band existed for Active Addresses, and TOTAL2 had no direction at
    // all). "Turun" = any negative WoW%, "naik" = any positive WoW%, matching
    // the rule's own unqualified wording (no specific magnitude given).
    evaluate: (i) => {
      const aa = i.onchain('Active Addresses WoW (%)'), t2 = i.crypto('TOTAL2 WoW (%)');
      if (!aa || !t2 || aa.rawValue == null || t2.rawValue == null) return notEvaluable('Active Addresses WoW atau TOTAL2 WoW tidak tersedia run ini');
      return evaluated(aa.rawValue < 0 && t2.rawValue > 0);
    },
  },
  {
    id: 'picycle-near-nupl-low',
    description: "Pi Cycle gap < -10% (mendekati crossing) tapi NUPL < 0.5 (cycle belum mature untuk top — monitor closely)",
    indicatorsInvolved: ['Pi Cycle Top gap (%)', 'NUPL proxy'],
    evaluate: (i) => {
      const pc = i.onchain('Pi Cycle Top gap (%)'), n = i.onchain('NUPL proxy');
      if (!pc || !n || pc.rawValue == null || n.rawValue == null) return notEvaluable('Pi Cycle gap atau NUPL proxy tidak tersedia run ini');
      return evaluated(pc.rawValue < -10 && n.rawValue < 0.5);
    },
  },
  {
    id: 'price-up-volume-down',
    description: 'BTC harga naik tapi volume 24h turun signifikan vs rata-rata (price discovery tanpa volume konfirmasi → rally lemah)',
    indicatorsInvolved: ['BTC Price', 'BTC Volume 24h ($B)'],
    evaluate: () => notEvaluable('tidak ada baseline rata-rata volume untuk dibandingkan — hanya volume 24h saat ini yang tersedia'),
  },
  {
    id: 'btc-above-200ma-nupl-low',
    description: 'BTC > +50% di atas 200d MA tapi NUPL < 0.5 (overextended price structure tapi holder belum euphoria → mid-cycle stretch, bukan top)',
    indicatorsInvolved: ['BTC vs 200d MA (%)', 'NUPL proxy'],
    // Closed — Step 8 Kategori B.
    evaluate: (i) => {
      const ma = i.onchain('BTC vs 200d MA (%)'), n = i.onchain('NUPL proxy');
      if (!ma || !n || ma.rawValue == null || n.rawValue == null) return notEvaluable('BTC vs 200d MA atau NUPL proxy tidak tersedia run ini');
      return evaluated(ma.rawValue > 50 && n.rawValue < 0.5);
    },
  },
  {
    id: 'trends-high-feargreed-low',
    description: 'Google Trends > 80 tapi Fear & Greed < 50 (retail FOMO tapi sentiment crypto belum konfirmasi → bisa false spike)',
    indicatorsInvolved: ['Google Trends "bitcoin"', 'Fear & Greed Index'],
    evaluate: (i) => {
      const t = i.crypto('Google Trends "bitcoin"'), g = i.crypto('Fear & Greed Index');
      if (!t || !g || t.rawValue == null || g.rawValue == null) return notEvaluable('Google Trends atau Fear & Greed tidak tersedia run ini (butuh SERPAPI_API_KEY)');
      return evaluated(t.rawValue > 80 && g.rawValue < 50);
    },
  },
  {
    id: 'trends-low-price-up',
    description: 'Google Trends < 20 tapi BTC price naik (harga naik tanpa retail interest → whale/institutional driven)',
    indicatorsInvolved: ['Google Trends "bitcoin"', 'BTC Price Change 24h (%)'],
    // Closed — Step 8 Kategori B. 24h-proxy for "naik", same convention as
    // hashrate-down-price-stable above.
    evaluate: (i) => {
      const t = i.crypto('Google Trends "bitcoin"'), px = i.crypto('BTC Price Change 24h (%)');
      if (!t || !px || t.rawValue == null || px.rawValue == null) return notEvaluable('Google Trends atau BTC Price Change 24h tidak tersedia run ini (Google Trends butuh SERPAPI_API_KEY)');
      return evaluated(t.rawValue < 20 && px.rawValue > 0, true);
    },
  },
  {
    id: 'reserve-up-price-up',
    description: 'Exchange Reserve naik 7d tapi BTC price juga naik (whale deposit ke exchange sambil harga naik → distribusi tersembunyi)',
    indicatorsInvolved: ['BTC Exchange Reserve (k BTC)', 'BTC Price Change 24h (%)'],
    // Closed — Step 8 Kategori B. "Naik 7d" for Exchange Reserve reuses the
    // fetcher's own signal (🔴 = rising, per the same convention as
    // reserve-up-sharp-nupl-low) — same unverified-exact-threshold caveat as
    // that rule. "Harga naik" uses the 24h proxy, same convention as above.
    evaluate: (i) => {
      const er = i.onchain('BTC Exchange Reserve (k BTC)'), px = i.crypto('BTC Price Change 24h (%)');
      if (!er || !px || px.rawValue == null) return notEvaluable('Exchange Reserve atau BTC Price Change 24h tidak tersedia run ini');
      return evaluated(er.signal === '🔴' && px.rawValue > 0, true);
    },
  },
  {
    id: 'reserve-down-sharp-mvrv-high',
    description: 'Exchange Reserve turun tajam (7d < -2%) tapi MVRV > 3.5 (akumulasi tapi valuasi sudah stretched → window distribusi dekat)',
    indicatorsInvolved: ['BTC Exchange Reserve (k BTC)', 'MVRV Ratio (true)'],
    evaluate: (i) => {
      const er = i.onchain('BTC Exchange Reserve (k BTC)'), mv = i.onchain('MVRV Ratio (true)');
      if (!er || !mv || mv.rawValue == null) return notEvaluable('Exchange Reserve atau MVRV tidak tersedia run ini');
      // Reuses the fetcher's own reserve-change signal (✅ = decline/akumulasi,
      // 🔴 = rise/distribusi, per formatter.js's own reference table: <-2% ✅,
      // >+2% 🔴) as the -2% threshold proxy. Caveat, reviewed but not resolved:
      // the exact numeric threshold the underlying CoinMetrics fetcher itself
      // uses to set this signal was never independently verified against this
      // specific -2%/+2% figure — only inferred from formatter.js's table, not
      // read from the fetcher's own source. Kept as `approximate` for that reason.
      return evaluated(er.signal === '✅' && mv.rawValue > 3.5, true);
    },
  },
  {
    id: 'reserve-up-sharp-nupl-low',
    description: 'Exchange Reserve naik tajam (7d > +2%) tapi NUPL < 0.25 (whale deposit di zona fear — bisa capitulation bottom, bukan distribusi)',
    indicatorsInvolved: ['BTC Exchange Reserve (k BTC)', 'NUPL proxy'],
    evaluate: (i) => {
      const er = i.onchain('BTC Exchange Reserve (k BTC)'), n = i.onchain('NUPL proxy');
      if (!er || !n || n.rawValue == null) return notEvaluable('Exchange Reserve atau NUPL proxy tidak tersedia run ini');
      // Same caveat as reserve-down-sharp-mvrv-high above: -2%/+2% threshold
      // inferred from formatter.js's table, not independently verified against
      // the fetcher's own source.
      return evaluated(er.signal === '🔴' && n.rawValue < 0.25, true);
    },
  },
  {
    id: 'etf-strongoutflow-reserve-down',
    description: 'ETF Flow proxy "Strong Outflow" tapi Exchange Reserve juga turun (ETF selloff tapi whale withdrawal — retail keluar, institusi akumulasi?)',
    indicatorsInvolved: ['ETF Flow proxy', 'BTC Exchange Reserve (k BTC)'],
    evaluate: (i) => {
      const etf = i.onchain('ETF Flow proxy'), er = i.onchain('BTC Exchange Reserve (k BTC)');
      if (!etf || !er || etf.rawValue == null) return notEvaluable('ETF Flow proxy atau Exchange Reserve tidak tersedia run ini');
      // "Strong Outflow" threshold (score < -2) quoted from formatter.js's own
      // THRESHOLD REFERENSI table for ETF Flow proxy.
      // BUG FIX (found on review): this rule needs "Exchange Reserve juga
      // turun" (declining) — same direction as reserve-down-sharp-mvrv-high
      // above, which correctly uses ✅ for decline. This previously used 🔴,
      // which reserve-up-sharp-nupl-low (a few rules up) uses for RISING —
      // the same real-world condition (reserve declining) was being checked
      // against opposite signal values in two different rules.
      return evaluated(etf.rawValue < -2 && er.signal === '✅', true);
    },
  },
  {
    id: 'etf-stronginflow-feargreed-low',
    description: 'ETF Flow proxy "Strong Inflow" tapi Fear & Greed < 30 (ETF demand tinggi di tengah fear — bisa early accumulation smart money)',
    indicatorsInvolved: ['ETF Flow proxy', 'Fear & Greed Index'],
    evaluate: (i) => {
      const etf = i.onchain('ETF Flow proxy'), g = i.crypto('Fear & Greed Index');
      if (!etf || !g || etf.rawValue == null || g.rawValue == null) return notEvaluable('ETF Flow proxy atau Fear & Greed tidak tersedia run ini');
      return evaluated(etf.rawValue > 2 && g.rawValue < 30);
    },
  },
  {
    id: 'cme-positive-basis-negative',
    description: 'CME Premium positif (>0%) tapi Perp Basis negatif/backwardation (<0%) — divergence institutional vs retail, sering precede reversal',
    indicatorsInvolved: ['BTC CME Futures Premium (%)', 'Basis Rate (annualized %)'],
    evaluate: (i) => {
      const cme = i.derivatives('BTC CME Futures Premium (%)'), b = i.derivatives('Basis Rate (annualized %)');
      if (!cme || !b || cme.rawValue == null || b.rawValue == null) return notEvaluable('CME Premium atau Basis Rate tidak tersedia run ini');
      return evaluated(cme.rawValue > 0 && b.rawValue < 0);
    },
  },
  {
    id: 'cme-negative-basis-positive',
    description: 'CME Premium negatif (<0%) tapi Perp Basis positif (>5%) — institutional exit duluan, retail leverage rentan unwind',
    indicatorsInvolved: ['BTC CME Futures Premium (%)', 'Basis Rate (annualized %)'],
    evaluate: (i) => {
      const cme = i.derivatives('BTC CME Futures Premium (%)'), b = i.derivatives('Basis Rate (annualized %)');
      if (!cme || !b || cme.rawValue == null || b.rawValue == null) return notEvaluable('CME Premium atau Basis Rate tidak tersedia run ini');
      return evaluated(cme.rawValue < 0 && b.rawValue > 5);
    },
  },
];

// Severity is derived systematically from the trust tier of the indicators
// involved — not 23 independent subjective judgment calls. Both HIGH trust →
// 'high'; either LOW/proxy → 'medium'. Whether 'high' severity divergences (or
// how many simultaneously) should count as Step 5's blocking "Critical" tier is
// deliberately left to Phase 2 (State Machine) to decide once it's clear how
// often 'high' actually fires in practice — not guessed here.
function deriveSeverity(providersOutput, indicatorNames) {
  const i = idx(providersOutput);
  const all = ['macro', 'crypto', 'derivatives', 'onchain']
    .flatMap(cat => providersOutput[cat]?.indicators ?? []);
  const tiers = indicatorNames.map(name => all.find(x => x.name === name)?.trustTier ?? 'low');
  return tiers.every(t => t === 'high') ? 'high' : 'medium';
}

export function evaluateDivergences(providersOutput) {
  const i = idx(providersOutput);
  const results = RULES.map(rule => {
    const r = rule.evaluate(i);
    return {
      id: rule.id,
      description: rule.description,
      indicatorsInvolved: rule.indicatorsInvolved,
      evaluable: r.evaluable,
      fired: r.fired,
      approximate: !!r.approximate,
      reason: r.reason ?? null,
      severity: r.evaluable && r.fired ? deriveSeverity(providersOutput, rule.indicatorsInvolved) : null,
    };
  });

  return {
    total: RULES.length,
    evaluated: results.filter(r => r.evaluable).length,
    notEvaluable: results.filter(r => !r.evaluable).length,
    fired: results.filter(r => r.fired),
    all: results,
  };
}

export { RULES };
