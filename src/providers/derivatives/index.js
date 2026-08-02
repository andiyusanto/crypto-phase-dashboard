// ============================================
// DERIVATIVES PROVIDER
// (Funding, OI, Basis, Long/Short, CME Premium, Deribit IV proxy, Phase 4 Skew,
// Funding Streak)
//
// STRUCTURAL FIXES:
// - N-D — Phase 4 skew (basis-funding divergence) was computed independently in 4
//   locations; the 3-branch version (missing the "Phase 3 late" case) had already
//   diverged from the 5-branch version before this session's hotfix realigned them.
//   The canonical 5-branch version is implemented ONCE here — every consumer reads
//   `.signal`, none recompute it.
// - N-A/N-E — CME Premium % was independently recomputed in 4 locations from the
//   same `futuresPrice - spot` formula. Computed ONCE here.
// ============================================

import {
  fetchFundingRates, fetchBtcDerivativesBundle, fetchLongShortRatio,
  fetchBtcCmePremium, fetchDeribitIV,
} from '../../fetchers/daily.js';
import { saveFundingRate, getFundingRateHistory } from '../../db.js';
import { makeIndicator } from '../shared/indicator.js';
import { dataSourceFromLegacy, makeDataSource } from '../shared/dataSource.js';
import { MEASUREMENT_TYPE, TRUST_TIER } from '../shared/confidenceTiers.js';

// Assumes saveFundingRate() has already been called by the caller for today's
// funding rate before this runs, so the streak includes today's value.
function computeFundingStreak() {
  const history = getFundingRateHistory(14);
  if (!history.length) return { streakDays: 0, avgRate7d: null, signal: null };

  let streakDays = 0;
  for (const row of history) {
    if ((row.btc_rate ?? 0) > 0.05) streakDays++;
    else break;
  }
  const avg7 = history.slice(0, 7);
  const avgRate7d = avg7.length
    ? parseFloat((avg7.reduce((s, r) => s + (r.btc_rate ?? 0), 0) / avg7.length).toFixed(4))
    : null;
  const signal = streakDays >= 7 ? '🔴 overleveraged — streak panjang Phase 3'
    : streakDays >= 3 ? '⚠️ funding persistent tinggi'
    : '✅ normal';
  return { streakDays, avgRate7d, signal };
}

// Canonical Phase 4 skew classification — single source of truth (N-D fix).
function computePhase4Skew(basisAnn, fundBtc) {
  if (basisAnn == null || fundBtc == null) return null;
  if (basisAnn < 0) return '🔴 backwardation — institutional short/hedge, exit signal';
  if (basisAnn < 5 && fundBtc > 0.05) return '🔴 basis-funding diverge — puts premium implied, Phase 4 distribusi';
  if (basisAnn < 10 && fundBtc > 0.03) return '⚠️ basis melemah — institutional hedging mulai';
  if (basisAnn > 15 && fundBtc > 0.05) return '⚠️ contango + funding tinggi — Phase 3 late';
  return '✅ normal';
}

