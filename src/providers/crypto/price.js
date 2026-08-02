// ============================================
// CRYPTO PROVIDER — price/dominance/sentiment sub-source
//
// Wraps daily.js's fetchCryptoData (BTC/ETH/SOL/AVAX/XRP price + dominance),
// fetchFearGreed, and fetchGoogleTrends.
// ============================================

import { fetchCryptoData, fetchFearGreed, fetchGoogleTrends } from '../../fetchers/daily.js';
import { makeIndicator } from '../shared/indicator.js';
import { dataSourceFromLegacy, makeDataSource } from '../shared/dataSource.js';
import { MEASUREMENT_TYPE, TRUST_TIER } from '../shared/confidenceTiers.js';

export async function fetchCryptoPriceIndicators(config = {}) {
  const [crypto, fearGreed, googleTrends] = await Promise.all([
    fetchCryptoData(),
    fetchFearGreed(),
    fetchGoogleTrends(config.serpApiKey),
  ]);

  const src = makeDataSource({ provider: 'CoinGecko/CMC', skipped: !crypto });

  const indicators = [
    makeIndicator({
      name: 'BTC Price', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: crypto?.btc?.price ?? null, signal: null,
      bounds: { min: 10000, max: 300000, hint: 'cek source/unit' },
      source: src,
    }),
    makeIndicator({
      name: 'BTC Volume 24h ($B)', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: crypto?.btc?.volume24hBillion ?? null, signal: null,
      bounds: { min: 10, max: 80, hint: 'global aggregate, bukan single-exchange' },
      source: src,
    }),
    makeIndicator({
      name: 'BTC Dominance (%)', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: crypto?.btcDominance ?? null, signal: null,
      bounds: { min: 35, max: 75, hint: 'cek skala (0-1 vs 0-100)' },
      source: src,
    }),
    makeIndicator({
      // No established bullish/bearish band for a bare 24h% change in
      // formatter.js — exists to give DivergenceEngine's rules (Step 8 Kategori
      // B: hashrate-down-price-stable, trends-low-price-up, reserve-up-price-up)
      // a real directional value instead of "not evaluable". 24h window, not a
      // true WoW change — same 24h-proxy convention formatter.js's own
      // dirFromDailyDiff() already uses elsewhere for alt ratios when weekly
      // data is unavailable.
      name: 'BTC Price Change 24h (%)', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: crypto?.btc?.change24h ?? null, signal: null, bounds: null,
      source: src,
    }),
    makeIndicator({
      name: 'ETH Price', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: crypto?.eth?.price ?? null, signal: null, bounds: null,
      source: src,
    }),
    makeIndicator({
      // Threshold quoted from formatter.js's THRESHOLD REFERENSI table
      // (<25 bearish, 25-60 netral, >60 bullish).
      name: 'Fear & Greed Index', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH, // established external index, not self-invented
      rawValue: fearGreed?.value ?? null,
      signal: fearGreed?.value == null ? null : fearGreed.value < 25 ? '🔴' : fearGreed.value > 60 ? '✅' : '⚠️',
      bounds: { min: 0, max: 100, hint: 'out-of-bound = bug' },
      source: dataSourceFromLegacy('alternative.me', fearGreed),
    }),
    makeIndicator({
      name: 'Google Trends "bitcoin"', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.LOW, // data itself is real, but causal link to price phase is weak/indirect per Step 4B
      rawValue: googleTrends?.currentValue ?? null, signal: googleTrends?.signal ?? null,
      bounds: null,
      source: dataSourceFromLegacy('SerpAPI (Google Trends)', googleTrends),
    }),
  ];

  return { indicators, raw: crypto };
}
