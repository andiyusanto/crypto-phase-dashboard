// ============================================
// DATABASE MANAGER (SQLite)
// ============================================

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Pastikan direktori data ada
const dataDir = './data';
if (!existsSync(dataDir)) {
  mkdirSync(dataDir);
}

const db = new Database(join(dataDir, 'dashboard.db'));

// Inisialisasi tabel
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

// Migrate existing tables that lack released_month
try {
  db.exec('ALTER TABLE pmi_data ADD COLUMN released_month TEXT');
} catch (_) { /* column already exists */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS fed_liquidity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export const savePMI = (data) => {
  if (!data || (!data.manufacturing && !data.services)) return;

  const releasedMonth = data.releasedMonth || null;

  // Dedup by released_month (primary) — exact same report month already stored
  if (releasedMonth) {
    const existing = db.prepare('SELECT id FROM pmi_data WHERE released_month = ? LIMIT 1').get(releasedMonth);
    if (existing) {
      console.log(`  ℹ️  PMI ${releasedMonth} already stored — skipping SQLite insert`);
      return;
    }
  } else {
    // Fallback: compare values when month is unknown
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
    INSERT INTO pmi_data (released_month, mfg_value, svc_value, mfg_url, svc_url, source, fetched_at)
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
    manufacturing: row.mfg_value ? {
      value: row.mfg_value,
      url: row.mfg_url,
      label: 'Manufacturing PMI'
    } : null,
    services: row.svc_value ? {
      value: row.svc_value,
      url: row.svc_url,
      label: 'Services PMI'
    } : null,
    releasedMonth: row.released_month || null,
    fetchedAt: row.fetched_at,
    source: `${row.source} (Database Fallback)`
  };
};

export const saveFedData = (data) => {
  if (!data || data.skipped) return;

  const latest = getLatestFedData();
  if (latest) {
    const sameWalcl    = latest.walcl?.date    === data.walcl?.date;
    const sameRrp      = latest.rrp?.date      === data.rrp?.date;
    const sameReserves = latest.reserves?.date === data.reserves?.date;
    if (sameWalcl && sameRrp && sameReserves) {
      console.log('  ℹ️  Fed data unchanged (same dates) — skipping SQLite insert');
      return;
    }
  }

  db.prepare('INSERT INTO fed_liquidity (data, fetched_at) VALUES (?, ?)')
    .run(JSON.stringify(data), new Date().toISOString());
  console.log('  ✓ Fed data saved to SQLite');
};

export const getLatestFedData = () => {
  const row = db.prepare('SELECT * FROM fed_liquidity ORDER BY fetched_at DESC LIMIT 1').get();
  if (!row) return null;
  const parsed = JSON.parse(row.data);
  return { ...parsed, _fromCache: true, _cachedAt: row.fetched_at };
};

export default db;
