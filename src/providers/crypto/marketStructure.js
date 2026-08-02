// ============================================
// CRYPTO PROVIDER — market structure sub-source
// (TOTAL2/TOTAL3/OTHERS.D, TVL DeFi, L2 TVL, Stablecoin supply/dominance/growth)
//
// STRUCTURAL FIX for N-E: Stablecoin Supply Growth WoW% was computed independently
// in 4 locations (formatter.js twice, telegram-sender.js, discord-sender.js) — same
// formula copy-pasted with renamed variables each time. Computed exactly ONCE here;
// every consumer must read `.rawValue`/`.signal` from this indicator, never
// recompute the WoW% themselves.
// ============================================

import { fetchCoinMarketCapGlobal, fetchL2TVL } from '../../fetchers/daily.js';
import { fetchDefiTVL, fetchOthersDominance } from '../../fetchers/weekly.js';
import { getPrevWeekSnapshot } from '../../db.js';
import { makeIndicator } from '../shared/indicator.js';
import { dataSourceFromLegacy, makeDataSource } from '../shared/dataSource.js';
import { MEASUREMENT_TYPE, TRUST_TIER } from '../shared/confidenceTiers.js';

// `cryptoRaw` = the raw object returned by fetchCryptoData() (crypto/price.js already
// fetched it) — passed in so we don't re-fetch the same CoinGecko data twice.
export async function fetchCryptoMarketStructureIndicators(config = {}, cryptoRaw = null) {
  const [cmc, othersDom, l2tvl, defiTvl] = await Promise.all([
    fetchCoinMarketCapGlobal(config.coinMarketCapApiKey),
    fetchOthersDominance(),
    fetchL2TVL(),
    fetchDefiTVL(),
  ]);

  const stableTotal  = cryptoRaw?.stablecoinSupply?.total ?? null;
  const totalMcapB   = cryptoRaw?.totalMarketCapBillion ?? null;
  const stableDomPct = (stableTotal != null && totalMcapB) ? parseFloat((stableTotal / totalMcapB * 100).toFixed(2)) : null;

  const prevWeek        = getPrevWeekSnapshot();
  const stablePrevWeek  = prevWeek?.stablecoin_billion ?? null;
  const stableGrowthWoW = (stableTotal != null && stablePrevWeek != null && stablePrevWeek > 0)
    ? parseFloat(((stableTotal - stablePrevWeek) / stablePrevWeek * 100).toFixed(2))
    : null;
  const stableGrowthSignal = stableGrowthWoW == null ? null
    : stableGrowthWoW > 5   ? '✅ Tether printing — bullish Phase 1/2'
    : stableGrowthWoW > 2   ? '✅ supply naik'
    : stableGrowthWoW > -1  ? '⚠️ flat/stagnant'
    :                         '🔴 supply kontraksi — rotasi ke cash';

  // --- Step 8 Phase 1, Kategori B: TOTAL2 WoW% and BTC Dominance WoW closure ---
  // Same `prevWeek` snapshot already fetched above for Stablecoin Growth WoW —
  // reused here, not a second db.js call. No established bullish/bearish band
  // for either in formatter.js, so no `.signal` is computed — these exist only
  // to give DivergenceEngine's rules a real directional value to check, per
  // Step 8's Kategori B closure plan.
  const total2Raw = cmc?.total2 ?? null;
  const total2PrevWeek = prevWeek?.total2_trillion ?? null;
  const total2WoWPct = (total2Raw != null && total2PrevWeek != null && total2PrevWeek > 0)
    ? parseFloat(((total2Raw - total2PrevWeek) / total2PrevWeek * 100).toFixed(2))
    : null;

  const btcDomRaw = cryptoRaw?.btcDominance ?? null;
  const btcDomPrevWeek = prevWeek?.btc_dominance ?? null;
  // Point difference (not % change), matching formatter.js's own existing
  // btcDomDeltaStr convention for this exact metric.
  const btcDomWoWDelta = (btcDomRaw != null && btcDomPrevWeek != null)
    ? parseFloat((btcDomRaw - btcDomPrevWeek).toFixed(2))
    : null;

  const indicators = [
    makeIndicator({
      name: 'TOTAL2', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: cmc?.total2 ?? null, signal: null, bounds: null,
      source: makeDataSource({ provider: 'CoinMarketCap', skipped: !cmc || cmc.skipped }),
    }),
    makeIndicator({
      name: 'TOTAL3', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: cmc?.total3 ?? null, signal: null, bounds: null,
      source: makeDataSource({ provider: 'CoinMarketCap', skipped: !cmc || cmc.skipped }),
    }),
    makeIndicator({
      name: 'OTHERS.D (%)', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: cmc?.othersDominance ?? othersDom?.othersDominance ?? null, signal: null, bounds: null,
      source: makeDataSource({ provider: 'CoinMarketCap/CoinGecko', skipped: !cmc?.othersDominance && !othersDom }),
    }),
    makeIndicator({
      // Threshold quoted from formatter.js's THRESHOLD REFERENSI table (TVL DeFi
      // WoW: <-5% bearish, -5-+5% netral, >+5% bullish).
      name: 'TVL DeFi ($B)', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: defiTvl?.tvl ?? null,
      signal: defiTvl?.changePercent == null ? null
        : defiTvl.changePercent < -5 ? '🔴' : defiTvl.changePercent > 5 ? '✅' : '⚠️',
      bounds: { min: 30, max: 300, hint: 'cek unit' },
      source: dataSourceFromLegacy('DefiLlama', defiTvl),
    }),
    makeIndicator({
      name: 'L2 TVL Total ($B)', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: l2tvl?.totalBillion ?? null, signal: l2tvl?.signal ?? null,
      // No bounds check: $8B/$15B are signal-classification tiers (risk-off/growing/
      // mature, from formatter.js's threshold-reference table), not a sanity/
      // outlier range — a value below $8B is a valid market condition, not a scale
      // bug. CLAUDE.md's actual Sanity Bounds table has no entry for L2 TVL.
      bounds: null,
      source: makeDataSource({ provider: 'DefiLlama', skipped: !l2tvl }),
    }),
    makeIndicator({
      name: 'Stablecoin Total ($B)', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: stableTotal, signal: null,
      bounds: { min: 50, max: 500, hint: 'cek source' },
      source: makeDataSource({ provider: 'CoinGecko/CMC', skipped: stableTotal == null }),
    }),
    makeIndicator({
      // Threshold quoted from formatter.js's THRESHOLD REFERENSI table
      // (>6% risk-off/bearish, 3-6% netral, <3% risk-on/bullish).
      name: 'Stablecoin Dominance (%)', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: stableDomPct,
      signal: stableDomPct == null ? null : stableDomPct > 6 ? '🔴' : stableDomPct < 3 ? '✅' : '⚠️',
      bounds: null,
      source: makeDataSource({ provider: 'derived', skipped: stableDomPct == null }),
    }),
    makeIndicator({
      name: 'Stablecoin Supply Growth WoW (%)', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: stableGrowthWoW, signal: stableGrowthSignal,
      // -1/2/5 are signal-classification tiers (flat/growing/printing), NOT a
      // sanity/outlier range — >5% is an expected, valid "Tether printing" reading,
      // not a scale bug (this exact confusion was caught live in Step 6's own
      // smoke test: the bounds check below fired on a value the signal logic
      // right above it correctly and legitimately classified as bullish). This
      // bound is a genuine outlier catch instead — values this extreme in either
      // direction most likely mean a unit/denominator error, not real market
      // movement.
      bounds: { min: -50, max: 100, hint: 'nilai seekstrem ini kemungkinan bug unit/denominator, bukan pergerakan pasar asli' },
      source: makeDataSource({
        provider: 'derived (current vs 7d-ago daily_snapshot)',
        skipped: stableGrowthWoW == null,
        skipReason: stableGrowthWoW == null ? 'no 7d-ago snapshot available yet in daily_snapshot' : null,
      }),
    }),
    makeIndicator({
      // No established bullish/bearish band for TOTAL2 WoW in formatter.js —
      // exists to give DivergenceEngine a real directional value (Step 8
      // Kategori B), not for category scoring.
      name: 'TOTAL2 WoW (%)', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: total2WoWPct, signal: null, bounds: null,
      source: makeDataSource({
        provider: 'derived (current vs 7d-ago daily_snapshot)',
        skipped: total2WoWPct == null,
        skipReason: total2WoWPct == null ? 'no 7d-ago snapshot available yet, or TOTAL2 unavailable this run' : null,
      }),
    }),
    makeIndicator({
      // Point difference (not % change), matching formatter.js's own
      // btcDomDeltaStr convention. No established bullish/bearish band —
      // exists for DivergenceEngine (Step 8 Kategori B), not category scoring.
      name: 'BTC Dominance WoW (pts)', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: btcDomWoWDelta, signal: null, bounds: null,
      source: makeDataSource({
        provider: 'derived (current vs 7d-ago daily_snapshot)',
        skipped: btcDomWoWDelta == null,
        skipReason: btcDomWoWDelta == null ? 'no 7d-ago snapshot available yet, or BTC Dominance unavailable this run' : null,
      }),
    }),
  ];

  return { indicators };
}
