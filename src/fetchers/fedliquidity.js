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

// ── 4. TGA (Treasury General Account) ────────────────────────────────────────
// FRED: WTREGEN — Weekly, Millions USD
// TGA refill = pemerintah tarik likuiditas dari sistem perbankan → bearish macro
// TGA drain  = pemerintah belanja → inject likuiditas ke sistem → bullish
export async function fetchTGA(fredApiKey) {
  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }
  try {
    const obs = await fredSeries('WTREGEN', fredApiKey, 4);
    if (obs.length < 2) throw new Error('Data WTREGEN kurang');

    const latestBillions = parseFloat(obs[0].value) / 1000; // millions → billions
    const prevBillions   = parseFloat(obs[1].value) / 1000;
    const changeBillions = parseFloat((latestBillions - prevBillions).toFixed(1));

    // TGA naik (refill) = drain likuiditas = bearish | TGA turun (drain) = bullish
    const trend  = changeBillions > 30 ? 'refill' : changeBillions < -30 ? 'drain' : 'flat';
    const signal = trend === 'drain' ? '✅' : trend === 'refill' ? '🔴' : '⚠️';

    console.log(`  ✓ TGA    : $${latestBillions.toFixed(0)}B | Δ${changeBillions >= 0 ? '+' : ''}${changeBillions}B | ${trend} ${signal}`);
    return {
      balanceBillions:   parseFloat(latestBillions.toFixed(1)),
      weekChangeBillions: changeBillions,
      date: obs[0].date,
      trend,
      signal,
    };
  } catch (err) {
    console.error('❌ FRED TGA (WTREGEN) error:', err.message);
    return null;
  }
}

// ── 5. HY CREDIT SPREAD (ICE BofA OAS) ───────────────────────────────────────
// FRED: BAMLH0A0HYM2 — Daily, percentage points (Option-Adjusted Spread)
// >5% = credit stress / risk-off = Phase 0 konfirmasi dari tradfi
// <3% = risk appetite tinggi = Phase 2/3 supportive
export async function fetchHYCreditSpread(fredApiKey) {
  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }
  try {
    const obs = await fredSeries('BAMLH0A0HYM2', fredApiKey, 5);
    if (obs.length < 2) throw new Error('Data BAMLH0A0HYM2 kurang');

    const latest = parseFloat(obs[0].value);
    const prev   = parseFloat(obs[1].value);
    const change = parseFloat((latest - prev).toFixed(2));

    const zone   = latest > 5 ? 'stress' : latest > 4 ? 'elevated' : latest < 3 ? 'tight' : 'normal';
    const signal = zone === 'stress' || zone === 'elevated' ? '🔴' : zone === 'tight' ? '✅' : '⚠️';

    console.log(`  ✓ HY OAS : ${latest}% | Δ${change >= 0 ? '+' : ''}${change}% | zona: ${zone} ${signal}`);
    return {
      spreadPct: latest,
      dayChange:  change,
      date:  obs[0].date,
      zone,
      signal,
    };
  } catch (err) {
    console.error('❌ FRED HY Credit Spread error:', err.message);
    return null;
  }
}

// ── 6. YIELD CURVE (DGS10 - DGS2) ─────────────────────────────────────────────
// FRED: DGS2 + DGS10 — Daily, percentage points
// Inverted (spread < 0) = resesi risk = Phase 0 precursor
// Steep   (spread > 1%) = ekspektasi pertumbuhan = Phase 2/3 supportive
export async function fetchYieldCurve(fredApiKey) {
  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }
  try {
    const [obs2Y, obs10Y] = await Promise.all([
      fredSeries('DGS2',  fredApiKey, 3),
      fredSeries('DGS10', fredApiKey, 3),
    ]);
    if (obs2Y.length < 1 || obs10Y.length < 1) throw new Error('Data yield kurang');

    const yield2Y  = parseFloat(obs2Y[0].value);
    const yield10Y = parseFloat(obs10Y[0].value);
    const spread   = parseFloat((yield10Y - yield2Y).toFixed(2));

    const zone   = spread < 0 ? 'inverted' : spread < 0.3 ? 'flat' : spread >= 1 ? 'steep' : 'normal';
    const signal = zone === 'inverted' ? '🔴' : zone === 'steep' ? '✅' : '⚠️';

    console.log(`  ✓ Curve  : 2Y=${yield2Y}% 10Y=${yield10Y}% spread=${spread >= 0 ? '+' : ''}${spread}% | ${zone} ${signal}`);
    return {
      yield2Y,
      yield10Y,
      spread,
      date: obs10Y[0].date,
      zone,
      signal,
    };
  } catch (err) {
    console.error('❌ FRED Yield Curve error:', err.message);
    return null;
  }
}

