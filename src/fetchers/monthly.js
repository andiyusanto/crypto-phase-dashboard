// ============================================
// MONTHLY DATA FETCHER
// Data yang diisi awal bulan
// ============================================

import axios from 'axios';

// ── 1. CPI YoY (FRED API) ─────────────────────────────────────────────────────
export async function fetchCPI(fredApiKey) {
  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }

  try {
    const res = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
      params: {
        series_id: 'CPIAUCSL',
        api_key: fredApiKey,
        file_type: 'json',
        sort_order: 'desc',
        limit: 15,
      },
      timeout: 10000,
    });

    // Defensive: periksa struktur response
    if (!res.data || !res.data.observations) {
      throw new Error(`Response tidak valid: ${JSON.stringify(res.data).slice(0, 200)}`);
    }

    const obs = res.data.observations.filter(o => o.value !== '.' && o.value !== null);
    if (obs.length < 13) {
      throw new Error(`Data CPI hanya ${obs.length} observasi, butuh minimal 13`);
    }

    const latest   = parseFloat(obs[0].value);
    const prevMonth = parseFloat(obs[1].value);
    const yearAgo  = parseFloat(obs[12].value);

    const yoy = ((latest - yearAgo) / yearAgo) * 100;
    const mom = ((latest - prevMonth) / prevMonth) * 100;

    // Bandingkan YoY bulan ini vs YoY bulan lalu (butuh obs[13] untuk ini)
    let trend = 'stabil';
    if (obs.length >= 14) {
      const prevYearAgo = parseFloat(obs[13].value);
      const prevYoy = ((prevMonth - prevYearAgo) / prevYearAgo) * 100;
      trend = yoy > prevYoy ? 'naik' : yoy < prevYoy ? 'turun' : 'stabil';
    }

    return {
      index: parseFloat(latest.toFixed(3)),
      yoy: parseFloat(yoy.toFixed(2)),
      mom: parseFloat(mom.toFixed(2)),
      date: obs[0].date,
      trend,
    };
  } catch (err) {
    console.error('❌ FRED CPI error:', err.message);
    return null;
  }
}

// ── 2. FED FUNDS RATE (FRED API) ─────────────────────────────────────────────
export async function fetchFedRate(fredApiKey) {
  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }

  try {
    // FEDFUNDS = Effective Federal Funds Rate (monthly)
    const res = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
      params: {
        series_id: 'FEDFUNDS',
        api_key: fredApiKey,
        file_type: 'json',
        sort_order: 'desc',
        limit: 3,
      },
    });

    const obs = res.data.observations.filter(o => o.value !== '.');
    if (obs.length < 1) throw new Error('Data Fed Rate kosong');

    const latest = parseFloat(obs[0].value);
    const prev = obs.length > 1 ? parseFloat(obs[1].value) : latest;
    const change = latest - prev;

    return {
      rate: parseFloat(latest.toFixed(2)),
      date: obs[0].date,
      change: parseFloat(change.toFixed(2)),
      decision: change > 0 ? 'hike' : change < 0 ? 'cut' : 'hold',
      label: `${latest.toFixed(2)}% (${change > 0 ? '+' : ''}${change.toFixed(2)}% dari bulan lalu)`,
    };
  } catch (err) {
    console.error('❌ FRED Fed Rate error:', err.message);
    return null;
  }
}

// ── 4. GLOBAL M2 — US + China + Japan + Eurozone (semua dari FRED) ───────────
//
// Series FRED yang dipakai:
//   US M2     : M2SL              (Billions USD, monthly)
//   China M2  : MYAGM2CNM189N     (Billions CNY, monthly, IMF)
//   Japan M2  : MYAGM2JPM189N     (Billions JPY, monthly, IMF)
//   Eurozone  : MABMM301EZM189S   (Millions EUR, M3 karena M2 EZ tidak tersedia, monthly)
//
// Exchange rates untuk konversi ke USD:
//   CNY/USD   : DEXCHUS   (Yuan per 1 USD → 1/rate = USD per Yuan)
//   JPY/USD   : DEXJPUS   (Yen per 1 USD)
//   EUR/USD   : DEXUSEU   (USD per 1 Euro)
//
// Catatan: semua series update bulanan, lag ~6-8 minggu
// Konversi ke USD agar bisa dijumlahkan sebagai Global M2

