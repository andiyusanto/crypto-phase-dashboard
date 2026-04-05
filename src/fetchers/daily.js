// ============================================
// DAILY DATA FETCHER
// Semua data yang wajib diisi setiap hari
// ============================================

import axios from 'axios';

// Helper: delay untuk hindari rate limit
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Helper: hitung arah berdasarkan perubahan
const getDirection = (change) => {
  if (change > 0.1) return 'naik';
  if (change < -0.1) return 'turun';
  return 'flat';
};

// ── 1. BTC PRICE + DOMINANCE ──────────────────────────────────────────────────
export async function fetchCryptoData() {
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/global');
    const global = res.data.data;

    // Ambil harga BTC + ETH + SOL sekaligus
    const priceRes = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price',
      {
        params: {
          ids: 'bitcoin,ethereum,solana,tether,usd-coin',
          vs_currencies: 'usd',
          include_24hr_change: true,
          include_market_cap: true,
        },
      }
    );

    const prices = priceRes.data;
    const btcDominance = global.market_cap_percentage.btc;

    return {
      btc: {
        price: Math.round(prices.bitcoin.usd),
        change24h: parseFloat(prices.bitcoin.usd_24h_change.toFixed(2)),
      },
      eth: {
        price: Math.round(prices.ethereum.usd),
        change24h: parseFloat(prices.ethereum.usd_24h_change.toFixed(2)),
      },
      sol: {
        price: parseFloat(prices.solana.usd.toFixed(2)),
        change24h: parseFloat(prices.solana.usd_24h_change.toFixed(2)),
      },
      btcDominance: parseFloat(btcDominance.toFixed(2)),
      // Hitung rasio langsung dari harga
      ethBtcRatio: parseFloat((prices.ethereum.usd / prices.bitcoin.usd).toFixed(6)),
      solBtcRatio: parseFloat((prices.solana.usd / prices.bitcoin.usd).toFixed(6)),
      // Stablecoin supply (market cap dalam Miliar USD)
      stablecoinSupply: {
        usdt: parseFloat((prices.tether.usd_market_cap / 1e9).toFixed(2)),
        usdc: parseFloat((prices['usd-coin'].usd_market_cap / 1e9).toFixed(2)),
        total: parseFloat(
          ((prices.tether.usd_market_cap + prices['usd-coin'].usd_market_cap) / 1e9).toFixed(2)
        ),
      },
    };
  } catch (err) {
    console.error('❌ CoinGecko error:', err.message);
    return null;
  }
}

// ── 2. FEAR & GREED INDEX ─────────────────────────────────────────────────────
export async function fetchFearGreed() {
  try {
    const res = await axios.get('https://api.alternative.me/fng/?limit=2');
    const data = res.data.data;

    const today = data[0];
    const yesterday = data[1];

    return {
      value: parseInt(today.value),
      label: today.value_classification,
      // Arah vs kemarin
      change: parseInt(today.value) - parseInt(yesterday.value),
    };
  } catch (err) {
    console.error('❌ Fear & Greed error:', err.message);
    return null;
  }
}

// ── HYPERLIQUID HELPER — cache untuk perp meta (funding rate) ─────────────────
let _hlCache = null;
async function getHyperliquidMeta() {
  if (_hlCache) return _hlCache;
  const res = await axios.post(
    'https://api.hyperliquid.xyz/info',
    { type: 'metaAndAssetCtxs' },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );
  // Response: [ {universe: [{name,...}]}, [{funding, markPx,...}] ]
  const [meta, ctxs] = res.data;
  _hlCache = { universe: meta.universe, ctxs };
  return _hlCache;
}

