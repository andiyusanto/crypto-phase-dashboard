-- ============================================
-- ACCIS data layer — Postgres schema (Step 6 Phase 3)
-- Target: Supabase (Postgres 15+), Singapore region (ap-southeast-1) per the
-- infra decision — minimizes latency from the GCP asia-southeast1-a fetcher.
--
-- Design: ONE generic time-series fact table (indicator_observations) instead
-- of ~10 narrow per-category SQLite tables (fed_indicators, weekly_data,
-- monthly_data, oil_prices, daily_snapshot, funding_rate_history, pmi_data).
-- Columns match the Indicator/DataSource shape already implemented in
-- src/providers/shared/{indicator,dataSource}.js (Step 6 Phase 1-2) — any
-- indicator any provider emits has somewhere to be stored by construction,
-- closing Step 4B's finding that almost the entire on-chain/derivatives layer
-- had zero stored history. Adding a new indicator later needs no migration,
-- just a new `name` value.
--
-- Fixes N5 (JSON blobs in TEXT columns, not queryable): typed columns for the
-- stable Indicator shape; JSONB reserved for genuinely variable `extra` data
-- only (e.g. L2 TVL's per-chain breakdown, a war headline's full text).
-- ============================================

CREATE TABLE IF NOT EXISTS indicator_observations (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('macro', 'crypto', 'derivatives', 'onchain', 'geopolitical')),
  measurement_type  TEXT NOT NULL CHECK (measurement_type IN ('direct', 'proxy', 'invented')),
  trust_tier        TEXT NOT NULL CHECK (trust_tier IN ('high', 'low')),

  raw_value         NUMERIC,
  normalized_value  NUMERIC,
  signal            TEXT,

  bounds_min        NUMERIC,
  bounds_max        NUMERIC,
  bounds_violation  BOOLEAN NOT NULL DEFAULT FALSE,

  weight            NUMERIC,  -- reserved for Step 7's Scoring Engine, unused until then

  source_provider       TEXT NOT NULL,
  source_fetched_at     TIMESTAMPTZ NOT NULL,
  source_observed_at    TIMESTAMPTZ,
  source_is_from_cache  BOOLEAN NOT NULL DEFAULT FALSE,
  source_cached_at      TIMESTAMPTZ,
  source_is_stale       BOOLEAN NOT NULL DEFAULT FALSE,
  source_skipped        BOOLEAN NOT NULL DEFAULT FALSE,
  source_skip_reason    TEXT,

  extra             JSONB,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary access patterns: "latest value for indicator X" and "history for X
-- over the last N days" — both need (name, computed_at DESC).
CREATE INDEX IF NOT EXISTS idx_indicator_obs_name_time     ON indicator_observations (name, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_indicator_obs_category_time ON indicator_observations (category, computed_at DESC);
-- Fast lookup of currently-violating indicators without scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_indicator_obs_violations    ON indicator_observations (computed_at DESC) WHERE bounds_violation;

-- ============================================
-- MarketState history — did not exist anywhere in the SQLite schema (found
-- missing during Step 4's domain model design). Step 5's state machine needs
-- this to eventually compute real "historical duration per state" instead of
-- the unvalidated heuristic estimates it started with, since it had nothing
-- to backtest against.
-- ============================================

CREATE TABLE IF NOT EXISTS market_state_history (
  id                        BIGSERIAL PRIMARY KEY,
  state                     TEXT NOT NULL,     -- Step 5's 10-state taxonomy (Liquidity Contraction, ... , Distribution)
  legacy_phase              SMALLINT,          -- old 0-4 phase, per Step 5's explicit mapping table — kept for backward comparison, not dropped
  confidence_level          TEXT NOT NULL CHECK (confidence_level IN ('tinggi', 'sedang', 'rendah')),
  confidence_reasons        JSONB,
  liquidity_trifecta_score  TEXT,
  liquidity_status          TEXT,
  macro_stress_label        TEXT,
  active_divergences        JSONB,
  is_manual_review          BOOLEAN NOT NULL DEFAULT FALSE,  -- Step 5's human-in-the-loop flag: set when a Critical divergence or geopolitical severity-5 override was involved in this transition
  computed_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_state_time ON market_state_history (computed_at DESC);
