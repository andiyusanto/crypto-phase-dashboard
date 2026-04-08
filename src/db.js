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
    mfg_value REAL,
    svc_value REAL,
    mfg_url TEXT,
    svc_url REAL,
    source TEXT,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export const savePMI = (data) => {
  if (!data || (!data.manufacturing && !data.services)) return;

  const stmt = db.prepare(`
    INSERT INTO pmi_data (mfg_value, svc_value, mfg_url, svc_url, source, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.manufacturing?.value || null,
    data.services?.value || null,
    data.manufacturing?.url || null,
    data.services?.url || null,
    data.source || 'ISM World',
    data.fetchedAt || new Date().toISOString()
  );
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
    fetchedAt: row.fetched_at,
    source: `${row.source} (Database Fallback)`
  };
};

export default db;
