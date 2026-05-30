// ============================================
// SANITY VALIDATOR
// Auto-flag fetcher output yang di luar plausible range — kemungkinan scale/unit bug.
// Source bounds: CLAUDE.md "Sanity Bounds for Core Indicators".
// Sync table di sini setiap kali CLAUDE.md diupdate.
// ============================================

// [name, getter (data) => value, min, max, hint]
const BOUNDS = [
  ['DXY',                   d => d.daily?.dxy?.value,                            70,    120,    'cek field (level vs %change)'],
  ['BTC price',             d => d.daily?.crypto?.btc?.price,                    10000, 300000, 'cek source/unit'],
  ['BTC vol 24h ($B)',      d => d.daily?.crypto?.btc?.volume24hBillion,         10,    80,     'global aggregate, bukan single-exchange'],
  ['BTC.D (%)',             d => d.daily?.crypto?.btcDominance,                  35,    75,     'cek skala (0-1 vs 0-100)'],
  ['Gold (XAU)',            d => d.daily?.gold?.price,                           1500,  8000,   'cek source'],
  ['Oil Brent',             d => d.daily?.oil?.price,                            30,    200,    'cek source'],
  ['F&G Index',             d => d.daily?.fearGreed?.value,                      0,     100,    'out-of-bound = bug'],
  ['Funding BTC 8h (%)',    d => d.daily?.fundingBtc?.value,                     -1,    1,      'raw decimal vs %'],
  ['Stablecoin total ($B)', d => d.daily?.crypto?.stablecoinSupply?.total,       50,    500,    'cek source'],
  ['ISM PMI (Mfg)',         d => d.monthly?.ismPmi?.manufacturing,               35,    65,     '> 100 = wrong series'],
  ['ISM PMI (Svc)',         d => d.monthly?.ismPmi?.services,                    35,    65,     '> 100 = wrong series'],
  ['US 10Y Yield (%)',      d => d.weekly?.yield10y?.value,                      0.5,   7,      'cek unit (raw vs %)'],
  ['CPI YoY (%)',           d => d.monthly?.cpi?.yoy,                            -2,    15,     'cek skala'],
  ['Fed Rate (%)',          d => d.monthly?.fedRate?.value,                      0,     8,      'cek unit'],
  ['TVL DeFi ($B)',         d => d.weekly?.tvl?.tvl,                             30,    300,    'cek unit'],
  ['Fed Reserves WRESBAL ($T)', d => d.fed?.reserves?.totalTrillions,            2.5,   5,      'pastikan series_id WRESBAL (bukan WLRRAL/required only)'],
  ['Fed Balance ($T)',      d => d.fed?.walcl?.totalTrillions,                   6,     9,      'unit'],
  ['Perp Sentiment Proxy',  d => d.daily?.optionsSkew?.skewProxy,                -30,   30,     'jika |value| > 30 cek funding rate raw — kemungkinan exchange outlier atau funding-rate unit mismatch. Value -10 hingga -30 normal saat Phase 3 late (leveraged longs); +10 hingga +30 saat Phase 4 capitulation'],
  ['BTC Hash Rate (EH/s)',  d => d.daily?.hashRate?.latestEH,                    400,   1200,   'cek unit (TH/s vs EH/s) atau stale data'],
  ['BTC TX Vol (BTC/day)',  d => d.daily?.txVolume?.avg7dBtc,                    50000, 500000, 'cek denominator/source'],
  ['Coin Velocity (BTC/d)', d => d.daily?.outputVolume?.avg7dBtc,                200000, 2000000, 'cek unit'],
  ['EEM ETF',               d => d.weekly?.msciEm?.value,                        25,    80,     'this project uses EEM ETF, not MSCI EM index'],
];

/**
 * @param {{ daily, weekly, monthly, fed }} data
 * @returns {{ name, value, min, max, hint }[]} array of out-of-bound violations (empty if all OK)
 */
export function validateData(data) {
  const violations = [];
  for (const [name, getter, min, max, hint] of BOUNDS) {
    let value;
    try { value = getter(data); } catch { continue; }
    if (value == null || Number.isNaN(value)) continue;
    if (typeof value !== 'number') continue;
    if (value < min || value > max) {
      violations.push({ name, value, min, max, hint });
    }
  }
  return violations;
}

/**
 * Log violations to console with context. Returns formatted summary string for prompt injection.
 */
export function logAndSummarize(violations) {
  if (!violations.length) return null;
  console.warn(`\n⚠️  SANITY CHECK: ${violations.length} indicator out of plausible range:`);
  for (const v of violations) {
    console.warn(`  ${v.name}: ${v.value} (expected ${v.min}–${v.max}) — ${v.hint}`);
  }
  const lines = violations.map(v => `${v.name}=${v.value} (range ${v.min}–${v.max}: ${v.hint})`);
  return `⚠️ DATA QUALITY ALERT: ${violations.length} indikator di luar plausible range — kemungkinan scale/unit bug, JANGAN trust angka berikut tanpa cross-check: ${lines.join('; ')}`;
}
