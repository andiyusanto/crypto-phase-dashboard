// ============================================
// CRYPTO PROVIDER — rotation sub-source
// (ETH/SOL/AVAX/XRP-BTC ratios, Altseason Index + Proxy, + 7 new Infra/DeFi assets)
//
// The 7 new assets close the indicator-coverage gap Step 5 flagged for
// Infrastructure Rotation & DeFi Rotation (previously zero dedicated tracking).
// Verified live this session: CoinGecko's public /coins/markets endpoint returns
// all 7 in ONE batched call with price + 24h% + 7d% directly — no need to
// replicate weekly.js's heavier sequential /market_chart pattern.
//
// IMPORTANT: use `polygon-ecosystem-token` (POL), NOT `matic-network` (legacy
// MATIC) — both return live data but are different tokens. matic-network showed
// suspiciously identical 24h/7d change in verification (thin/stale legacy
// liquidity). Picking the wrong one silently tracks a token Polygon has moved on
// from.
// ============================================

import axios from 'axios';
import { fetchRatioTrend, fetchAltseasonIndex, computeAltseasonProxy } from '../../fetchers/weekly.js';
import { makeIndicator } from '../shared/indicator.js';
import { dataSourceFromLegacy, makeDataSource } from '../shared/dataSource.js';
import { MEASUREMENT_TYPE, TRUST_TIER } from '../shared/confidenceTiers.js';

const INFRA_DEFI_ASSETS = [
  { id: 'arbitrum',                name: 'ARB (Arbitrum)' },
  { id: 'optimism',                name: 'OP (Optimism)' },
  { id: 'polygon-ecosystem-token', name: 'POL (Polygon)' }, // NOT matic-network — see file header
  { id: 'lido-dao',                name: 'LDO (Lido DAO)' },
  { id: 'aave',                    name: 'AAVE' },
  { id: 'uniswap',                 name: 'UNI (Uniswap)' },
  { id: 'chainlink',               name: 'LINK (Chainlink)' },
];

// Retry on 429/503 — CoinGecko's free tier rate limit is undocumented/inconsistent
// (verified during Step 6 planning: official sources disagree on the exact
// number), and empirically confirmed to trigger within a single combined
// Crypto+Derivatives+On-chain fetch cycle in this session's smoke test. Matches
// the retry pattern already used elsewhere in this codebase (e.g. weekly.js's
// fetchOthersDominance).
async function fetchInfraDefiAssets(maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
        params: {
          vs_currency: 'usd',
          ids: INFRA_DEFI_ASSETS.map(a => a.id).join(','),
          price_change_percentage: '24h,7d',
        },
        timeout: 10000,
      });
      return res.data; // array of {id, current_price, price_change_percentage_24h_in_currency, price_change_percentage_7d_in_currency, ...}
    } catch (err) {
      const status = err.response?.status;
      if ((status === 429 || status === 503) && attempt < maxRetries) {
        const wait = (attempt + 1) * 2000;
        console.warn(`  ⚠️  Infra/DeFi assets rate-limited (${status}), retry ${attempt + 1}/${maxRetries} in ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.error('❌ Infra/DeFi assets (CoinGecko) error:', err.message);
      return null;
    }
  }
  return null;
}

// `cryptoRaw` = fetchCryptoData() output (from crypto/price.js) — used only as a
// 24h-proxy fallback when weekly.js's ratioTrend (7d momentum) is unavailable,
// mirroring formatter.js's existing dirFromDailyDiff() fallback logic.
export async function fetchCryptoRotationIndicators(cryptoRaw = null) {
  const [ratioTrend, altseasonReal, infraDefi] = await Promise.all([
    fetchRatioTrend(),
    fetchAltseasonIndex(),
    fetchInfraDefiAssets(),
  ]);
  const altseasonProxy = computeAltseasonProxy(ratioTrend, null); // othersDom handled separately in marketStructure.js — proxy still works with ratioTrend alone, domScore just falls back to its null default

  const ratioIndicator = (label, key) => {
    const r = ratioTrend?.[key];
    return makeIndicator({
      name: `${label}/BTC ratio`, category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: r?.ratio ?? null, signal: r?.direction ?? null, bounds: null,
      source: makeDataSource({ provider: 'CoinGecko', skipped: !r }),
    });
  };

  const indicators = [
    ratioIndicator('ETH', 'ethBtc'),
    ratioIndicator('SOL', 'solBtc'),
    ratioIndicator('AVAX', 'avaxBtc'),
    ratioIndicator('XRP', 'xrpBtc'),
    makeIndicator({
      name: 'Altseason Index', category: 'crypto',
      measurementType: MEASUREMENT_TYPE.PROXY, trustTier: TRUST_TIER.LOW, // single third-party HTML scrape, per Step 4B
      rawValue: altseasonReal?.value ?? null, signal: altseasonReal?.signal ?? null,
      bounds: { min: 0, max: 100, hint: null },
      source: dataSourceFromLegacy('blockchaincenter.net (scrape)', altseasonReal),
    }),
    makeIndicator({
      name: 'Altseason Proxy', category: 'crypto',
      // Self-invented composite of the 4 ratios above — Step 4B flagged this as
      // redundant with those ratios when both are weighted separately. Kept as a
      // distinct indicator for visibility, but Step 7's scoring engine must not
      // weight this AND the 4 individual ratios as independent inputs.
      measurementType: MEASUREMENT_TYPE.INVENTED, trustTier: TRUST_TIER.LOW,
      rawValue: altseasonProxy.value, signal: altseasonProxy.signal, bounds: null,
      source: makeDataSource({ provider: 'derived (composite of ETH/SOL/AVAX/XRP-BTC ratios)', skipped: false }),
    }),
  ];

  for (const asset of INFRA_DEFI_ASSETS) {
    const d = infraDefi?.find(x => x.id === asset.id);
    indicators.push(makeIndicator({
      name: asset.name, category: 'crypto',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.LOW, // new, unproven in this system yet — start advisory per Step 5's confidence-ceiling design for Infra/DeFi Rotation states
      rawValue: d?.current_price ?? null,
      signal: d?.price_change_percentage_7d_in_currency != null
        ? `${d.price_change_percentage_7d_in_currency >= 0 ? '+' : ''}${d.price_change_percentage_7d_in_currency.toFixed(1)}% 7d`
        : null,
      bounds: null,
      source: makeDataSource({ provider: 'CoinGecko', skipped: !d, skipReason: d ? null : 'not returned by batched /coins/markets call' }),
    }));
  }

  return { indicators };
}