// ── 7. VIX INDEX ──────────────────────────────────────────────────────────────
// Yahoo Finance v8 chart ^VIX — no auth required
// >30 = tradfi panic / risk-off = Phase 0 signal kuat
// <15 = complacency = Phase 2/3 supportive
export async function fetchVIX() {
  try {
    const res = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX', {
      params: { interval: '1d', range: '5d' },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    });

    const chart = res.data?.chart?.result?.[0];
    if (!chart) throw new Error('VIX data kosong');

    const closes     = chart.indicators?.quote?.[0]?.close ?? [];
    const timestamps = chart.timestamp ?? [];

    const filtered = closes
      .map((c, i) => ({ c, t: timestamps[i] }))
      .filter(x => x.c != null && x.c > 0);
    if (filtered.length < 2) throw new Error('VIX tidak cukup data');

    const latest    = filtered[filtered.length - 1];
    const prev      = filtered[filtered.length - 2];
    const vixValue  = parseFloat(latest.c.toFixed(2));
    const dayChange = parseFloat((latest.c - prev.c).toFixed(2));
    const date      = new Date(latest.t * 1000).toISOString().slice(0, 10);

    const zone   = vixValue > 30 ? 'panic' : vixValue > 20 ? 'elevated' : vixValue < 15 ? 'complacent' : 'normal';
    const signal = zone === 'panic' ? '🔴' : zone === 'elevated' ? '⚠️' : zone === 'complacent' ? '✅' : '⚠️';

    console.log(`  ✓ VIX    : ${vixValue} | Δ${dayChange >= 0 ? '+' : ''}${dayChange} | ${zone} ${signal}`);
    return { value: vixValue, dayChange, date, zone, signal };
  } catch (err) {
    console.error('❌ VIX fetch error:', err.message);
    return null;
  }
}

// ── AGGREGATE + TRIFECTA SCORE ────────────────────────────────────────────────
export async function fetchAllFedLiquidity(fredApiKey) {
  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }

  // FRED always returns latest available data (updated every Thursday).
  // No day-gate: fetching on any day just returns last Thursday's data.
  console.log('🏦 Fetching Fed Liquidity data...');

  const [walcl, rrp, reserves, tga, hySpread, yieldCurve, vix] = await Promise.allSettled([
    fetchFedBalanceSheet(fredApiKey),
    fetchRRP(fredApiKey),
    fetchReserveBalances(fredApiKey),
    fetchTGA(fredApiKey),
    fetchHYCreditSpread(fredApiKey),
    fetchYieldCurve(fredApiKey),
    fetchVIX(),
  ]);

  if (walcl.status    === 'rejected') console.error('  WALCL rejected:',     walcl.reason);
  if (rrp.status      === 'rejected') console.error('  RRP rejected:',       rrp.reason);
  if (reserves.status === 'rejected') console.error('  WLRRAL rejected:',    reserves.reason);
  if (tga.status      === 'rejected') console.error('  TGA rejected:',       tga.reason);
  if (hySpread.status === 'rejected') console.error('  HY Spread rejected:', hySpread.reason);
  if (yieldCurve.status === 'rejected') console.error('  Yield Curve rejected:', yieldCurve.reason);
  if (vix.status      === 'rejected') console.error('  VIX rejected:',       vix.reason);

  const w   = walcl.value      ?? null;
  const r   = rrp.value        ?? null;
  const rv  = reserves.value   ?? null;
  const tg  = tga.value        ?? null;
  const hy  = hySpread.value   ?? null;
  const yc  = yieldCurve.value ?? null;
  const vx  = vix.value        ?? null;

  // Trifecta: hanya hitung dari WALCL/RRP/WLRRAL (existing)
  const available  = [w, r, rv].filter(x => x !== null && x !== undefined && !x.skipped);
  const signals    = available.map(x => x.signal).filter(Boolean);
  const greenCount = signals.filter(s => s === '✅').length;
  const redCount   = signals.filter(s => s === '🔴').length;
  const total      = signals.length;

  const overallStatus =
    total === 0     ? 'DATA_UNAVAILABLE' :
    greenCount >= 2 ? 'EKSPANSI' :
    redCount   >= 2 ? 'KONTRAKSI' : 'MIXED';

  // Phase 0 macro stress score (TGA refill + HY spread elevated + curve inverted + VIX panic)
  const stressSignals = [tg, hy, yc, vx].filter(x => x !== null && x !== undefined && !x.skipped);
  const stressRed = stressSignals.filter(x => x.signal === '🔴').length;
  const stressTotal = stressSignals.length;
  const macroStressLabel =
    stressTotal === 0    ? 'NO_DATA' :
    stressRed   >= 3     ? 'KRITIS' :
    stressRed   >= 2     ? 'TINGGI' :
    stressRed   === 1    ? 'MODERAT' : 'RENDAH';

  return {
    walcl:    w,
    rrp:      r,
    reserves: rv,
    tga:      tg,
    hySpread: hy,
    yieldCurve: yc,
    vix:      vx,
    trifectaScore:  `${greenCount}/${total}`,
    greenCount,
    overallStatus,
    macroStressScore: `${stressRed}/${stressTotal}`,
    macroStressLabel,
  };
}
