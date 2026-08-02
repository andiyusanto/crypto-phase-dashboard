// ============================================
// MACRO PROVIDER — Fed Liquidity sub-source
//
// Wraps src/fetchers/fedliquidity.js (unmodified — its HTTP/parsing logic already
// works, this file only re-shapes its output) into normalized Indicator[] per
// Step 4's domain model. This is also Step 4's `LiquiditySnapshot` in practice —
// fedliquidity.js's computeFedAggregates() was already flagged in Step 4 as the
// one piece of the current codebase that looks like a proper domain aggregate:
// pure function, single source of truth, never duplicated elsewhere.
// ============================================

import { fetchAllFedLiquidity } from '../../fetchers/fedliquidity.js';
import { makeIndicator } from '../shared/indicator.js';
import { dataSourceFromLegacy } from '../shared/dataSource.js';
import { MEASUREMENT_TYPE, TRUST_TIER } from '../shared/confidenceTiers.js';

export async function fetchFedLiquidityIndicators(fredApiKey) {
  // NOTE: unlike a previous version of this file, a fully-skipped fetch (no FRED
  // key) no longer short-circuits to an empty `indicators: []`. Every other Macro
  // sub-module (monthly.js, weeklyMacro.js, dailyMacro.js) already returns one
  // indicator object per field, individually marked skipped:true — this file was
  // the odd one out, silently dropping all 7 Liquidity indicators (the
  // highest-weighted category in Step 7's scoring) instead of reporting them as
  // skipped like everything else. `fed` may now be `{skipped:true, reason}` or
  // `null`; every field access below resolves to `undefined` in that case, and
  // dataSourceFromLegacy() already handles that by marking the DataSource skipped.
  const fed = (await fetchAllFedLiquidity(fredApiKey)) ?? {};

  const src = (field) => dataSourceFromLegacy('FRED', field);

  const indicators = [
    makeIndicator({
      name: 'Fed Balance Sheet (WALCL)', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: fed.walcl?.totalTrillions ?? null, signal: fed.walcl?.signal ?? null,
      bounds: { min: 6, max: 9, hint: 'flag salah unit' },
      source: src(fed.walcl),
    }),
    makeIndicator({
      name: 'Reverse Repo (RRP)', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: fed.rrp?.balanceBillions ?? null, signal: fed.rrp?.signal ?? null,
      bounds: null, // no established sanity band in CLAUDE.md for RRP specifically
      source: src(fed.rrp),
    }),
    makeIndicator({
      name: 'Reserve Balances (WRESBAL)', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: fed.reserves?.totalTrillions ?? null, signal: fed.reserves?.signal ?? null,
      bounds: { min: 2.5, max: 5, hint: 'pastikan series_id WRESBAL, bukan WLRRAL' },
      source: src(fed.reserves),
    }),
    makeIndicator({
      name: 'Treasury General Account (TGA)', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: fed.tga?.balanceBillions ?? null, signal: fed.tga?.signal ?? null,
      bounds: null,
      source: src(fed.tga),
    }),
    makeIndicator({
      name: 'HY Credit Spread', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: fed.hySpread?.spreadPct ?? null, signal: fed.hySpread?.signal ?? null,
      bounds: null,
      source: src(fed.hySpread),
    }),
    makeIndicator({
      name: 'Yield Curve (10Y-2Y)', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: fed.yieldCurve?.spread ?? null, signal: fed.yieldCurve?.signal ?? null,
      bounds: null,
      source: src(fed.yieldCurve),
    }),
    makeIndicator({
      // Sourced via an unofficial Yahoo Finance endpoint inside fedliquidity.js —
      // Step 4B flagged this as moderately fragile despite VIX itself being a
      // well-established index.
      name: 'VIX', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: fed.vix?.value ?? null, signal: fed.vix?.signal ?? null,
      bounds: null,
      source: src(fed.vix),
    }),
  ];

  return {
    indicators,
    trifectaScore: fed.trifectaScore ?? null,
    overallStatus: fed.overallStatus ?? 'DATA_UNAVAILABLE',
    macroStressScore: fed.macroStressScore ?? null,
    macroStressLabel: fed.macroStressLabel ?? 'NO_DATA',
  };
}
