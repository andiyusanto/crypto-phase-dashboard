// ============================================
// DATABASE MANAGER (SQLite)
// ============================================

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const dataDir = './data';
if (!existsSync(dataDir)) {
  mkdirSync(dataDir);
}

const db = new Database(join(dataDir, 'dashboard.db'));

// ── SCHEMA ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS pmi_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    released_month TEXT,
    mfg_value REAL,
    svc_value REAL,
    mfg_url TEXT,
    svc_url REAL,
    source TEXT,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS fed_liquidity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT,
    data TEXT NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS weekly_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fetch_date TEXT,
    data TEXT NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS monthly_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT,
    data TEXT NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS oil_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    price REAL NOT NULL,
    price_date TEXT NOT NULL UNIQUE,
    source TEXT,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL UNIQUE,
    total2_trillion REAL,
    total3_billion  REAL,
    stablecoin_billion REAL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ── MIGRATIONS (add columns to existing installs) ─────────────────────────────
const migrate = (sql) => { try { db.exec(sql); } catch (_) { /* column/index exists */ } };

migrate('ALTER TABLE pmi_data      ADD COLUMN released_month TEXT');
migrate('ALTER TABLE fed_liquidity ADD COLUMN snapshot_date TEXT');
migrate('ALTER TABLE weekly_data   ADD COLUMN fetch_date TEXT');
migrate('ALTER TABLE monthly_data  ADD COLUMN period TEXT');

// ── UNIQUE INDEXES ────────────────────────────────────────────────────────────
migrate('CREATE UNIQUE INDEX IF NOT EXISTS idx_pmi_released_month   ON pmi_data(released_month)   WHERE released_month IS NOT NULL');
migrate('CREATE UNIQUE INDEX IF NOT EXISTS idx_fed_snapshot_date    ON fed_liquidity(snapshot_date) WHERE snapshot_date IS NOT NULL');
migrate('CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_fetch_date    ON weekly_data(fetch_date)     WHERE fetch_date IS NOT NULL');
migrate('CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_period       ON monthly_data(period)        WHERE period IS NOT NULL');

// ── PMI ───────────────────────────────────────────────────────────────────────

