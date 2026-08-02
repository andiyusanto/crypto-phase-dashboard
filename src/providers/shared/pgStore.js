// ============================================
// POSTGRES STORE — Step 6 Phase 3
//
// Client wrapper for Supabase/Postgres, targeting db/postgres/001_initial_schema.sql.
// Mirrors the existing db.js's exported-function style (save*/get*), but this file
// is NOT wired into src/index.js or any provider yet — additive, per the same rule
// followed throughout Step 6. Nothing in the live pipeline writes here until it's
// explicitly connected in a later step.
//
// Requires `pg` (added to package.json) and a DATABASE_URL env var pointing at the
// Supabase Postgres instance (Singapore region, per the infra decision) — GCP
// writes here; nothing else writes to it in this phase, per that same decision.
// ============================================

import pg from 'pg';

const { Pool } = pg;

let pool = null;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL tidak diset — Postgres store tidak bisa dipakai');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}

// Converts one Indicator object (src/providers/shared/indicator.js shape) into an
// indicator_observations row and inserts it.
export async function saveIndicatorObservation(indicator) {
  const db = getPool();
  await db.query(
    `INSERT INTO indicator_observations (
      name, category, measurement_type, trust_tier,
      raw_value, normalized_value, signal,
      bounds_min, bounds_max, bounds_violation, weight,
      source_provider, source_fetched_at, source_observed_at,
      source_is_from_cache, source_cached_at, source_is_stale,
      source_skipped, source_skip_reason,
      extra, computed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [
      indicator.name, indicator.category, indicator.measurementType, indicator.trustTier,
      indicator.rawValue, indicator.normalizedValue, indicator.signal,
      indicator.bounds?.min ?? null, indicator.bounds?.max ?? null, indicator.boundsViolation, indicator.weight,
      indicator.source.provider, indicator.source.fetchedAt, indicator.source.observedAt,
      indicator.source.isFromCache, indicator.source.cachedAt, indicator.source.isStale,
      indicator.source.skipped, indicator.source.skipReason,
      indicator.extra ? JSON.stringify(indicator.extra) : null, indicator.computedAt,
    ]
  );
}

// Batch insert — used after a full provider fetch cycle (dozens of indicators at once).
export async function saveIndicatorObservations(indicators) {
  for (const ind of indicators) {
    await saveIndicatorObservation(ind);
  }
}

export async function getLatestObservation(name) {
  const db = getPool();
  const res = await db.query(
    `SELECT * FROM indicator_observations WHERE name = $1 ORDER BY computed_at DESC LIMIT 1`,
    [name]
  );
  return res.rows[0] ?? null;
}

export async function getObservationHistory(name, days = 30) {
  const db = getPool();
  const res = await db.query(
    `SELECT * FROM indicator_observations
     WHERE name = $1 AND computed_at >= now() - ($2 || ' days')::interval
     ORDER BY computed_at ASC`,
    [name, days]
  );
  return res.rows;
}

// For Step 5's state machine, once it computes real MarketState objects — not
// called by anything yet.
export async function saveMarketState(state) {
  const db = getPool();
  await db.query(
    `INSERT INTO market_state_history (
      state, legacy_phase, confidence_level, confidence_reasons,
      liquidity_trifecta_score, liquidity_status, macro_stress_label,
      active_divergences, is_manual_review, computed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      state.state, state.legacyPhase ?? null, state.confidenceLevel,
      state.confidenceReasons ? JSON.stringify(state.confidenceReasons) : null,
      state.liquidityTrifectaScore ?? null, state.liquidityStatus ?? null, state.macroStressLabel ?? null,
      state.activeDivergences ? JSON.stringify(state.activeDivergences) : null,
      !!state.isManualReview, state.computedAt ?? new Date().toISOString(),
    ]
  );
}
