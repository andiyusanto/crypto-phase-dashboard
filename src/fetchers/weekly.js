// ============================================
// WEEKLY DATA FETCHER
// Data yang diisi setiap Senin
// ============================================

import axios from 'axios';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 1. US 10Y YIELD (FRED API) ────────────────────────────────────────────────
export async function fetchUS10YYield(fredApiKey) {
  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }

  try {
    const res = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
      params: {
        series_id: 'DGS10',        // Daily Treasury Yield 10Y
        api_key: fredApiKey,
        file_type: 'json',
        sort_order: 'desc',
        limit: 10,                 // Ambil 10 data terakhir untuk bandingkan
        observation_start: getDateNWeeksAgo(2),
      },
    });

    const obs = res.data.observations.filter(o => o.value !== '.');
    if (obs.length < 2) throw new Error('Data 10Y yield kurang');

    const latest = parseFloat(obs[0].value);
    const prevWeek = parseFloat(obs[Math.min(5, obs.length - 1)].value); // ~5 hari lalu
    const change = latest - prevWeek;

    return {
      value: latest,
      date: obs[0].date,
      direction: change > 0.05 ? 'naik' : change < -0.05 ? 'turun' : 'flat',
      weekChange: parseFloat(change.toFixed(3)),
    };
  } catch (err) {
    console.error('❌ FRED 10Y Yield error:', err.message);
    return null;
  }
}

// ── 2. NFCI — Chicago Fed NFCI (FRED API) ────────────────────────────────────
export async function fetchNFCI(fredApiKey) {
  if (!fredApiKey || fredApiKey === 'your_fred_api_key_here') {
    return { skipped: true, reason: 'FRED_API_KEY tidak diset' };
  }

  try {
    const res = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
      params: {
        series_id: 'NFCI',
        api_key: fredApiKey,
        file_type: 'json',
        sort_order: 'desc',
        limit: 4,               // 4 minggu terakhir
      },
    });

    const obs = res.data.observations.filter(o => o.value !== '.');
    if (obs.length < 2) throw new Error('Data NFCI kurang');

    const latest = parseFloat(obs[0].value);
    const prevWeek = parseFloat(obs[1].value);
    const change = latest - prevWeek;

    return {
      value: parseFloat(latest.toFixed(4)),
      date: obs[0].date,
      prevWeek: parseFloat(prevWeek.toFixed(4)),
      change: parseFloat(change.toFixed(4)),
      // NFCI: positif = kondisi ketat, negatif = kondisi longgar
      condition: latest > 0 ? 'tight' : 'loose',
      trend: change > 0.01 ? 'memperketat' : change < -0.01 ? 'melonggar' : 'stabil',
    };
  } catch (err) {
    console.error('❌ FRED NFCI error:', err.message);
    return null;
  }
}

// ── 3. DEFI TVL (DEFILLAMA) ───────────────────────────────────────────────────
export async function fetchDefiTVL() {
  try {
    // Ambil total TVL historis untuk bandingkan minggu ini vs minggu lalu
    const res = await axios.get('https://api.llama.fi/v2/historicalChainTvl');

    const data = res.data;
    if (!data || data.length < 8) throw new Error('Data TVL kurang');

    // Data terbaru
    const latest = data[data.length - 1];
    const prevWeek = data[data.length - 8]; // ~7 hari lalu

    const tvlNow = latest.tvl;
    const tvlPrev = prevWeek.tvl;
    const changePercent = ((tvlNow - tvlPrev) / tvlPrev) * 100;

    return {
      tvl: parseFloat((tvlNow / 1e9).toFixed(2)),          // dalam Miliar
      tvlPrevWeek: parseFloat((tvlPrev / 1e9).toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      date: new Date(latest.date * 1000).toISOString().split('T')[0],
      direction: changePercent > 1 ? 'naik' : changePercent < -1 ? 'turun' : 'flat',
    };
  } catch (err) {
    console.error('❌ DefiLlama TVL error:', err.message);
    return null;
  }
}

// ── 4. ALTSEASON INDEX (blockchaincenter.net HTML scrape) ────────────────────
// Value 0–100: ≥75 = Altseason, ≤25 = Bitcoin Season
// Data is embedded as escaped JSON in the SSR HTML: \"YYYY-MM-DD\":\"value\"
export async function fetchAltseasonIndex() {
  try {
    const res = await axios.get('https://blockchaincenter.net/altcoin-season-index/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 12000,
    });

    // Data is embedded as escaped JSON: \"2026-04-09\":\"35\"
    // Multiple timeframes exist; the last occurrence of today's date is the headline (90-day) index
    const pairs = [...res.data.matchAll(/\\"(\d{4}-\d{2}-\d{2})\\":\\"(\d+)\\"/g)];
    if (!pairs.length) throw new Error('No date:value pairs found in HTML');

    const latest = pairs.at(-1);
    const date   = latest[1];
    const value  = parseInt(latest[2], 10);

    if (isNaN(value) || value < 0 || value > 100) throw new Error(`Invalid index value: ${value}`);

    const signal = value >= 75 ? 'Altseason 🚀'
                 : value <= 25 ? 'Bitcoin Season 🟠'
                 : value >= 55 ? 'Altseason territory ⚡'
                 : 'Neutral / Bitcoin favored ⚠️';

    console.log(`  ✓ Altseason Index: ${value} (${date}) — ${signal}`);
    return { value, date, signal, source: 'blockchaincenter.net' };

  } catch (err) {
    console.warn(`  ⚠️  Altseason Index fetch failed: ${err.message}`);
    return null;
  }
}