export async function fetchM2(fredApiKey) {
  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }

  // Helper: ambil satu FRED series
  const getSeries = async (seriesId, limit = 14) => {
    const res = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
      params: { series_id: seriesId, api_key: fredApiKey, file_type: 'json',
                sort_order: 'desc', limit },
      timeout: 10000,
    });
    if (!res.data?.observations) throw new Error(`${seriesId}: response invalid`);
    return res.data.observations.filter(o => o.value !== '.' && o.value !== null);
  };

  try {
    // Fetch semua paralel
    const [usObs, cnObs, jpObs, ezObs, cnyObs, jpyObs, eurObs] = await Promise.all([
      getSeries('M2SL'),             // US M2 — Billions USD
      getSeries('MYAGM2CNM189N'),    // China M2 — Billions CNY
      getSeries('MYAGM2JPM189N'),    // Japan M2 — Billions JPY
      getSeries('MABMM301EZM189S'),  // Eurozone M3 — Millions EUR
      getSeries('DEXCHUS', 3),       // CNY per 1 USD (daily, ambil terbaru)
      getSeries('DEXJPUS', 3),       // JPY per 1 USD
      getSeries('DEXUSEU', 3),       // USD per 1 EUR
    ]);

    // ── Nilai terkini (index 0 = terbaru) ──────────────────────────────────
    const usLatest  = parseFloat(usObs[0].value);   // Billions USD
    const cnLatest  = parseFloat(cnObs[0].value);   // Billions CNY
    const jpLatest  = parseFloat(jpObs[0].value);   // Billions JPY
    const ezLatest  = parseFloat(ezObs[0].value);   // Millions EUR → / 1000 = Billions EUR

    const cnyPerUsd = parseFloat(cnyObs[0].value);  // CNY per 1 USD
    const jpyPerUsd = parseFloat(jpyObs[0].value);  // JPY per 1 USD
    const usdPerEur = parseFloat(eurObs[0].value);  // USD per 1 EUR

    // ── Konversi ke Triliun USD ────────────────────────────────────────────
    const usT  = usLatest / 1000;                        // Billions → Trillions
    const cnT  = (cnLatest / cnyPerUsd) / 1000;         // Billions CNY → Trillions USD
    const jpT  = (jpLatest / jpyPerUsd) / 1000;         // Billions JPY → Trillions USD
    const ezT  = ((ezLatest / 1000) * usdPerEur) / 1000; // Millions → Billions EUR → Trillions USD

    const globalT = usT + cnT + jpT + ezT;

    // ── YoY growth untuk masing-masing ────────────────────────────────────
    const yoy = (obs, divisor = 1000) => {
      if (obs.length < 13) return null;
      const latest  = parseFloat(obs[0].value)  / divisor;
      const yearAgo = parseFloat(obs[12].value) / divisor;
      return parseFloat(((latest - yearAgo) / yearAgo * 100).toFixed(2));
    };

    // Untuk Global YoY: bandingkan total sekarang vs total 12 bulan lalu
    // Ambil nilai 12 bulan lalu untuk setiap komponen
    const usT12   = usObs.length >= 13  ? parseFloat(usObs[12].value)  / 1000 : usT;
    const cnT12   = cnObs.length >= 13  ? (parseFloat(cnObs[12].value) / cnyPerUsd) / 1000 : cnT;
    const jpT12   = jpObs.length >= 13  ? (parseFloat(jpObs[12].value) / jpyPerUsd) / 1000 : jpT;
    const ezT12   = ezObs.length >= 13  ? ((parseFloat(ezObs[12].value) / 1000) * usdPerEur) / 1000 : ezT;
    const globalT12 = usT12 + cnT12 + jpT12 + ezT12;

    const globalYoY = parseFloat(((globalT - globalT12) / globalT12 * 100).toFixed(2));

    console.log(`  ✓ Global M2 | US: $${usT.toFixed(1)}T | CN: $${cnT.toFixed(1)}T | JP: $${jpT.toFixed(1)}T | EZ: $${ezT.toFixed(1)}T | Total: $${globalT.toFixed(1)}T | YoY: ${globalYoY}%`);

    return {
      // Komponen (dalam Triliun USD)
      us:  parseFloat(usT.toFixed(2)),
      cn:  parseFloat(cnT.toFixed(2)),
      jp:  parseFloat(jpT.toFixed(2)),
      ez:  parseFloat(ezT.toFixed(2)),
      // Total
      globalTrillions: parseFloat(globalT.toFixed(2)),
      globalYoY,
      // YoY per negara
      usYoY:  yoy(usObs, 1000),
      cnYoY:  yoy(cnObs, 1000),
      jpYoY:  yoy(jpObs, 1000),
      ezYoY:  yoy(ezObs, 1000),
      // Meta
      date: usObs[0].date,
      fxRates: {
        cnyPerUsd: parseFloat(cnyPerUsd.toFixed(4)),
        jpyPerUsd: parseFloat(jpyPerUsd.toFixed(2)),
        usdPerEur: parseFloat(usdPerEur.toFixed(4)),
      },
      note: 'US+CN+JP+EZ (Eurozone pakai M3). Semua dikonversi ke USD.',
      trend: globalYoY > 5 ? 'ekspansif_kuat' : globalYoY > 0 ? 'ekspansif' : 'kontraktif',
    };
  } catch (err) {
    console.error('❌ Global M2 error:', err.message);
    // Fallback: US M2 saja
    try {
      const usObs = await (async () => {
        const res = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
          params: { series_id: 'M2SL', api_key: fredApiKey, file_type: 'json',
                    sort_order: 'desc', limit: 14 },
        });
        return res.data.observations.filter(o => o.value !== '.');
      })();
      const latest = parseFloat(usObs[0].value);
      const yearAgo = parseFloat(usObs[12].value);
      console.warn('  ⚠️  Global M2 fallback ke US M2 saja');
      return {
        us: parseFloat((latest / 1000).toFixed(2)),
        usYoY: parseFloat(((latest - yearAgo) / yearAgo * 100).toFixed(2)),
        globalTrillions: null,
        globalYoY: null,
        note: 'Fallback: US M2 saja (CN/JP/EZ gagal)',
        trend: null,
      };
    } catch {
      return null;
    }
  }
}

// ── AGGREGATE: SEMUA MONTHLY DATA ────────────────────────────────────────────
export async function fetchAllMonthlyData(config = {}) {
  console.log('📆 Fetching monthly data...');

  const results = await Promise.allSettled([
    fetchCPI(config.fredApiKey),
    fetchFedRate(config.fredApiKey),
    fetchM2(config.fredApiKey),
  ]);

  const [cpi, fedRate, m2] = results.map(r => r.status === 'fulfilled' ? r.value : null);

  return {
    timestamp: new Date().toISOString(),
    cpi,
    fedRate,
    m2,
  };
}