export const savePMI = (data) => {
  if (!data || (!data.manufacturing && !data.services)) return;

  const releasedMonth = data.releasedMonth || null;

  if (!releasedMonth) {
    // No month known — fallback value comparison
    const latest = getLatestPMI();
    if (latest) {
      const sameMfg = String(latest.manufacturing?.value) === String(data.manufacturing?.value);
      const sameSvc = String(latest.services?.value)      === String(data.services?.value);
      if (sameMfg && sameSvc) {
        console.log('  ℹ️  PMI data unchanged (same values) — skipping SQLite insert');
        return;
      }
    }
  }

  db.prepare(`
    INSERT OR REPLACE INTO pmi_data (released_month, mfg_value, svc_value, mfg_url, svc_url, source, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    releasedMonth,
    data.manufacturing?.value || null,
    data.services?.value || null,
    data.manufacturing?.url || null,
    data.services?.url || null,
    data.source || 'ISM World',
    data.fetchedAt || new Date().toISOString()
  );
  console.log(`  ✓ PMI data${releasedMonth ? ` (${releasedMonth})` : ''} saved to SQLite`);
};

export const getLatestPMI = () => {
  const row = db.prepare('SELECT * FROM pmi_data ORDER BY fetched_at DESC LIMIT 1').get();
  if (!row) return null;

  return {
    manufacturing: row.mfg_value ? { value: row.mfg_value, url: row.mfg_url, label: 'Manufacturing PMI' } : null,
    services:      row.svc_value ? { value: row.svc_value, url: row.svc_url, label: 'Services PMI' }      : null,
    releasedMonth: row.released_month || null,
    fetchedAt:     row.fetched_at,
    source:        `${row.source} (Database Fallback)`,
  };
};

// ── FED LIQUIDITY ─────────────────────────────────────────────────────────────

export const saveFedData = (data) => {
  if (!data || data.skipped) return;

  // Use walcl.date as the unique snapshot key; fallback to today
  const snapshotDate = data.walcl?.date ?? new Date().toISOString().slice(0, 10);

  db.prepare('INSERT OR REPLACE INTO fed_liquidity (snapshot_date, data, fetched_at) VALUES (?, ?, ?)')
    .run(snapshotDate, JSON.stringify(data), new Date().toISOString());
  console.log(`  ✓ Fed data saved to SQLite (${snapshotDate})`);
};

export const getLatestFedData = () => {
  const row = db.prepare('SELECT * FROM fed_liquidity ORDER BY fetched_at DESC LIMIT 1').get();
  if (!row) return null;
  const parsed = JSON.parse(row.data);
  return { ...parsed, _fromCache: true, _cachedAt: row.fetched_at };
};

// ── WEEKLY DATA ───────────────────────────────────────────────────────────────

export const saveWeeklyData = (data) => {
  if (!data) return;
  const hasAnyData = data.yield10y || data.nfci || data.altseason || data.exchangeNetflow || data.tvl || data.ratioTrend;
  if (!hasAnyData) return;

  // One row per calendar day — INSERT OR REPLACE refreshes with latest fetch
  const fetchDate = new Date().toISOString().slice(0, 10);

  db.prepare('INSERT OR REPLACE INTO weekly_data (fetch_date, data, fetched_at) VALUES (?, ?, ?)')
    .run(fetchDate, JSON.stringify(data), new Date().toISOString());
  console.log(`  ✓ Weekly data saved to SQLite (${fetchDate})`);
};

export const getLatestWeeklyData = () => {
  const row = db.prepare('SELECT * FROM weekly_data ORDER BY fetched_at DESC LIMIT 1').get();
  if (!row) return null;
  const parsed = JSON.parse(row.data);
  return { ...parsed, _fromCache: true, _cachedAt: row.fetched_at };
};

// ── MONTHLY DATA ──────────────────────────────────────────────────────────────

export const saveMonthlyData = (data) => {
  if (!data) return;
  const hasAnyData = data.cpi || data.fedRate || data.m2;
  if (!hasAnyData) return;

  // One row per calendar month — derived from cpi.date, fallback to current month
  const period = (data.cpi?.date ?? new Date().toISOString()).slice(0, 7); // YYYY-MM

  db.prepare('INSERT OR REPLACE INTO monthly_data (period, data, fetched_at) VALUES (?, ?, ?)')
    .run(period, JSON.stringify(data), new Date().toISOString());
  console.log(`  ✓ Monthly data saved to SQLite (${period})`);
};

export const getLatestMonthlyData = () => {
  const row = db.prepare('SELECT * FROM monthly_data ORDER BY fetched_at DESC LIMIT 1').get();
  if (!row) return null;
  const parsed = JSON.parse(row.data);
  return { ...parsed, _fromCache: true, _cachedAt: row.fetched_at };
};

// ── OIL PRICES ────────────────────────────────────────────────────────────────

export const saveOilPrice = (data) => {
  if (!data || data.skipped || data.price == null) return;

  // Dedup by date — one record per calendar day
  const date = (data.updatedAt ?? new Date().toISOString()).slice(0, 10);
  const existing = db.prepare('SELECT id FROM oil_prices WHERE price_date = ? LIMIT 1').get(date);
  if (existing) {
    console.log(`  ℹ️  Oil price ${date} already stored — skipping SQLite insert`);
    return;
  }

  db.prepare('INSERT INTO oil_prices (price, price_date, source, fetched_at) VALUES (?, ?, ?, ?)')
    .run(data.price, date, data.source ?? 'OilPriceAPI', new Date().toISOString());
  console.log(`  ✓ Oil price $${data.price} (${date}) saved to SQLite`);
};

export const getLatestOilPrice = () => {
  const rows = db.prepare('SELECT * FROM oil_prices ORDER BY price_date DESC LIMIT 2').all();
  if (!rows.length) return null;

  const latest = rows[0];
  let direction = 'flat';
  if (rows.length >= 2) {
    const prev = rows[1];
    const pct = ((latest.price - prev.price) / prev.price) * 100;
    direction = pct > 0.5 ? 'naik' : pct < -0.5 ? 'turun' : 'flat';
  }

  return {
    price: latest.price,
    direction,
    updatedAt: latest.price_date,
    source: `${latest.source} (SQLite cache)`,
    _fromCache: true,
    _cachedAt: latest.fetched_at,
  };
};

// ── DAILY SNAPSHOT (CMC metrics for WoW delta) ───────────────────────────────

export const saveDailySnapshot = (daily) => {
  const cmc   = daily?.cmc;
  const total2 = cmc?.total2 ?? null;
  const total3 = cmc?.total3 ?? null;
  const stable = daily?.crypto?.stablecoinSupply?.total ?? null;
  if (total2 == null && total3 == null && stable == null) return;

  const date = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT OR REPLACE INTO daily_snapshot (snapshot_date, total2_trillion, total3_billion, stablecoin_billion)
    VALUES (?, ?, ?, ?)
  `).run(date, total2, total3, stable);
};

// Returns snapshot from ~7 days ago (closest row between 6–8 days back)
export const getPrevWeekSnapshot = () => {
  const row = db.prepare(`
    SELECT * FROM daily_snapshot
    WHERE snapshot_date <= date('now', '-6 days')
    ORDER BY snapshot_date DESC
    LIMIT 1
  `).get();
  return row ?? null;
};

export default db;
