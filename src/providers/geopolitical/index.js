// ============================================
// GEOPOLITICAL PROVIDER
//
// Wraps src/fetchers/warheadlines.js. Implements Step 4's `GeopoliticalRisk`
// entity: severity is a keyword-counting heuristic over scraped news headlines —
// self-invented, no established benchmark, Step 4B tagged it LOW confidence.
//
// The manual-override capability that currently lives as a raw hardcoded string in
// index.js's `manualOverrides` (warTimteng/warRusiaUkraine/warTaiwan, edited by hand
// in source before each run) is now an explicit, typed field (`isManualOverride`)
// instead of a silent source-code edit with no trace of whether a given run used
// live data or a human's guess.
// ============================================

import { fetchAllWarHeadlines } from '../../fetchers/warheadlines.js';
import { makeDataSource } from '../shared/dataSource.js';
import { MEASUREMENT_TYPE, TRUST_TIER } from '../shared/confidenceTiers.js';

const REGIONS = {
  timteng:      'Middle East',
  rusiaUkraine: 'Russia-Ukraine',
  taiwan:       'Taiwan',
};

// `overrides` shape: { timteng: {severity, headline} | undefined, ... }
// Omit a key (or leave undefined) to use the live fetch for that region.
export async function fetchGeopoliticalRisks(overrides = {}) {
  const fetched = await fetchAllWarHeadlines();

  return Object.entries(REGIONS).map(([key, regionName]) => {
    const override = overrides[key];
    const isManualOverride = !!override;
    const field = isManualOverride ? override : fetched[key];

    return {
      region: regionName,
      severity: field?.severity ?? null,
      severityLabel: field?.severityLabel ?? '—',
      headline: field?.headline ?? '[no data]',
      measurementType: MEASUREMENT_TYPE.INVENTED,
      trustTier: TRUST_TIER.LOW,
      isManualOverride,
      source: makeDataSource({
        provider: isManualOverride ? 'manual override' : 'Google News RSS',
        skipped: !field || field.severity == null,
        skipReason: (!field || field.severity == null) ? (field?.severityReason ?? 'fetch failed') : null,
      }),
    };
  });
}