// `btcPrice` — spot price from the Crypto provider, needed for CME premium %.
export async function fetchDerivativesSnapshot(btcPrice = null) {
  const [funding, derivBundle, longShort, cme, deribitIV] = await Promise.all([
    fetchFundingRates(),
    fetchBtcDerivativesBundle(btcPrice),
    fetchLongShortRatio(),
    fetchBtcCmePremium(),
    fetchDeribitIV(),
  ]);

  if (funding?.btc != null) {
    saveFundingRate({ btcRate: funding.btc, ethRate: funding.eth, source: funding.source });
  }
  const streak = computeFundingStreak();

  const basisAnn = derivBundle?.basis?.annualizedPct ?? null;
  const fundBtc  = funding?.btc ?? null;
  const skewSignal = computePhase4Skew(basisAnn, fundBtc);

  const cmePremiumPct = (cme?.futuresPrice != null && btcPrice != null && btcPrice > 0)
    ? parseFloat(((cme.futuresPrice - btcPrice) / btcPrice * 100).toFixed(2))
    : null;

  const indicators = [
    makeIndicator({
      // Threshold quoted from formatter.js's THRESHOLD REFERENSI table
      // (<-0.05% bearish, -0.05-0.05% netral, >0.05% bullish — this project's own
      // established convention, not reinterpreted here).
      name: 'BTC Funding Rate 8h (%)', category: 'derivatives',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: fundBtc,
      signal: fundBtc == null ? null : fundBtc < -0.05 ? '🔴' : fundBtc > 0.05 ? '✅' : '⚠️',
      bounds: { min: -1, max: 1, hint: 'raw decimal vs %' },
      source: makeDataSource({ provider: funding?.source ?? 'exchange aggregate', skipped: fundBtc == null }),
    }),
    makeIndicator({
      name: 'Funding Rate Streak (days > 0.05%)', category: 'derivatives',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH, // built from stored funding_rate_history — already backtestable per Step 4B
      rawValue: streak.streakDays, signal: streak.signal, bounds: null,
      source: makeDataSource({ provider: 'derived (funding_rate_history)', skipped: streak.avgRate7d == null }),
    }),
    makeIndicator({
      // Threshold quoted from formatter.js's THRESHOLD REFERENSI table ($15-30B
      // netral, >$30B ekspansi/bullish). The table's bearish case is described as
      // "kontraksi tajam" (a rate-of-change condition) rather than a clean
      // absolute-level band — we only have the absolute level here, not a WoW
      // change for OI, so <$15B is treated as the closest available proxy for
      // that bearish case. Simplification is intentional and noted, not hidden.
      name: 'Open Interest BTC ($B)', category: 'derivatives',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: derivBundle?.oi?.totalBillion ?? null,
      signal: derivBundle?.oi?.totalBillion == null ? null
        : derivBundle.oi.totalBillion < 15 ? '🔴' : derivBundle.oi.totalBillion > 30 ? '✅' : '⚠️',
      bounds: null,
      source: makeDataSource({ provider: derivBundle?.oi?.source ?? 'multi-exchange', skipped: !derivBundle?.oi }),
    }),
    makeIndicator({
      name: 'Basis Rate (annualized %)', category: 'derivatives',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: basisAnn, signal: derivBundle?.basis?.signal ?? null, bounds: null,
      source: makeDataSource({ provider: derivBundle?.basis?.source ?? 'multi-exchange', skipped: basisAnn == null }),
    }),
    makeIndicator({
      name: 'Perp Sentiment Proxy', category: 'derivatives',
      // Self-invented (`-avgFunding × 100`), substitutes for Deribit options skew
      // (ISP-blocked). Best-documented of the invented metrics per Step 4B, but
      // still no external benchmark — advisory tier.
      measurementType: MEASUREMENT_TYPE.INVENTED, trustTier: TRUST_TIER.LOW,
      rawValue: derivBundle?.skew?.skewProxy ?? null, signal: derivBundle?.skew?.signal ?? null,
      bounds: { min: -30, max: 30, hint: 'jika |value| > 30 cek funding rate raw — kemungkinan exchange outlier' },
      source: makeDataSource({ provider: 'derived (funding-based proxy)', skipped: !derivBundle?.skew }),
    }),
    makeIndicator({
      name: 'Phase 4 Skew (basis-funding divergence)', category: 'derivatives',
      // Self-invented composite substitute for Deribit options skew. Computed once
      // here — N-D fix.
      measurementType: MEASUREMENT_TYPE.INVENTED, trustTier: TRUST_TIER.LOW,
      rawValue: null, signal: skewSignal, bounds: null,
      source: makeDataSource({ provider: 'derived (basis + funding, N-D fix)', skipped: skewSignal == null }),
    }),
    makeIndicator({
      name: 'Long/Short Ratio', category: 'derivatives',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: longShort?.ratio ?? null, signal: longShort?.signal ?? null, bounds: null,
      source: makeDataSource({ provider: longShort?.source ?? 'exchange', skipped: !longShort }),
    }),
    makeIndicator({
      name: 'BTC CME Futures Premium (%)', category: 'derivatives',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: cmePremiumPct, signal: null, bounds: null,
      // N-A/N-E fix: computed once here instead of independently in 4 presentation-layer locations.
      source: makeDataSource({ provider: cme?.source ?? 'CME proxy', skipped: cmePremiumPct == null }),
    }),
    makeIndicator({
      name: 'BTC RVol 30d (Deribit IV proxy)', category: 'derivatives',
      // Realized vol substituting for Deribit's implied vol (ISP-blocked) — these
      // are conceptually different (backward- vs forward-looking), not just an
      // estimate of the same number. Step 4B flagged this distinction explicitly.
      measurementType: MEASUREMENT_TYPE.PROXY, trustTier: TRUST_TIER.LOW,
      rawValue: deribitIV?.value ?? null, signal: deribitIV?.signal ?? null, bounds: null,
      source: dataSourceFromLegacy(deribitIV?.source ?? 'computed', deribitIV),
    }),
  ];

  return { indicators };
}