// ── 3. FUNDING RATES ──────────────────────────────────────────────────────────
// Binance/OKX/Bybit diblokir SSL oleh IOH/Indosat. Pakai Hyperliquid DEX.
// Field yang benar: ctx.funding (bukan fundingRate) — ini adalah 1-hour rate
export async function fetchFundingRates() {
  // ── Primary: Hyperliquid DEX ───────────────────────────────────────────────
  try {
    const { universe, ctxs } = await getHyperliquidMeta();

    const find = (name) => {
      const idx = universe.findIndex(a => a.name === name);
      if (idx === -1) throw new Error(`${name} tidak ditemukan di Hyperliquid universe`);
      return ctxs[idx];
    };

    const btcCtx = find('BTC');
    const ethCtx = find('ETH');

    // Hyperliquid funding = per-1-hour rate sebagai desimal (misal 0.0000125)
    // Konversi ke % dan ke ekuivalen 8-jam (standar industri)
    const btcRate1h = parseFloat(btcCtx.funding);
    const ethRate1h = parseFloat(ethCtx.funding);
    const btcRate8h = btcRate1h * 8 * 100;  // dalam %
    const ethRate8h = ethRate1h * 8 * 100;

    console.log(`  ✓ Funding rate via Hyperliquid | BTC raw: ${btcRate1h} | ETH raw: ${ethRate1h}`);
    return {
      btc: parseFloat(btcRate8h.toFixed(4)),
      eth: parseFloat(ethRate8h.toFixed(4)),
      btcRaw1h: btcRate1h,
      ethRaw1h: ethRate1h,
      source: 'Hyperliquid',
      note: '8h equivalent dari 1h rate Hyperliquid',
      btcSentiment: btcRate8h > 0.05 ? 'overheated_long' : btcRate8h < -0.01 ? 'short_pressure' : 'neutral',
      ethSentiment: ethRate8h > 0.05 ? 'overheated_long' : ethRate8h < -0.01 ? 'short_pressure' : 'neutral',
    };
  } catch (err) {
    console.warn(`⚠️  Funding rate Hyperliquid gagal: ${err.message}`);
  }

  // ── Fallback: CoinGecko /derivatives ──────────────────────────────────────
  // CoinGecko tidak diblokir ISP dan ada funding_rate per ticker
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/derivatives', {
      timeout: 12000,
    });

    const tickers = res.data;

    // Debug: print semua market name unik untuk BTC perp agar bisa filter tepat
    const btcMarkets = [...new Set(
      tickers.filter(t => t.base === 'BTC' && t.contract_type === 'perpetual')
             .map(t => t.market)
    )];
    console.log('  ℹ️  BTC perp markets di CoinGecko:', btcMarkets.slice(0, 8).join(', '));

    // Ambil semua perpetual BTC/ETH dengan funding_rate valid (tidak null/NaN)
    const validPerp = (base) => tickers.filter(t =>
      t.base === base &&
      t.contract_type === 'perpetual' &&
      t.funding_rate !== null &&
      !isNaN(parseFloat(t.funding_rate))
    );

    const btcPerps = validPerp('BTC');
    const ethPerps = validPerp('ETH');

    if (!btcPerps.length || !ethPerps.length) {
      throw new Error(`Tidak ada data: BTC=${btcPerps.length} ETH=${ethPerps.length}`);
    }

    // Median lebih robust dari rata-rata terhadap outlier
    const median = (perps) => {
      const rates = perps.map(t => parseFloat(t.funding_rate) * 100).sort((a,b) => a - b);
      const mid = Math.floor(rates.length / 2);
      return rates.length % 2 ? rates[mid] : (rates[mid-1] + rates[mid]) / 2;
    };

    const btcRate = median(btcPerps);
    const ethRate = median(ethPerps);

    console.log(`  ✓ Funding rate via CoinGecko | BTC median dari ${btcPerps.length} exchange | ETH dari ${ethPerps.length}`);
    return {
      btc: parseFloat(btcRate.toFixed(4)),
      eth: parseFloat(ethRate.toFixed(4)),
      source: `CoinGecko median (${btcPerps.length} exchanges)`,
      btcSentiment: btcRate > 0.05 ? 'overheated_long' : btcRate < -0.01 ? 'short_pressure' : 'neutral',
      ethSentiment: ethRate > 0.05 ? 'overheated_long' : ethRate < -0.01 ? 'short_pressure' : 'neutral',
    };
  } catch (err) {
    console.error(`❌ Funding rate semua sumber gagal: ${err.message}`);
    return null;
  }
}

