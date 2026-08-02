// ============================================
// MACRO PROVIDER — Monthly sub-source (CPI, Fed Rate, M2, PMI)
//
// Fixes N-F: Manufacturing PMI now sourced from FRED MANPMI via
// src/fetchers/monthly.js's `fetchISMPMI()` — that function existed but was never
// called anywhere in the codebase (confirmed via grep in Step 3's audit), while the
// live PMI path was pmi.js's Google News RSS regex-scrape for BOTH manufacturing
// and services. FRED has no free Services PMI series (ISM's non-manufacturing
// index isn't published there under a free license), so Services PMI has no
// official alternative and stays on the RSS-scrape path — but is now explicitly
// tagged PROXY/LOW confidence instead of silently sharing Manufacturing's
// (unearned) trust level, per Step 4B's finding.
// ============================================

import { fetchCPI, fetchFedRate, fetchISMPMI, fetchM2 } from '../../fetchers/monthly.js';
import { fetchRealtimePMI } from '../../fetchers/pmi.js';
import { makeIndicator } from '../shared/indicator.js';
import { dataSourceFromLegacy, makeDataSource } from '../shared/dataSource.js';
import { MEASUREMENT_TYPE, TRUST_TIER } from '../shared/confidenceTiers.js';

export async function fetchMonthlyMacroIndicators(fredApiKey) {
  const [cpi, fedRate, m2, ismMfg, pmiRss] = await Promise.all([
    fetchCPI(fredApiKey),
    fetchFedRate(fredApiKey),
    fetchM2(fredApiKey),
    fetchISMPMI(fredApiKey),  // FRED MANPMI — previously dead code, now actually used
    fetchRealtimePMI(),       // RSS scrape — used here only for Services (no free FRED alt)
  ]);

  const indicators = [
    makeIndicator({
      name: 'CPI YoY', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: cpi?.yoy ?? null, signal: null,
      bounds: { min: -2, max: 15, hint: 'cek skala' },
      source: dataSourceFromLegacy('FRED', cpi),
    }),
    makeIndicator({
      name: 'Fed Funds Rate', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: fedRate?.rate ?? null, signal: null,
      bounds: { min: 0, max: 8, hint: 'cek unit' },
      source: dataSourceFromLegacy('FRED', fedRate),
    }),
    makeIndicator({
      // Official raw series inputs, but the 4-country USD aggregation methodology
      // (US+CN+JP+EZ, FX-converted) is this project's own construction, not an
      // externally published composite — Step 4B's nuance, not a pure DIRECT metric.
      name: 'Global M2 YoY', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: m2?.globalYoY ?? m2?.usYoY ?? null,
      // Threshold quoted from formatter.js's THRESHOLD REFERENSI table (<0%
      // kontraktif/bearish, 0-5% netral, >5% ekspansif kuat/bullish).
      signal: (m2?.globalYoY ?? m2?.usYoY) == null ? null
        : (m2.globalYoY ?? m2.usYoY) < 0 ? '🔴' : (m2.globalYoY ?? m2.usYoY) > 5 ? '✅' : '⚠️',
      bounds: null,
      source: dataSourceFromLegacy('FRED', m2),
    }),
    makeIndicator({
      name: 'ISM Manufacturing PMI', category: 'macro',
      measurementType: MEASUREMENT_TYPE.DIRECT, trustTier: TRUST_TIER.HIGH,
      rawValue: ismMfg?.value ?? null, signal: null,
      bounds: { min: 35, max: 65, hint: '> 100 = wrong series' },
      source: dataSourceFromLegacy('FRED', ismMfg),
    }),
    makeIndicator({
      name: 'ISM Services PMI', category: 'macro',
      measurementType: MEASUREMENT_TYPE.PROXY, trustTier: TRUST_TIER.LOW,
      rawValue: pmiRss?.services?.value ?? null, signal: null,
      bounds: { min: 35, max: 65, hint: '> 100 = wrong series; regex-extracted from news headlines, treat as advisory only' },
      source: makeDataSource({
        provider: 'Google News RSS (regex-extracted, no official free alternative)',
        observedAt: pmiRss?.releasedMonth ? `${pmiRss.releasedMonth}-01` : null,
        skipped: !pmiRss?.services,
        skipReason: pmiRss?.services ? null : 'no services PMI value matched in recent headlines',
      }),
    }),
  ];

  return { indicators };
}
