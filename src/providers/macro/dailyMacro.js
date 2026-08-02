// ============================================
// MACRO PROVIDER — daily-cadence macro sub-source (DXY, Gold)
//
// These are fetched inside src/fetchers/daily.js alongside crypto-native fields,
// but conceptually they're macro/commodity signals, not crypto market data — kept
// in the Macro provider to match Step 4's category boundaries, not the old file's
// fetch-cadence grouping.
//
// DXY has an incident history worth remembering here: wrong source went undetected
// for months in this project (documented in CLAUDE.md — $84 vs real ~$97). Keep the
// bounds check active on this indicator specifically.
// ============================================

import { fetchDXY, fetchGold } from '../../fetchers/daily.js';
import { makeIndicator } from '../shared/indicator.js';
import { dataSourceFromLegacy } from '../shared/dataSource.js';
import { MEASUREMENT_TYPE, TRUST_TIER } from '../shared/confidenceTiers.js';

export async function fetchDailyMacroIndicators(config = {}) {
  const [dxy, gold] = await Promise.all([
    fetchDXY({ twelveDataKey: config.twelveDataKey, alphaVantageApiKey: config.alphaVantageApiKey }),
    fetchGold(config.twelveDataKey),
  ]);

  const indicators = [
    makeIndicator({
      name: 'DXY', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: dxy?.value ?? null, signal: null,
      bounds: { min: 70, max: 120, hint: 'cek field (level vs %change) — sudah pernah salah source berbulan-bulan di project ini' },
      source: dataSourceFromLegacy('Yahoo/AlphaVantage', dxy),
    }),
    makeIndicator({
      name: 'Gold (XAU)', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: gold?.price ?? null, signal: null,
      bounds: { min: 1500, max: 8000, hint: 'cek source' },
      source: dataSourceFromLegacy('Yahoo/Twelve Data', gold),
    }),
  ];

  return { indicators };
}
