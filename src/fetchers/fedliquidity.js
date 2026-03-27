// ============================================
// FED LIQUIDITY LAYER FETCHER
// Update setiap Kamis (data FRED dirilis ~Kamis sore)
// WALCL + RRP + WLRRAL = "Fed Trifecta"
// ============================================

import axios from 'axios';

// ── Helper FRED ───────────────────────────────────────────────────────────────
async function fredSeries(seriesId, apiKey, limit = 3) {
  const res = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
    params: {
      series_id: seriesId,
      api_key: apiKey,
      file_type: 'json',
      sort_order: 'desc',
      limit,
    },
    timeout: 10000,
  });

  if (!res.data?.observations) {
    throw new Error(`FRED ${seriesId}: response tidak valid`);
  }

  return res.data.observations.filter(o => o.value !== '.' && o.value !== null);
}

// ── 1. FED BALANCE SHEET (WALCL) ──────────────────────────────────────────────
// Unit: Millions of Dollars → konversi ke Triliun
// FRED: https://fred.stlouisfed.org/series/WALCL
export async function fetchFedBalanceSheet(fredApiKey) {
  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }

  try {
    // Ambil juga units info dari series endpoint
    const [obsRes, infoRes] = await Promise.all([
      axios.get('https://api.stlouisfed.org/fred/series/observations', {
        params: { series_id: 'WALCL', api_key: fredApiKey, file_type: 'json',
                  sort_order: 'desc', limit: 3 },
        timeout: 10000,
      }),
      axios.get('https://api.stlouisfed.org/fred/series', {
        params: { series_id: 'WALCL', api_key: fredApiKey, file_type: 'json' },
        timeout: 10000,
      }),
    ]);

    const obs = obsRes.data.observations.filter(o => o.value !== '.' && o.value !== null);
    if (obs.length < 2) throw new Error('Data WALCL kurang');

    const rawLatest   = parseFloat(obs[0].value);
    const rawPrevWeek = parseFloat(obs[1].value);

    // Deteksi unit dari FRED series info
    const units = infoRes.data?.seriess?.[0]?.units || '';
    console.log(`  ℹ️  WALCL units: "${units}" | raw latest: ${rawLatest}`);

    // Auto-detect: jika nilai > 1,000,000 kemungkinan Millions; jika < 100,000 mungkin Billions
    let toTrillions, toBillions;
    if (units.toLowerCase().includes('million') || rawLatest > 1_000_000) {
      // Millions of dollars
      toTrillions = rawLatest / 1_000_000;
      toBillions  = (rawLatest - rawPrevWeek) / 1000;
    } else if (units.toLowerCase().includes('billion') || rawLatest > 1_000) {
      // Billions of dollars
      toTrillions = rawLatest / 1000;
      toBillions  = rawLatest - rawPrevWeek;
    } else {
      // Trillions langsung (jarang)
      toTrillions = rawLatest;
      toBillions  = (rawLatest - rawPrevWeek) * 1000;
    }

    const changeBillions  = parseFloat(toBillions.toFixed(1));
    const latestTrillions = parseFloat(toTrillions.toFixed(3));

    return {
      totalTrillions:    latestTrillions,
      weekChangeBillions: changeBillions,
      date:      obs[0].date,
      units,
      direction: changeBillions > 5 ? 'naik' : changeBillions < -5 ? 'turun' : 'flat',
      signal:    changeBillions > 10 ? '✅' : changeBillions < -10 ? '🔴' : '⚠️',
    };
  } catch (err) {
    console.error('❌ FRED WALCL error:', err.message);
    return null;
  }
}

// ── 2. REVERSE REPO (RRPONTSYD) ───────────────────────────────────────────────
// Overnight Reverse Repurchase Agreements — daily
// RRP drain = likuiditas masuk ke market (bullish)
// RRP fill  = likuiditas keluar dari market (bearish)
// Unit: Billions of Dollars
export async function fetchRRP(fredApiKey) {
  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }

  try {
    const obs = await fredSeries('RRPONTSYD', fredApiKey, 8); // 8 hari untuk weekly comparison
    if (obs.length < 2) throw new Error('Data RRP kurang');

    const latest   = parseFloat(obs[0].value);
    const prevDay  = parseFloat(obs[1].value);
    const prevWeek = parseFloat(obs[Math.min(5, obs.length - 1)].value);

    const dayChange  = latest - prevDay;
    const weekChange = latest - prevWeek;

    // Tentukan trend: apakah RRP sedang drain (turun) atau fill (naik)?
    const trend = weekChange < -20 ? 'drain' : weekChange > 20 ? 'fill' : 'flat';

    return {
      balanceBillions: parseFloat(latest.toFixed(1)),
      dayChangeBillions: parseFloat(dayChange.toFixed(1)),
      weekChangeBillions: parseFloat(weekChange.toFixed(1)),
      date: obs[0].date,
      trend,
      // RRP drain = bullish (likuiditas release ke market)
      signal: trend === 'drain' ? '✅' : trend === 'fill' ? '🔴' : '⚠️',
    };
  } catch (err) {
    console.error('❌ FRED RRP error:', err.message);
    return null;
  }
}

