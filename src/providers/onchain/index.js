// ============================================
// ON-CHAIN PROVIDER
// (NUPL/SOPR proxy, MVRV true, Realized Cap, Exchange Reserve/Flow, Hash Rate,
// Active Addresses, Miner Revenue, Output Volume, NVT, ETF Flow proxy, Pi Cycle)
//
// STRUCTURAL FIX for N-C: NVT ratio was computed independently in up to 4
// presentation-layer locations, with THRESHOLD VALUES that had already drifted —
// telegram-sender.js and discord-sender.js used legacy 2017-era bands (35/65) that
// this project's own formatter.js comment explicitly calls outdated for modern BTC,
// while formatter.js itself used the updated 50/150/300 bands (verified correct
// live this session: real NVT ≈192 today classifies sensibly as "elevated" under
// 50/150/300, but would max out the crude "stretched" bucket under 35/65 with no
// discriminating power). Computed exactly ONCE here, with the verified-correct
// thresholds — this is the class of bug the new Indicator/DataSource contract is
// meant to make structurally impossible going forward.
// ============================================

import {
  fetchNuplProxy, fetchBlockchainInfoBundle, fetchHashRate,
  fetchBtcOnChainCoinMetrics, fetchBtcEtfFlow,
} from '../../fetchers/daily.js';
import { fetchExchangeNetflow } from '../../fetchers/weekly.js';
import { makeIndicator } from '../shared/indicator.js';
import { dataSourceFromLegacy, makeDataSource } from '../shared/dataSource.js';
import { MEASUREMENT_TYPE, TRUST_TIER } from '../shared/confidenceTiers.js';

function computeNvtSignal(nvtRatio) {
  if (nvtRatio == null) return null;
  if (nvtRatio < 50)  return '✅ undervalued relative to network usage (Phase 1 akumulasi)';
  if (nvtRatio < 150) return '⚠️ fair value (modern range)';
  if (nvtRatio < 300) return '🔴 elevated — overvalued atau on-chain TX shifting off-chain (cross-check MVRV)';
  return '🔴 sangat tinggi — Phase 3/4 distribusi atau ekstrem off-chain shift';
}