// ── 3b. BRENT OIL — via OilPriceAPI ──────────────────────────────────────────
// Docs: docs.oilpriceapi.com
// Endpoint: GET /v1/prices/latest?by_code=BRENT_CRUDE_USD
// Auth: "Authorization: Token YOUR_KEY" (bukan Bearer)
export async function fetchBrentOilHyperliquid(apiKey) {
  if (!apiKey || apiKey === 'your_oilprice_api_key_here') {
    return { skipped: true, reason: 'OIL_PRICE_API_KEY tidak diset' };
  }

  try {
    // Fetch harga terkini + data 7 hari sekaligus
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
    const updatedAt = latestRes.data.data.created_at;

    // Hitung weekly change dari data 7 hari
    let weekChange = null;
    let direction = 'flat';
    const weekData = weekRes.data?.data;
    if (Array.isArray(weekData) && weekData.length >= 2) {
      const oldest = parseFloat(weekData[weekData.length - 1].price);
      const pct = ((price - oldest) / oldest) * 100;
      weekChange = parseFloat(pct.toFixed(2));
      direction = pct > 1 ? 'naik' : pct < -1 ? 'turun' : 'flat';
    }

    console.log(`  ✓ Brent Oil via OilPriceAPI | $${price} | 7d: ${weekChange}%`);
    return {
      price: parseFloat(price.toFixed(2)),
      weekChange,
      direction,
      updatedAt,
      source: 'OilPriceAPI (BRENT_CRUDE_USD)',
    };
  } catch (err) {
    console.error(`❌ OilPriceAPI error: ${err.message}`);
    let weekChange = null;
    let direction = 'flat';
    const updatedAt = '';
    return {
      price: "0",
      weekChange,
      direction,
      updatedAt,
      source: 'OilPriceAPI (BRENT_CRUDE_USD)',
    };
    // return null;
  }
}