// ── 5. BRENT OIL WEEKLY — via OilPriceAPI past_week ─────────────────────────
// Sudah di-fetch dari daily (brentOil), tapi weekly juga fetch
// untuk memastikan weekChange tersedia meski daily skip
export async function fetchBrentOilWeekly(apiKey) {
  if (!apiKey || apiKey === 'your_oilprice_api_key_here') {
    return { skipped: true, reason: 'OIL_PRICE_API_KEY tidak diset' };
  }

  try {
    const [latestRes, weekRes] = await Promise.all([
      axios.get('https://api.oilpriceapi.com/v1/prices/latest', {
        params: { by_code: 'BRENT_CRUDE_USD' },
        headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 8000,
      }),
      axios.get('https://api.oilpriceapi.com/v1/prices/past_week', {
        params: { by_code: 'BRENT_CRUDE_USD' },
        headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 8000,
      }),
    ]);

    if (latestRes.data.status !== 'success') {
      throw new Error(`API error: ${latestRes.data.message || JSON.stringify(latestRes.data)}`);
    }

    const price = parseFloat(latestRes.data.data.price);
    const weekData = weekRes.data?.data;

    let weekChange = null;
    let direction = 'flat';
    if (Array.isArray(weekData) && weekData.length >= 2) {
      const oldest = parseFloat(weekData[weekData.length - 1].price);
      const pct = ((price - oldest) / oldest) * 100;
      weekChange = parseFloat(pct.toFixed(2));
      direction = pct > 1 ? 'naik' : pct < -1 ? 'turun' : 'flat';
    }

    console.log(`  ✓ Brent Oil weekly via OilPriceAPI | $${price} | 7d: ${weekChange}%`);
    return { price: parseFloat(price.toFixed(2)), weekChange, direction, source: 'OilPriceAPI' };
  } catch (err) {
    if (err.response?.status === 402) {
      console.warn(`  ⚠️  OilPriceAPI weekly: paid tier required (HTTP 402) — skip`);
    } else {
      console.error(`❌ OilPriceAPI weekly error: ${err.message}`);
    }
    return null;
  }
}

