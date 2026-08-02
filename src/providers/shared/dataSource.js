// ============================================
// DATA SOURCE — provenance & freshness wrapper (Step 4 domain entity, implemented)
//
// Absorbs the `_fromCache`/`_cachedAt`/`skipped`/`reason` convention already used
// consistently across every existing fetcher, plus formatter.js's fedTag()/
// srcLabel() staleness-marking logic — promoted here to a first-class, reusable
// type instead of being reimplemented as formatting helpers.
// ============================================

const DEFAULT_STALE_DAYS = 10; // matches formatter.js's existing fedTag() threshold

export function makeDataSource({
  provider,
  fetchedAt = new Date().toISOString(),
  observedAt = null,     // the data's own as-of date, if different from fetchedAt (e.g. FRED observation date)
  isFromCache = false,
  cachedAt = null,
  skipped = false,
  skipReason = null,
  staleDays = DEFAULT_STALE_DAYS,
} = {}) {
  const ageDays = observedAt
    ? Math.floor((Date.now() - new Date(observedAt).getTime()) / 86400000)
    : null;
  const isStale = ageDays != null && ageDays > staleDays;

  return {
    provider,
    fetchedAt,
    observedAt,
    ageDays,
    isFromCache,
    cachedAt,
    isStale,
    skipped,
    skipReason,
  };
}

// Adapts a legacy fetcher field (which already carries `date`/`_fromCache`/
// `_cachedAt`/`skipped`/`reason`) into a normalized DataSource, so provider
// wrappers can reuse existing fetcher output without the fetchers themselves
// needing to change.
export function dataSourceFromLegacy(provider, legacyField, staleDays = DEFAULT_STALE_DAYS) {
  if (!legacyField) {
    return makeDataSource({ provider, skipped: true, skipReason: 'no data returned' });
  }
  return makeDataSource({
    provider,
    observedAt: legacyField.date ?? null,
    isFromCache: !!legacyField._fromCache,
    cachedAt: legacyField._cachedAt ?? null,
    skipped: !!legacyField.skipped,
    skipReason: legacyField.reason ?? null,
    staleDays,
  });
}