// ── 4. DXY (DOLLAR INDEX) — via Twelve Data ───────────────────────────────────
// Symbol yang valid di Twelve Data: "DX-Y.NYB" atau "DXY"
export async function fetchDXY(keys = {}) {
  const twelveDataKey = typeof keys === 'string' ? keys : keys.twelveData;
  const alphaVantageKey = keys.alphaVantage;

  if (!twelveDataKey || twelveDataKey === 'your_twelve_data_key_here') {
    return { skipped: true, reason: 'TWELVE_DATA_API_KEY tidak diset' };
  }

  // Coba beberapa symbol yang mungkin valid — prioritizing DX-Y.NYB (standard) dan DXY
  const symbols = ['DX-Y.NYB', 'DXY', 'USDX', 'DXY:CUR'];

  for (const symbol of symbols) {
    try {
      const res = await axios.get('https://api.twelvedata.com/time_series', {
        params: {
          symbol,
          interval: '1day',
          outputsize: 2,
          apikey: twelveDataKey,
        },
        timeout: 8000,
      });

      // Twelve Data mengembalikan { status: 'error' } jika symbol salah
      if (res.data.status === 'error' || !res.data.values) continue;

      const values = res.data.values;
      if (values.length < 2) continue;

      const today = parseFloat(values[0].close);
      const yesterday = parseFloat(values[1].close);
      
      // Validasi range: DXY seharusnya 80-120 range (historis). 
      // Jika angka terlalu jauh (seperti 25.67), kemungkinan ticker salah.
      if (today < 70 || today > 130) {
        console.warn(`⚠️  DXY: Symbol "${symbol}" mengembalikan nilai anomali: ${today}. Mencoba symbol lain...`);
        continue;
      }

      const change = today - yesterday;

      return {
        value: parseFloat(today.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        direction: getDirection(change),
        symbol,
      };
    } catch {
      continue;
    }
  }

  // Fallback: ambil dari Alpha Vantage jika Twelve Data gagal semua
  return fetchDXYAlphaVantage(alphaVantageKey);
}

async function fetchDXYAlphaVantage(apiKey) {
  if (!apiKey || apiKey === 'your_alpha_vantage_key_here') {
    return { skipped: true, reason: 'Alpha Vantage API Key tidak diset untuk DXY fallback' };
  }
  try {
    const res = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'FX_DAILY',
        from_symbol: 'EUR', // EUR/USD is inversely correlated with DXY
        to_symbol: 'USD',
        apikey: apiKey,
        outputsize: 'compact',
      },
      timeout: 10000,
    });
    const series = res.data['Time Series FX (Daily)'];
    if (!series) {
      console.warn('⚠️  DXY Alpha Vantage: Tidak ada data EUR/USD yang ditemukan.');
      return null;
    }
    const dates = Object.keys(series).sort().reverse();
    if (dates.length < 2) {
      console.warn('⚠️  DXY Alpha Vantage: Data EUR/USD tidak cukup (kurang dari 2 hari).');
      return null;
    }

    const todayEurUsd = parseFloat(series[dates[0]]['4. close']);
    const yesterdayEurUsd = parseFloat(series[dates[1]]['4. close']);
    
    // DXY is inversely correlated with EUR/USD. A simple way to proxy DXY is 1 / EURUSD * 100
    // This is a simplification and not an exact DXY calculation, but provides an inverse proxy.
    const today = parseFloat((1 / todayEurUsd * 100).toFixed(2));
    const yesterday = parseFloat((1 / yesterdayEurUsd * 100).toFixed(2));
    const change = today - yesterday;

    // Validate range: DXY proxy should be within a reasonable range (e.g., 70-130)
    if (today < 70 || today > 130) {
      console.warn(`⚠️  DXY Alpha Vantage proxy (EUR/USD) mengembalikan nilai anomali: ${today}.`);
      return null;
    }

    return { value: today, change: parseFloat(change.toFixed(2)), direction: getDirection(change), source: 'AlphaVantage (EUR/USD proxy)' };
  } catch (err) {
    console.error('❌ DXY Alpha Vantage error:', err.message);
    return null;
  }
}

// ── 5. GOLD (XAUUSD) — via Twelve Data ────────────────────────────────────────
export async function fetchGold(apiKey) {
  if (!apiKey || apiKey === 'your_twelve_data_key_here') {
    return { skipped: true, reason: 'TWELVE_DATA_API_KEY tidak diset' };
  }

  // Twelve Data: XAU/USD adalah symbol yang valid untuk gold spot
  const symbols = ['XAU/USD', 'XAUUSD'];

  for (const symbol of symbols) {
    try {
      const res = await axios.get('https://api.twelvedata.com/time_series', {
        params: {
          symbol,
          interval: '1day',
          outputsize: 2,
          apikey: apiKey,
        },
        timeout: 8000,
      });

      if (res.data.status === 'error' || !res.data.values) {
        console.warn(`⚠️  Gold symbol "${symbol}" gagal: ${res.data.message || 'no values'}`);
        continue;
      }

      const values = res.data.values;
      if (values.length < 2) continue;

      const today = parseFloat(values[0].close);
      const yesterday = parseFloat(values[1].close);
      const changePercent = ((today - yesterday) / yesterday) * 100;

      return {
        price: Math.round(today),
        change24h: parseFloat(changePercent.toFixed(2)),
        direction: getDirection(changePercent),
        symbol,
      };
    } catch (err) {
      console.warn(`⚠️  Gold "${symbol}" error: ${err.message}`);
      continue;
    }
  }

  console.error('❌ Gold: semua symbol gagal di Twelve Data');
  return null;
}

