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
    console.error(`❌ OilPriceAPI weekly error: ${err.message}`);
    return null;
  }
}

// ── 6. ETH/BTC & SOL/BTC RATIO TREND ────────────────────────────────────────
// Diambil dari CoinGecko (sudah ada di daily, tapi weekly perlu trend 7 hari)
export async function fetchRatioTrend() {
  try {
    // Ambil data 7 hari historis BTC dan ETH
    const [btcHist, ethHist, solHist] = await Promise.all([
      axios.get('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart', {
        params: { vs_currency: 'usd', days: 7, interval: 'daily' },
      }),
      axios.get('https://api.coingecko.com/api/v3/coins/ethereum/market_chart', {
        params: { vs_currency: 'usd', days: 7, interval: 'daily' },
      }),
      axios.get('https://api.coingecko.com/api/v3/coins/solana/market_chart', {
        params: { vs_currency: 'usd', days: 7, interval: 'daily' },
      }),
    ]);

    const btcPrices = btcHist.data.prices;
    const ethPrices = ethHist.data.prices;
    const solPrices = solHist.data.prices;

    // Rasio sekarang vs 7 hari lalu
    const ethBtcNow = ethPrices[ethPrices.length - 1][1] / btcPrices[btcPrices.length - 1][1];
    const ethBtcPrev = ethPrices[0][1] / btcPrices[0][1];
    const ethBtcChange = ((ethBtcNow - ethBtcPrev) / ethBtcPrev) * 100;

    const solBtcNow = solPrices[solPrices.length - 1][1] / btcPrices[btcPrices.length - 1][1];
    const solBtcPrev = solPrices[0][1] / btcPrices[0][1];
    const solBtcChange = ((solBtcNow - solBtcPrev) / solBtcPrev) * 100;

    return {
      ethBtc: {
        ratio: parseFloat(ethBtcNow.toFixed(6)),
        weekChange: parseFloat(ethBtcChange.toFixed(2)),
        direction: ethBtcChange > 2 ? 'breakout' : ethBtcChange < -2 ? 'turun' : 'flat',
      },
      solBtc: {
        ratio: parseFloat(solBtcNow.toFixed(6)),
        weekChange: parseFloat(solBtcChange.toFixed(2)),
        direction: solBtcChange > 3 ? 'naik' : solBtcChange < -3 ? 'turun' : 'flat',
      },
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
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/global', { timeout: 8000 });
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

  return {
    timestamp: new Date().toISOString(),
    yield10y,
    nfci,
    tvl,
    altseason,
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

// ── HELPER ────────────────────────────────────────────────────────────────────
function getDateNWeeksAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().split('T')[0];
}
