// ============================================
// CRYPTO PROVIDER — aggregator
// Combines price/dominance/sentiment + market-structure + rotation sub-sources.
// ============================================

import { fetchCryptoPriceIndicators } from './price.js';
import { fetchCryptoMarketStructureIndicators } from './marketStructure.js';
import { fetchCryptoRotationIndicators } from './rotation.js';

export async function fetchCryptoSnapshot(config = {}) {
  // price fetched first — its raw crypto data is reused by market-structure
  // (stablecoin fields) and rotation (24h-proxy fallback) so we don't hit
  // CoinGecko/CMC redundantly for the same underlying data.
  const price = await fetchCryptoPriceIndicators(config);

  const [marketStructure, rotation] = await Promise.all([
    fetchCryptoMarketStructureIndicators(config, price.raw),
    fetchCryptoRotationIndicators(price.raw),
  ]);

  return {
    category: 'crypto',
    indicators: [
      ...price.indicators,
      ...marketStructure.indicators,
      ...rotation.indicators,
    ],
    fetchedAt: new Date().toISOString(),
  };
}