// `btcPrice` — spot price from the Crypto provider, needed to convert BTC-denominated
// tx volume into USD for the NVT ratio.
export async function fetchOnChainSnapshot(btcPrice = null) {
  const [nupl, bcBundle, hashRate, coinMetrics, etfFlow, exNetflow] = await Promise.all([
    fetchNuplProxy(),
    fetchBlockchainInfoBundle(),
    fetchHashRate(),
    fetchBtcOnChainCoinMetrics(),
    fetchBtcEtfFlow(),
    fetchExchangeNetflow(),
  ]);

  const txVolBtc  = bcBundle?.txVolume?.avg7dBtc ?? null;
  const mktCapB   = coinMetrics?.mktCapBillion ?? null;
  const txVolUsdB = (txVolBtc != null && btcPrice != null) ? (txVolBtc * btcPrice / 1e9) : null;
  const nvtRatio  = (mktCapB != null && txVolUsdB != null && txVolUsdB > 0)
    ? parseFloat((mktCapB / txVolUsdB).toFixed(1)) : null;
  const nvtSignal = computeNvtSignal(nvtRatio);

  const realizedMult = (nupl?.currentPrice && nupl?.realizedPriceProxy)
    ? parseFloat((nupl.currentPrice / nupl.realizedPriceProxy).toFixed(2)) : null;

  const indicators = [
    makeIndicator({
      name: 'NUPL proxy', category: 'onchain',
      // Approximates true NUPL via a realized-price proxy, not actual UTXO
      // cost-basis distribution. Redundant with SOPR proxy / Realized Price
      // Multiple / MVRV true — all measure "price vs cost-basis" differently;
      // per Step 4B, only MVRV true (below) has sound methodology in this cluster.
      measurementType: MEASUREMENT_TYPE.PROXY, trustTier: TRUST_TIER.LOW,
      rawValue: nupl?.nupl ?? null, signal: nupl?.nuplSignal ?? null, bounds: null,
      source: makeDataSource({ provider: 'derived (realized-price proxy)', skipped: !nupl }),
    }),
    makeIndicator({
      name: 'SOPR proxy', category: 'onchain',
      measurementType: MEASUREMENT_TYPE.PROXY, trustTier: TRUST_TIER.LOW, // same redundancy cluster as NUPL proxy
      rawValue: nupl?.sopr ?? null, signal: nupl?.soprSignal ?? null, bounds: null,
      source: makeDataSource({ provider: 'derived (30d MA proxy)', skipped: !nupl }),
    }),
    makeIndicator({
      name: 'Realized Price Multiple (MVRV proxy)', category: 'onchain',
      // Nearly a pure duplicate of NUPL proxy (same underlying ratio). Step 4B's
      // recommendation: don't weight this AND NUPL proxy as independent inputs.
      measurementType: MEASUREMENT_TYPE.PROXY, trustTier: TRUST_TIER.LOW,
      rawValue: realizedMult, signal: null, bounds: null,
      source: makeDataSource({ provider: 'derived (duplicate of NUPL proxy ratio)', skipped: realizedMult == null }),
    }),
    makeIndicator({
      name: 'MVRV Ratio (true)', category: 'onchain',
      // The one methodologically sound member of the NUPL/SOPR/MVRV cluster —
      // real market-cap/realized-cap ratio from CoinMetrics.
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: coinMetrics?.mvrv?.value ?? null, signal: coinMetrics?.mvrv?.signal ?? null,
      bounds: { min: 0.5, max: 6, hint: '<1.0 capitulation, >3.5 distribusi' },
      source: makeDataSource({ provider: 'CoinMetrics community', skipped: !coinMetrics?.mvrv }),
    }),
    makeIndicator({
      name: 'Realized Cap ($B)', category: 'onchain',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: coinMetrics?.realizedCap?.valueBillion ?? null, signal: coinMetrics?.realizedCap?.signal ?? null,
      bounds: null,
      source: makeDataSource({ provider: 'CoinMetrics community', skipped: !coinMetrics?.realizedCap }),
    }),
    makeIndicator({
      name: 'NVT Signal', category: 'onchain',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH, // both inputs (market cap, tx volume) are official; N-C fix — computed once, verified-correct thresholds
      rawValue: nvtRatio, signal: nvtSignal, bounds: null,
      source: makeDataSource({ provider: 'derived (CoinMetrics cap + blockchain.info volume, N-C fix)', skipped: nvtRatio == null }),
    }),
    makeIndicator({
      name: 'BTC Exchange Reserve (k BTC)', category: 'onchain',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: coinMetrics?.exchangeReserve?.current != null ? parseFloat((coinMetrics.exchangeReserve.current / 1000).toFixed(1)) : null,
      signal: coinMetrics?.exchangeReserve?.signal ?? null, bounds: null,
      source: makeDataSource({ provider: 'CoinMetrics community', skipped: !coinMetrics?.exchangeReserve }),
    }),
    makeIndicator({
      // Directional convention reused from the established "BTC Exchange Reserve
      // 7d" band (formatter.js: rising reserve = whale deposit = distribusi =
      // bearish; falling reserve = withdrawal = akumulasi = bullish) — net inflow
      // to exchanges is the same underlying movement as rising reserve, just
      // measured as a daily flow instead of a level change. Not a new invented
      // interpretation, the sign convention this fetcher's own `label` field
      // ("inflow"/"outflow") already encodes.
      name: 'BTC Exchange Flow (daily net, BTC)', category: 'onchain',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: coinMetrics?.exchangeFlow?.netflow ?? null,
      signal: coinMetrics?.exchangeFlow?.netflow == null ? null
        : coinMetrics.exchangeFlow.netflow > 0 ? '🔴' : coinMetrics.exchangeFlow.netflow < 0 ? '✅' : '⚠️',
      bounds: null,
      source: makeDataSource({ provider: 'CoinMetrics community', skipped: !coinMetrics?.exchangeFlow }),
    }),
    makeIndicator({
      // Same reserve-direction convention as the daily Exchange Flow indicator
      // above, applied to the weekly aggregate.
      name: 'BTC Exchange Netflow (weekly)', category: 'onchain',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: exNetflow?.netflow ?? null,
      signal: exNetflow?.netflow == null ? null
        : exNetflow.netflow > 0 ? '🔴' : exNetflow.netflow < 0 ? '✅' : '⚠️',
      bounds: null,
      source: dataSourceFromLegacy('CoinMetrics community', exNetflow),
    }),
    makeIndicator({
      name: 'Exchange Inflow Acceleration WoW (%)', category: 'onchain',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: coinMetrics?.flowAcceleration ?? null, signal: coinMetrics?.flowAccelSignal ?? null, bounds: null,
      source: makeDataSource({ provider: 'derived (CoinMetrics)', skipped: coinMetrics?.flowAcceleration == null }),
    }),
    makeIndicator({
      // Threshold quoted from formatter.js's THRESHOLD REFERENSI table (Hash Rate
      // WoW: <-5% miner capitulation/bearish, -1-+1% netral, >+1% miner
      // confidence naik/bullish). Computed from `.weekChange`, not the `.trend`
      // text field (which is a plain word like "naik", not a classified signal).
      name: 'Hash Rate (EH/s, 7d avg)', category: 'onchain',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: hashRate?.latestEH ?? null,
      signal: hashRate?.weekChange == null ? null
        : hashRate.weekChange < -5 ? '🔴' : hashRate.weekChange > 1 ? '✅' : '⚠️',
      bounds: { min: 400, max: 1200, hint: 'cek unit (TH/s vs EH/s) atau stale data' },
      source: dataSourceFromLegacy('blockchain.info', hashRate),
    }),
    makeIndicator({
      // Threshold quoted from formatter.js's THRESHOLD REFERENSI table (Active
      // Addresses WoW: <-10% capitulation/bearish, -2-+2% netral, >+2% adoption
      // naik/bullish). Computed from `.weekChange`, not the `.trend` text.
      name: 'Active Addresses (7d avg)', category: 'onchain',
      // CLAUDE.md's own documented proxy for CoinMetrics' blocked SplyAct1yr metric.
      measurementType: MEASUREMENT_TYPE.PROXY, trustTier: TRUST_TIER.HIGH,
      rawValue: bcBundle?.activeAddresses?.avg7d ?? null,
      signal: bcBundle?.activeAddresses?.weekChange == null ? null
        : bcBundle.activeAddresses.weekChange < -10 ? '🔴' : bcBundle.activeAddresses.weekChange > 2 ? '✅' : '⚠️',
      bounds: null,
      source: makeDataSource({ provider: 'blockchain.info (documented proxy)', skipped: !bcBundle?.activeAddresses }),
    }),
    makeIndicator({
      // Threshold quoted from formatter.js's THRESHOLD REFERENSI table (Miner
      // Revenue WoW: <-20% capitulation risk/bearish, -2-+2% netral, >+2% miner
      // confidence/bullish). Computed from `.weekChange`, not the `.trend` text.
      name: 'Miner Revenue ($M/day)', category: 'onchain',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: bcBundle?.minerRevenue?.revMillion ?? null,
      signal: bcBundle?.minerRevenue?.weekChange == null ? null
        : bcBundle.minerRevenue.weekChange < -20 ? '🔴' : bcBundle.minerRevenue.weekChange > 2 ? '✅' : '⚠️',
      bounds: null,
      source: makeDataSource({ provider: 'blockchain.info', skipped: !bcBundle?.minerRevenue }),
    }),
    makeIndicator({
      name: 'Coin Velocity proxy (output volume, BTC/day)', category: 'onchain',
      // The number itself is real on-chain data; the "HODL signal" interpretation
      // layered on top of it is an inference, not a direct measurement.
      measurementType: MEASUREMENT_TYPE.PROXY, trustTier: TRUST_TIER.HIGH,
      rawValue: bcBundle?.outputVolume?.avg7dBtc ?? null, signal: bcBundle?.outputVolume?.hodlSignal ?? null,
      bounds: { min: 200000, max: 2000000, hint: 'cek unit' },
      source: makeDataSource({ provider: 'blockchain.info', skipped: !bcBundle?.outputVolume }),
    }),
    makeIndicator({
      name: 'BTC TX Volume (BTC/day)', category: 'onchain',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: txVolBtc, signal: null,
      bounds: { min: 50000, max: 500000, hint: 'cek denominator/source' },
      source: makeDataSource({ provider: 'blockchain.info', skipped: txVolBtc == null }),
    }),
    makeIndicator({
      name: 'ETF Flow proxy', category: 'onchain',
      // Explicitly labeled "estimasi" in the existing codebase — volume-price
      // sentiment proxy, not real ETF flow data.
      measurementType: MEASUREMENT_TYPE.PROXY, trustTier: TRUST_TIER.LOW,
      rawValue: etfFlow?.score ?? null, signal: etfFlow?.signal ?? null, bounds: null,
      source: makeDataSource({ provider: 'derived (Yahoo Finance volume-price estimate)', skipped: !etfFlow }),
    }),
    makeIndicator({
      name: 'Pi Cycle Top gap (%)', category: 'onchain',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH, // published technical indicator with a real track record, though uncited in this code
      rawValue: nupl?.piCycle?.gapPct ?? null, signal: nupl?.piCycle?.signal ?? null, bounds: null,
      source: makeDataSource({ provider: 'derived (BTC price history, MA111 vs 2×MA350)', skipped: !nupl?.piCycle }),
    }),
  ];

  return { indicators };
}
