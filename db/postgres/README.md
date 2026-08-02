# Postgres schema (Step 6 Phase 3)

Target: Supabase, Singapore region (`ap-southeast-1`) — per the infra decision, to
minimize latency from the GCP `asia-southeast1-a` fetcher.

## Cara apply

1. Buat project Supabase baru, pilih region **Singapore**.
2. Buka SQL Editor di dashboard Supabase, paste isi `001_initial_schema.sql`, run.
   (Atau via CLI: `psql "$DATABASE_URL" -f db/postgres/001_initial_schema.sql`)
3. Copy connection string (Settings → Database → Connection string, mode "Session"
   atau "Transaction" — bukan "Direct connection" kalau lewat pooler) ke `.env` sebagai
   `DATABASE_URL`.
4. `npm install` — `pg` baru ditambahkan ke `package.json`, belum ada di lockfile.

## Status verifikasi

Schema ini **belum pernah dites terhadap Supabase sungguhan** — sandbox development
tidak punya akses Docker (permission denied) maupun Supabase credential. Sebagai
gantinya, sudah diverifikasi terhadap `pg-mem` (in-memory Postgres-compatible engine):
schema apply bersih, query shape yang persis sama dengan
`src/providers/shared/pgStore.js` berhasil insert/query/round-trip data nyata
(termasuk kolom JSONB `extra`), dan CHECK constraint terbukti menolak data invalid.

`pg-mem` bukan pengganti sempurna Supabase — tidak menguji Row Level Security,
connection pooling sungguhan, atau kompatibilitas fitur Postgres 100%. **Wajib
jalankan `node scripts/smoke-test-phase1.js` gaya (belum dibuat versi Postgres-nya)
atau minimal satu insert manual terhadap Supabase asli sebelum dipakai produksi** —
konsisten dengan aturan Post-Fix Verification project ini.

## Desain

Satu tabel generik `indicator_observations` menggantung ~10 tabel SQLite yang
sempit (`fed_indicators`, `weekly_data`, `monthly_data`, `oil_prices`,
`daily_snapshot`, `funding_rate_history`, `pmi_data`) — kolomnya cocok persis dengan
shape `Indicator`/`DataSource` yang sudah diimplementasi di
`src/providers/shared/{indicator,dataSource}.js` (Step 6 Fase 1-2). Menambah
indikator baru nanti tidak butuh migrasi skema, cukup `name` baru.

`market_state_history` belum ada padanannya sama sekali di SQLite — ditemukan hilang
saat desain domain model Step 4, dibutuhkan Step 5's state machine untuk menghitung
durasi historis per state dari data sungguhan (bukan heuristik tak tervalidasi).

Belum di-wire ke pipeline manapun — additive, sesuai aturan Step 6 sepanjang fase ini.