// ── 6. COINMARKETCAP GLOBAL METRICS ──────────────────────────────────────────
export async function fetchCoinMarketCapGlobal(apiKey) {
  // 1. Validasi API Key
  if (!apiKey || apiKey === 'your_coinmarketcap_api_key_here') {
    return { skipped: true, reason: 'COINMARKETCAP_API_KEY tidak diset' };
  }

  try {
    const res = await axios.get('https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest', {
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    const data = res.data.data;

    if (!data) {
      console.error('❌ CoinMarketCap: Data tidak ditemukan dalam respons.');
      return null;
    }

    // DEBUG: Melihat struktur data asli
    console.log('DEBUG: CoinMarketCap API Response Data:', JSON.stringify(data, null, 2));

    // 2. Ekstraksi Data (Menggunakan Fallback 0 agar tidak terjadi NaN)
    const rawTotalMarketCap = data.quote?.USD?.total_market_cap;
    const btcDom = data.btc_dominance ?? 0;
    const ethDom = data.eth_dominance ?? 0;

    // 3. Validasi Keberadaan Data Utama
    // Perbaikan: Gunakan nama variabel yang sudah dideklarasikan di atas (rawTotalMarketCap)
    if (rawTotalMarketCap === undefined || rawTotalMarketCap === null) {
      console.error('❌ CoinMarketCap: Field total_market_cap hilang dari respons API.');
      return null;
    }

    // 4. Kalkulasi Indikator
    // TOTAL2 = Market Cap selain BTC
    const total2Raw = rawTotalMarketCap * (1 - (btcDom / 100));
    
    // TOTAL3 = Market Cap selain BTC & ETH
    const total3Raw = rawTotalMarketCap * (1 - ((btcDom + ethDom) / 100));

    // OTHERS.D = Dominasi selain BTC & ETH
    const othersDom = 100 - btcDom - ethDom;

    // 5. Return Data dengan Format yang Rapi
    return {
      totalMarketCap: parseFloat((rawTotalMarketCap / 1e12).toFixed(3)), // Dalam Triliun USD
      total2: parseFloat((total2Raw / 1e12).toFixed(3)),               // Dalam Triliun USD
      total3: parseFloat((total3Raw / 1e9).toFixed(2)),                // Dalam Miliar USD
      btcDominance: parseFloat(btcDom.toFixed(2)),
      ethDominance: parseFloat(ethDom.toFixed(2)),
      othersDominance: parseFloat(othersDom.toFixed(2)),
      source: 'CoinMarketCap',
    };

  } catch (err) {
    // Menangkap error network atau error kode di dalam blok try
    console.error('❌ CoinMarketCap Error:', err.message);
    return null;
  }
}

// ── AGGREGATE: SEMUA DAILY DATA ───────────────────────────────────────────────
export async function fetchAllDailyData(config = {}) {
  console.log('📊 Fetching daily data...');
  _hlCache = null; // reset cache tiap fetch

  const [crypto, fearGreed, funding, dxy, gold, cmc] = await Promise.allSettled([
    fetchCryptoData(),
    fetchFearGreed(),
    fetchFundingRates(),
    fetchDXY({ twelveData: config.twelveDataKey, alphaVantage: config.alphaVantageApiKey }),
    fetchGold(config.twelveDataKey),
    fetchCoinMarketCapGlobal(config.coinMarketCapApiKey),
  ]);

  // Brent Oil via OilPriceAPI
  let brentOil = null;
  try {
    brentOil = await fetchBrentOilHyperliquid(config.oilPriceApiKey);
  } catch (e) {
    console.warn('⚠️  Brent Oil fetch error:', e.message);
  }

  return {
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
    crypto: crypto.status === 'fulfilled' ? crypto.value : null,
    fearGreed: fearGreed.status === 'fulfilled' ? fearGreed.value : null,
    funding: funding.status === 'fulfilled' ? funding.value : null,
    dxy: dxy.status === 'fulfilled' ? dxy.value : null,
    gold: gold.status === 'fulfilled' ? gold.value : null,
    cmc: cmc.status === 'fulfilled' ? cmc.value : null,
    brentOil,
  };
}