// ── 6. ETH/BTC & SOL/BTC RATIO TREND ────────────────────────────────────────
// Diambil dari CoinGecko (sudah ada di daily, tapi weekly perlu trend 7 hari)
export async function fetchRatioTrend() {
  try {
    // Ambil data 7 hari historis sequentially dengan delay untuk hindari CoinGecko 429.
    // Free tier: ~10-30 calls/min — 5 calls back-to-back sering trigger rate limit.
    // Sequential + 600ms delay = 5 calls dalam ~3s, masih dalam limit aman.
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    // 1× retry on 429: CoinGecko free tier sometimes 429s on first call even within budget.
    const fetchCoin = async (id) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await axios.get(`https://api.coingecko.com/api/v3/coins/${id}/market_chart`, {
            params: { vs_currency: 'usd', days: 7, interval: 'daily' }, timeout: 12000,
          });
          return { status: 'fulfilled', value: r };
        } catch (e) {
          const status = e.response?.status;
          if ((status === 429 || status === 503) && attempt === 0) {
            console.warn(`  ⚠️  ${id} rate-limited, retry in 3s`);
            await wait(3000);
            continue;
          }
          return { status: 'rejected', reason: e };
        }
      }
    };

    const btcRes  = await fetchCoin('bitcoin');     await wait(600);
    const ethRes  = await fetchCoin('ethereum');    await wait(600);
    const solRes  = await fetchCoin('solana');      await wait(600);
    const avaxRes = await fetchCoin('avalanche-2'); await wait(600);
    const xrpRes  = await fetchCoin('ripple');

    // BTC wajib ada — tanpanya tidak bisa hitung rasio apapun
    if (btcRes.status !== 'fulfilled') throw new Error(`BTC history gagal: ${btcRes.reason?.message}`);

    const getPrices = (res, name) => {
      if (res.status !== 'fulfilled') { console.warn(`⚠️  ${name} history gagal: ${res.reason?.message}`); return null; }
      const prices = res.value.data.prices;
      if (!prices?.length) { console.warn(`⚠️  ${name} history kosong`); return null; }
      return prices;
    };

    const btcPrices  = btcRes.value.data.prices;
    const ethPrices  = getPrices(ethRes,  'ETH');
    const solPrices  = getPrices(solRes,  'SOL');
    const avaxPrices = getPrices(avaxRes, 'AVAX');
    const xrpPrices  = getPrices(xrpRes,  'XRP');

    const calcRatio = (altPrices, decimals) => {
      if (!altPrices) return null;
      const now  = altPrices[altPrices.length - 1][1] / btcPrices[btcPrices.length - 1][1];
      const prev = altPrices[0][1] / btcPrices[0][1];
      const chg  = ((now - prev) / prev) * 100;
      return { ratio: parseFloat(now.toFixed(decimals)), weekChange: parseFloat(chg.toFixed(2)) };
    };

    const eth  = calcRatio(ethPrices,  6);
    const sol  = calcRatio(solPrices,  6);
    const avax = calcRatio(avaxPrices, 8);
    const xrp  = calcRatio(xrpPrices,  8);

    return {
      ethBtc:  eth  ? { ...eth,  direction: eth.weekChange  > 2 ? 'breakout' : eth.weekChange  < -2 ? 'turun' : 'flat' } : null,
      solBtc:  sol  ? { ...sol,  direction: sol.weekChange  > 3 ? 'naik'     : sol.weekChange  < -3 ? 'turun' : 'flat' } : null,
      avaxBtc: avax ? { ...avax, direction: avax.weekChange > 3 ? 'naik'     : avax.weekChange < -3 ? 'turun' : 'flat' } : null,
      xrpBtc:  xrp  ? { ...xrp,  direction: xrp.weekChange  > 3 ? 'naik'     : xrp.weekChange  < -3 ? 'turun' : 'flat' } : null,
    };
  } catch (err) {
    console.error('❌ Ratio trend error:', err.message);
    return null;
  }
}

// ── 7. MSCI EM — via CoinGecko proxy (EEM ETF sebagai proxy) ─────────────────
// Tidak ada API gratis untuk MSCI EM index langsung.
// iShares MSCI EM ETF (EEM) adalah proxy terbaik yang bisa diambil gratis.
// Pakai Twelve Data untuk EEM price.
export async function fetchMSCIEM(apiKey) {
  if (!apiKey || apiKey === 'your_twelve_data_key_here') {
    return { skipped: true, reason: 'TWELVE_DATA_API_KEY tidak diset — MSCI EM skip' };
  }

  try {
    const res = await axios.get('https://api.twelvedata.com/time_series', {
      params: { symbol: 'EEM', interval: '1day', outputsize: 6, apikey: apiKey },
      timeout: 8000,
    });

    if (res.data.status === 'error' || !res.data.values) {
      throw new Error(res.data.message || 'No values');
    }

    const values = res.data.values;
    const latest   = parseFloat(values[0].close);
    const prevWeek = parseFloat(values[Math.min(5, values.length - 1)].close);
    const weekChange = ((latest - prevWeek) / prevWeek) * 100;

    console.log(`  ✓ MSCI EM (EEM proxy): $${latest} | 7d: ${weekChange.toFixed(2)}%`);
    return {
      value: parseFloat(latest.toFixed(2)),
      weekChange: parseFloat(weekChange.toFixed(2)),
      direction: weekChange > 1 ? 'naik' : weekChange < -1 ? 'turun' : 'flat',
      note: 'EEM ETF sebagai proxy MSCI EM',
    };
  } catch (err) {
    console.warn(`⚠️  MSCI EM (EEM) error: ${err.message}`);
    return { skipped: true, reason: `EEM fetch gagal: ${err.message}` };
  }
}