// ── 3. RESERVE BALANCES (WLRRAL) ──────────────────────────────────────────────
// Reserve Balances with Federal Reserve Banks — weekly
export async function fetchReserveBalances(fredApiKey) {
  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }

  try {
    const [obsRes, infoRes] = await Promise.all([
      axios.get('https://api.stlouisfed.org/fred/series/observations', {
        params: { series_id: 'WLRRAL', api_key: fredApiKey, file_type: 'json',
                  sort_order: 'desc', limit: 3 },
        timeout: 10000,
      }),
      axios.get('https://api.stlouisfed.org/fred/series', {
        params: { series_id: 'WLRRAL', api_key: fredApiKey, file_type: 'json' },
        timeout: 10000,
      }),
    ]);

    const obs = obsRes.data.observations.filter(o => o.value !== '.' && o.value !== null);
    if (obs.length < 2) throw new Error('Data WLRRAL kurang');

    const rawLatest   = parseFloat(obs[0].value);
    const rawPrevWeek = parseFloat(obs[1].value);
    const units = infoRes.data?.seriess?.[0]?.units || '';
    console.log(`  ℹ️  WLRRAL units: "${units}" | raw latest: ${rawLatest}`);

    let toTrillions, toBillions;
    if (units.toLowerCase().includes('million') || rawLatest > 1_000_000) {
      toTrillions = rawLatest / 1_000_000;
      toBillions  = (rawLatest - rawPrevWeek) / 1000;
    } else if (units.toLowerCase().includes('billion') || rawLatest > 1_000) {
      toTrillions = rawLatest / 1000;
      toBillions  = rawLatest - rawPrevWeek;
    } else {
      toTrillions = rawLatest;
      toBillions  = (rawLatest - rawPrevWeek) * 1000;
    }

    const changeBillions  = parseFloat(toBillions.toFixed(1));
    const latestTrillions = parseFloat(toTrillions.toFixed(3));

    return {
      totalTrillions:    latestTrillions,
      weekChangeBillions: changeBillions,
      date:      obs[0].date,
      units,
      direction: changeBillions > 5 ? 'naik' : changeBillions < -5 ? 'turun' : 'flat',
      signal:    changeBillions > 10 ? '✅' : changeBillions < -10 ? '🔴' : '⚠️',
    };
  } catch (err) {
    console.error('❌ FRED WLRRAL error:', err.message);
    return null;
  }
}

// ── AGGREGATE + TRIFECTA SCORE ────────────────────────────────────────────────
export async function fetchAllFedLiquidity(fredApiKey) {
  const isThursday = new Date().getDay() === 4;
  const isFriday   = new Date().getDay() === 5;
  const shouldFetch = isThursday || isFriday;

  if (!shouldFetch) {
    return {
      skipped: true,
      reason: 'Bukan Kamis/Jumat — Fed data update mingguan',
    };
  }

  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }

  console.log('🏦 Fetching Fed Liquidity data (Kamis/Jumat)...');

  const [walcl, rrp, reserves] = await Promise.allSettled([
    fetchFedBalanceSheet(fredApiKey),
    fetchRRP(fredApiKey),
    fetchReserveBalances(fredApiKey),
  ]);

  // Log rejection reasons jika ada
  if (walcl.status === 'rejected')    console.error('  WALCL rejected:', walcl.reason);
  if (rrp.status === 'rejected')      console.error('  RRP rejected:', rrp.reason);
  if (reserves.status === 'rejected') console.error('  WLRRAL rejected:', reserves.reason);

  const w  = walcl.value    ?? null;
  const r  = rrp.value      ?? null;
  const rv = reserves.value ?? null;

  // Log raw values untuk debug
  if (w)  console.log(`  ✓ WALCL  : $${w.totalTrillions}T | Δ${w.weekChangeBillions > 0 ? '+' : ''}${w.weekChangeBillions}B | signal: ${w.signal}`);
  else    console.warn('  ⚠️  WALCL  : null (fetch gagal atau error)');
  if (r)  console.log(`  ✓ RRP    : $${r.balanceBillions}B | trend: ${r.trend} | signal: ${r.signal}`);
  else    console.warn('  ⚠️  RRP    : null');
  if (rv) console.log(`  ✓ WLRRAL : $${rv.totalTrillions}T | Δ${rv.weekChangeBillions > 0 ? '+' : ''}${rv.weekChangeBillions}B | signal: ${rv.signal}`);
  else    console.warn('  ⚠️  WLRRAL : null');

  // Trifecta: hanya hitung dari yang berhasil (tidak null)
  const available = [w, r, rv].filter(x => x !== null && x !== undefined && !x.skipped);
  const signals   = available.map(x => x.signal).filter(Boolean);
  const greenCount = signals.filter(s => s === '✅').length;
  const redCount   = signals.filter(s => s === '🔴').length;
  const total      = signals.length;

  const overallStatus =
    total === 0      ? 'DATA_UNAVAILABLE' :
    greenCount >= 2  ? 'EKSPANSI' :
    redCount   >= 2  ? 'KONTRAKSI' : 'MIXED';

  return {
    walcl:    w,
    rrp:      r,
    reserves: rv,
    trifectaScore: `${greenCount}/${total}`,
    greenCount,
    overallStatus,
  };
}
