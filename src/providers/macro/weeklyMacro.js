// ============================================
// MACRO PROVIDER — Weekly-cadence macro sub-source (US10Y, NFCI, Oil weekly, EEM)
//
// Wraps only the macro-relevant subset of src/fetchers/weekly.js. The rest of that
// file (TVL, altseason, ratio trends, exchange netflow) belongs to the Crypto /
// On-chain providers — built in Phase 2 of this refactor, not here.
// ============================================

import { fetchUS10YYield, fetchNFCI, fetchBrentOilWeekly, fetchMSCIEM } from '../../fetchers/weekly.js';
import { makeIndicator } from '../shared/indicator.js';
import { dataSourceFromLegacy } from '../shared/dataSource.js';
import { MEASUREMENT_TYPE, TRUST_TIER } from '../shared/confidenceTiers.js';

export async function fetchWeeklyMacroIndicators(config = {}) {
  const [yield10y, nfci, oil, msciEm] = await Promise.all([
    fetchUS10YYield(config.fredApiKey),
    fetchNFCI(config.fredApiKey),
    fetchBrentOilWeekly(config.oilPriceApiKey),
    fetchMSCIEM(config.twelveDataKey),
  ]);

  const indicators = [
    makeIndicator({
      name: 'US 10Y Yield', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: yield10y?.value ?? null, signal: null,
      bounds: { min: 0.5, max: 7, hint: 'cek unit (raw vs %)' },
      source: dataSourceFromLegacy('FRED', yield10y),
    }),
    makeIndicator({
      name: 'NFCI (Chicago Fed)', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: nfci?.value ?? null,
      signal: nfci?.condition === 'tight' ? '🔴' : nfci?.condition === 'loose' ? '✅' : null,
      bounds: null,
      source: dataSourceFromLegacy('FRED', nfci),
    }),
    makeIndicator({
      name: 'Oil Brent (weekly)', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: oil?.price ?? null, signal: null,
      bounds: { min: 30, max: 200, hint: 'cek source' },
      source: dataSourceFromLegacy('OilPriceAPI', oil),
    }),
    makeIndicator({
      // "Proxy" in name only (EEM ETF price stands in for the MSCI EM index, which
      // has no free API) — the data itself is direct/reliable, per Step 4B.
      name: 'EEM ETF (MSCI EM proxy)', category: 'macro',
      measurementType: MEASUREMENT_TYPE.PROXY, trustTier: TRUST_TIER.HIGH,
      rawValue: msciEm?.value ?? null, signal: null,
      bounds: { min: 25, max: 80, hint: 'this project uses EEM ETF, not the MSCI EM index itself' },
      source: dataSourceFromLegacy('Twelve Data', msciEm),
    }),
  ];

  return { indicators };
}