// ── 8. OTHERS.D — hitung dari CoinGecko global data ──────────────────────────
// OTHERS.D = market cap semua koin selain BTC, ETH, BNB, XRP, SOL, ADA, DOGE
// = 100% - BTC.D - ETH.D - dominasi top coins lainnya
// CoinGecko /global sudah punya breakdown market_cap_percentage per coin
export async function fetchOthersDominance() {
  // Retry on 429: CoinGecko free tier is bursty. Linear backoff (no exp = stay under timeout).
  const fetchGlobal = async (attempt = 0) => {
    try {
      return await axios.get('https://api.coingecko.com/api/v3/global', { timeout: 8000 });
    } catch (err) {
      const status = err.response?.status;
      if ((status === 429 || status === 503) && attempt < 2) {
        const wait = (attempt + 1) * 2000;
        console.warn(`  ⚠️  OTHERS.D rate-limited (${status}), retry in ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        return fetchGlobal(attempt + 1);
      }
      throw err;
    }
  };
  try {
    const res = await fetchGlobal();
    const pct = res.data.data.market_cap_percentage;

    // Top coins yang biasanya dilaporkan
    const topCoins = ['btc', 'eth', 'usdt', 'bnb', 'sol', 'xrp', 'usdc', 'ada', 'doge', 'trx'];
    const topSum = topCoins.reduce((acc, coin) => acc + (pct[coin] || 0), 0);

    // OTHERS.D = sisanya (koin selain top)
    const othersDom = Math.max(0, 100 - topSum);

    // BTC.D dan ETH.D untuk context
    const btcDom = pct['btc'] || 0;
    const ethDom = pct['eth'] || 0;

    console.log(`  ✓ OTHERS.D: ${othersDom.toFixed(2)}% | BTC.D: ${btcDom.toFixed(2)}% | ETH.D: ${ethDom.toFixed(2)}%`);
    return {
      othersDominance: parseFloat(othersDom.toFixed(2)),
      btcDominance: parseFloat(btcDom.toFixed(2)),
      ethDominance: parseFloat(ethDom.toFixed(2)),
      // Arah: OTHERS.D naik = rotasi ke smallcap = late altseason signal
      note: 'Dihitung dari 100% - top 10 coin dominance via CoinGecko',
    };
  } catch (err) {
    console.error('❌ OTHERS.D error:', err.message);
    return null;
  }
}

// ── 9. BTC EXCHANGE NETFLOW (CoinMetrics Community API — no key required) ──────
export async function fetchExchangeNetflow() {
  try {
    const res = await axios.get('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics', {
      params: {
        assets: 'btc',
        metrics: 'FlowInExNtv,FlowOutExNtv',
        frequency: '1d',
        limit_per_asset: 2,
      },
      timeout: 12000,
    });

    const data = res.data?.data;
    if (!data || data.length === 0) throw new Error('No data returned');

    // Use latest entry
    const latest = data[data.length - 1];
    const inflow  = parseFloat(latest.FlowInExNtv);
    const outflow = parseFloat(latest.FlowOutExNtv);
    const netflow = inflow - outflow;

    const direction = netflow > 0 ? 'inflow' : 'outflow';
    const absNet    = Math.abs(Math.round(netflow));
    const label     = `${direction} (${netflow > 0 ? '+' : '-'}${absNet.toLocaleString()} BTC)`;

    return {
      inflow:  parseFloat(inflow.toFixed(2)),
      outflow: parseFloat(outflow.toFixed(2)),
      netflow: parseFloat(netflow.toFixed(2)),
      direction,
      label,
      date: latest.time.split('T')[0],
    };
  } catch (err) {
    console.error('❌ CoinMetrics exchange netflow error:', err.message);
    return null;
  }
}

// ── AGGREGATE: SEMUA WEEKLY DATA ──────────────────────────────────────────────
export async function fetchAllWeeklyData(config = {}) {
  console.log('📅 Fetching weekly data...');

  const results = await Promise.allSettled([
    fetchUS10YYield(config.fredApiKey),
    fetchNFCI(config.fredApiKey),
    fetchDefiTVL(),
    fetchAltseasonIndex(),
    fetchRatioTrend(),
    fetchBrentOilWeekly(config.oilPriceApiKey),
    fetchMSCIEM(config.twelveDataKey),
    fetchOthersDominance(),
    fetchExchangeNetflow(),
  ]);

  const [yield10y, nfci, tvl, altseason, ratioTrend, oil, msciEm, othersDom, exchangeNetflow] =
    results.map(r => r.status === 'fulfilled' ? r.value : null);

  const altseasonProxy = computeAltseasonProxy(ratioTrend, othersDom);

  if (!altseason) {
    console.log(`  ↩ Altseason Index fetch gagal — proxy: ${altseasonProxy.value} (${altseasonProxy.signal})`);
  }

  return {
    timestamp: new Date().toISOString(),
    yield10y,
    nfci,
    tvl,
    altseason,
    altseasonProxy,
    ratioTrend,
    oil,
    msciEm,
    othersDom,
    exchangeNetflow,
    // Manual fields
    total2: null,
    total3: null,
  };
}

// ── ALTSEASON PROXY ───────────────────────────────────────────────────────────
// Kalkulasi altseason score (0–100) dari data yang sudah kita punya:
// ETH/BTC (35pts) + SOL/BTC (25pts) + AVAX/BTC (20pts) + XRP/BTC (10pts) + OTHERS.D (10pts)
// Skala dan threshold dikalibrasi agar konsisten dengan blockchaincenter.net
export function computeAltseasonProxy(ratioTrend, othersDom) {
  const ethChg  = ratioTrend?.ethBtc?.weekChange  ?? null;
  const solChg  = ratioTrend?.solBtc?.weekChange  ?? null;
  const avaxChg = ratioTrend?.avaxBtc?.weekChange ?? null;
  const xrpChg  = ratioTrend?.xrpBtc?.weekChange  ?? null;
  const othersD = othersDom?.othersDominance      ?? null;

  // ETH/BTC momentum — 35 pts, primary signal (ETH leads alt rotation)
  const ethScore = ethChg == null ? 17
    : ethChg > 15  ? 35 : ethChg > 8  ? 28 : ethChg > 3  ? 21
    : ethChg > 0   ? 14 : ethChg > -3 ? 9  : ethChg > -8 ? 4 : 0;

  // SOL/BTC momentum — 25 pts, high-beta primary confirmation
  const solScore = solChg == null ? 12
    : solChg > 15  ? 25 : solChg > 8  ? 20 : solChg > 3  ? 15
    : solChg > 0   ? 10 : solChg > -3 ? 6  : solChg > -8 ? 2  : 0;

  // AVAX/BTC momentum — 20 pts, high-beta secondary confirmation
  const avaxScore = avaxChg == null ? 10
    : avaxChg > 15  ? 20 : avaxChg > 8  ? 16 : avaxChg > 3  ? 12
    : avaxChg > 0   ? 8  : avaxChg > -3 ? 4  : avaxChg > -8 ? 1  : 0;

  // XRP/BTC momentum — 10 pts, institutional rotation leading indicator
  const xrpScore = xrpChg == null ? 5
    : xrpChg > 15  ? 10 : xrpChg > 8  ? 8 : xrpChg > 3  ? 6
    : xrpChg > 0   ? 4  : xrpChg > -3 ? 2 : xrpChg > -8 ? 1 : 0;

  // OTHERS.D level — 10 pts, structural small-cap rotation
  const domScore = othersD == null ? 5
    : othersD > 25 ? 10 : othersD > 20 ? 8 : othersD > 15 ? 6
    : othersD > 12 ? 4  : othersD > 9  ? 2 : othersD > 6  ? 1 : 0;

  const score  = Math.min(100, Math.round(ethScore + solScore + avaxScore + xrpScore + domScore));
  const signal = score >= 75 ? 'Altseason 🚀'
    : score >= 55             ? 'Altseason territory ⚡'
    : score <= 25             ? 'Bitcoin Season 🟠'
    :                           'Neutral / Bitcoin favored ⚠️';

  const components = [
    ethChg  != null ? `ETH/BTC WoW: ${ethChg > 0 ? '+' : ''}${ethChg}%`   : null,
    solChg  != null ? `SOL/BTC WoW: ${solChg > 0 ? '+' : ''}${solChg}%`   : null,
    avaxChg != null ? `AVAX/BTC WoW: ${avaxChg > 0 ? '+' : ''}${avaxChg}%` : null,
    xrpChg  != null ? `XRP/BTC WoW: ${xrpChg > 0 ? '+' : ''}${xrpChg}%`   : null,
    othersD != null ? `OTHERS.D: ${othersD}%` : null,
  ].filter(Boolean).join(' | ');

  return { value: score, signal, source: `proxy (${components})`, isProxy: true };
}

// ── HELPER ────────────────────────────────────────────────────────────────────
function getDateNWeeksAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().split('T')[0];
}
