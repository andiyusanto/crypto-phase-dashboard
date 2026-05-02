// ============================================
// DAILY DATA FETCHER
// Semua data yang wajib diisi setiap hari
// ============================================

import axios from 'axios';
import { parseStringPromise } from 'xml2js';

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
    return null;
  }
}

// ── 3d. BRENT OIL — Fallback via Google News RSS ─────────────────────────────
// Parses Brent spot price from news headlines when OilPriceAPI is unavailable.
// Scoring system prefers direct spot-price headlines over analyst targets/forecasts.
export async function fetchBrentOilFromNews() {
  try {
    const url = 'https://news.google.com/rss/search?q=brent+crude+oil+price&ceid=US:en&hl=en-US&gl=US';
    const res = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    const parsed = await parseStringPromise(res.data, { explicitArray: false });
    const items = parsed?.rss?.channel?.item || [];
    const arr = Array.isArray(items) ? items : [items];

    // Match "$66.87", "66.87 per barrel", "66.87 a barrel", "66.87/bbl"
    const PRICE_RE = /\$\s*(\d{2,3}(?:\.\d{1,2})?)|(\d{2,3}(?:\.\d{1,2})?)\s*(?:per barrel|\/bbl|\s+a barrel)/gi;
    const VALID_MIN = 40;
    const VALID_MAX = 160;

    // Skip headlines that are clearly forecasts/analysis (not spot price reports)
    const SPECULATIVE_RE = /\b(could|might|may|would|should|forecast|target|equilibrium|predict|analyst|projection|if oil|new high|record|fear|vs\.)\b/i;

    // Score headlines: higher = more likely to be actual spot price
    const SPOT_SIGNAL_RE = /\b(trades?|trading|settles?|settling|opens?|closed|closes|at \$|rose to|fell to|climbs? to|drops? to|slips? to|dips? to|gains? to|surges? to|plunges? to|holds?|steady|stable|session)\b/i;

    const candidates = [];

    for (const item of arr.slice(0, 30)) {
      const title = typeof item.title === 'string' ? item.title.replace(/<[^>]*>/g, '').trim() : '';
      if (!title) continue;

      // Skip speculative/analytical headlines
      if (SPECULATIVE_RE.test(title)) continue;

      // Extract all prices from title; skip if multiple conflicting prices (e.g., "$133 vs $99")
      const prices = [];
      let m;
      PRICE_RE.lastIndex = 0;
      while ((m = PRICE_RE.exec(title)) !== null) {
        const p = parseFloat(m[1] ?? m[2]);
        if (!isNaN(p) && p >= VALID_MIN && p <= VALID_MAX) prices.push(p);
      }
      if (!prices.length) continue;
      // If two very different prices (spread > 20%), skip — likely comparison headline
      if (prices.length >= 2 && (Math.max(...prices) - Math.min(...prices)) / Math.min(...prices) > 0.2) continue;

      const price = prices[0];
      const score = SPOT_SIGNAL_RE.test(title) ? 2 : 1;
      const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

      const lower = title.toLowerCase();
      const isUp   = /\b(rise|rose|gain|up|higher|climb|surge|rally|increase[sd]?|advance[sd]?|tops?|above)\b/.test(lower);
      const isDown = /\b(fall|fell|drop|down|lower|slide|slump|decline[sd]?|decrease[sd]?|sink|sank|plunge[sd]?|dip[ps]?)\b/.test(lower);
      const direction = isUp && !isDown ? 'naik' : isDown && !isUp ? 'turun' : 'flat';

      candidates.push({ price, direction, score, title, pubDate });
    }

    if (!candidates.length) {
      console.warn('⚠️  Brent Oil: tidak ada harga valid ditemukan di Google News RSS');
      return null;
    }

    // Pick highest-scored candidate (stable sort: first occurrence wins on tie)
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    console.log(`  ✓ Brent Oil via Google News RSS | $${best.price} (${best.direction}) | "${best.title.slice(0, 70)}"`);
    return {
      price: best.price,
      direction: best.direction,
      updatedAt: best.pubDate.slice(0, 10),
      source: 'Google News RSS (Brent estimate)',
      _fromNews: true,
    };
  } catch (err) {
    console.warn(`⚠️  Brent Oil Google News fallback error: ${err.message}`);
    return null;
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
    // console.log('DEBUG: CoinMarketCap API Response Data:', JSON.stringify(data, null, 2));

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

// ── 7. NUPL + SOPR PROXY — blockchain.info price history + CoinGecko ─────────
// Both indicators share the same price history fetch (one API call, two signals).
//
// NUPL proxy  = (Market Cap − Realized Cap) / Market Cap
//   Realized Cap proxy = 5yr avg close price × circulating supply
//
// SOPR proxy  = Current Price / 30-day avg price
//   Represents whether coins moving today are in profit vs their recent cost basis.
//   True SOPR uses per-UTXO realized value; this proxy captures the same signal
//   for short-term holders (who dominate daily on-chain activity).
export async function fetchNuplProxy() {
  try {
    // Step 1: Fetch 5-year daily BTC price history from blockchain.info
    const histRes = await axios.get(
      'https://api.blockchain.info/charts/market-price',
      { params: { timespan: '5years', format: 'json', cors: true }, timeout: 15000 }
    );
    const values = histRes.data?.values ?? [];
    if (values.length < 100) throw new Error('Insufficient price history from blockchain.info');

    const prices = values.map(v => v.y).filter(p => p > 0);

    // ── NUPL: 5yr avg as realized price proxy ─────────────────────────────
    const realizedPriceProxy = prices.reduce((s, p) => s + p, 0) / prices.length;

    // ── SOPR: current price / 30-day avg price ────────────────────────────
    const last30  = prices.slice(-30);
    const avg30   = last30.reduce((s, p) => s + p, 0) / last30.length;

    // Step 2: Fetch current market cap + circulating supply from CoinGecko
    const cgRes = await axios.get(
      'https://api.coingecko.com/api/v3/coins/bitcoin',
      {
        params: { localization: false, tickers: false, market_data: true, community_data: false, developer_data: false },
        timeout: 12000,
      }
    );
    const md = cgRes.data?.market_data;
    if (!md) throw new Error('No market data from CoinGecko');

    const marketCap    = md.market_cap?.usd;
    const supply       = md.circulating_supply;
    const currentPrice = md.current_price?.usd;
    if (!marketCap || !supply || !currentPrice) throw new Error('Missing market_cap/supply/price');

    // ── Compute NUPL ──────────────────────────────────────────────────────
    const realizedCap  = realizedPriceProxy * supply;
    const nupl         = (marketCap - realizedCap) / marketCap;
    const nuplRounded  = parseFloat(nupl.toFixed(4));

    let nuplZone, nuplSignal;
    if (nupl < 0)         { nuplZone = 'Capitulation';   nuplSignal = 'BTC di bawah realized price — fase 0, akumulasi ekstrem'; }
    else if (nupl < 0.25) { nuplZone = 'Hope/Fear';      nuplSignal = 'holder majority break-even — fase 1, akumulasi diam-diam'; }
    else if (nupl < 0.50) { nuplZone = 'Optimism';       nuplSignal = 'majority holder profit moderat — fase 2, expansion'; }
    else if (nupl < 0.75) { nuplZone = 'Belief/Denial';  nuplSignal = 'holder profit tinggi, euphoria mulai — fase 3, waspadai distribusi'; }
    else                  { nuplZone = 'Euphoria';        nuplSignal = 'extreme profit — fase 4, zona distribusi / top signal'; }

    // ── Compute SOPR proxy ────────────────────────────────────────────────
    const sopr = parseFloat((currentPrice / avg30).toFixed(4));

    let soprSignal;
    if (sopr > 1.10)       soprSignal = 'profit tinggi — STH mulai distribusi, waspada reversal';
    else if (sopr > 1.02)  soprSignal = 'profit moderat — bullish, spending sehat';
    else if (sopr >= 0.98) soprSignal = 'break-even — netral, pasar mencari arah';
    else if (sopr >= 0.90) soprSignal = 'rugi ringan — STH jual rugi, potensi bounce';
    else                   soprSignal = 'capitulation — STH jual rugi dalam, potensi bottom';

    return {
      nupl:              nuplRounded,
      nuplZone,
      nuplSignal,
      sopr,
      soprAvg30dPrice:   parseFloat(avg30.toFixed(0)),
      soprSignal,
      realizedPriceProxy: parseFloat(realizedPriceProxy.toFixed(0)),
      currentPrice:       parseFloat(currentPrice.toFixed(0)),
      marketCapBillion:   parseFloat((marketCap   / 1e9).toFixed(2)),
      realizedCapBillion: parseFloat((realizedCap / 1e9).toFixed(2)),
      priceHistoryDays:   prices.length,
      note: '5yr avg price → NUPL proxy | 30d avg price → SOPR proxy (blockchain.info + CoinGecko)',
      source: 'blockchain.info + CoinGecko',
    };
  } catch (err) {
    console.warn('⚠️  NUPL/SOPR proxy gagal:', err.message);
    return null;
  }
}

// ── 8. DERIVATIVES BUNDLE — satu fetch CoinGecko untuk OI + Basis + Skew proxy ─
// Sebelumnya ada 3 fungsi terpisah yang masing-masing memanggil /derivatives,
// menyebabkan 3 request paralel ke endpoint yang sama → trigger CoinGecko 429.
// Sekarang digabung: satu fetch, tiga hasil.
export async function fetchBtcDerivativesBundle(btcPriceHint = null) {
  // ── Fetch CoinGecko /derivatives (sekali saja) ────────────────────────────
  let tickers = [];
  try {
    const res = await axios.get(
      'https://api.coingecko.com/api/v3/derivatives',
      { timeout: 18000 }
    );
    tickers = res.data ?? [];
  } catch (err) {
    console.warn('⚠️  CoinGecko /derivatives gagal:', err.message);
  }

  const TOP_OI_EXCHANGES = [
    'Binance (Futures)', 'Bybit (Futures)', 'OKX (Futures)',
    'Bitget Futures', 'KuCoin Futures', 'Gate (Futures)', 'HTX Futures', 'Hyperliquid (Futures)',
  ];
  const TOP_BASIS_EXCHANGES = [
    'Binance (Futures)', 'Bybit (Futures)', 'OKX (Futures)',
    'Bitget Futures', 'Gate (Futures)', 'HTX Futures',
  ];

  const btcAll   = tickers.filter(t => t.index_id === 'BTC');
  const btcPerps = btcAll.filter(t => t.contract_type === 'perpetual');

  // ── OI ────────────────────────────────────────────────────────────────────
  let btcOI = null;
  try {
    const oiTickers = btcAll.filter(t =>
      t.open_interest != null && TOP_OI_EXCHANGES.includes(t.market)
    );
    if (oiTickers.length) {
      const totalOiUsd  = oiTickers.reduce((s, t) => s + (t.open_interest ?? 0), 0);
      const totalBillion = parseFloat((totalOiUsd / 1e9).toFixed(2));
      const changes      = oiTickers.map(t => t.price_percentage_change_24h ?? 0).filter(c => c !== 0);
      const avgChange    = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
      const trend        = avgChange > 1 ? 'ekspansi' : avgChange < -1 ? 'kontraksi' : 'flat';
      btcOI = { totalBillion, exchangeCount: oiTickers.length, trend, source: 'CoinGecko' };
    }
  } catch (_) {}

  // Fallback OI: Hyperliquid (sudah digunakan untuk funding rate)
  if (!btcOI) {
    try {
      const res = await axios.post(
        'https://api.hyperliquid.xyz/info',
        { type: 'metaAndAssetCtxs' },
        { timeout: 8000 }
      );
      const [meta, ctxs] = res.data ?? [[], []];
      const idx = meta.universe?.findIndex(a => a.name === 'BTC') ?? -1;
      if (idx >= 0) {
        const ctx       = ctxs[idx];
        const oiNotional = parseFloat(ctx.openInterest ?? 0);
        const markPx     = parseFloat(ctx.markPx ?? 0);
        btcOI = {
          totalBillion: parseFloat(((oiNotional * markPx) / 1e9).toFixed(2)),
          exchangeCount: 1, trend: '___',
          source: 'Hyperliquid (fallback)',
        };
      }
    } catch (_) {
      console.warn('⚠️  BTC OI semua sumber gagal');
    }
  }

  // ── Basis (perp premium proxy) ────────────────────────────────────────────
  let btcBasis = null;
  try {
    const basisTickers = btcPerps.filter(t =>
      t.basis != null && TOP_BASIS_EXCHANGES.includes(t.market)
    );
    if (basisTickers.length) {
      const avgBasis      = basisTickers.reduce((s, t) => s + t.basis, 0) / basisTickers.length;
      const basisPct      = parseFloat(avgBasis.toFixed(4));
      const annualizedPct = parseFloat((basisPct * 365).toFixed(2));
      let signal;
      if (annualizedPct > 15)     signal = 'contango tinggi — bullish sentiment, waspadai overleveraged';
      else if (annualizedPct > 5) signal = 'contango normal — bullish moderat';
      else if (annualizedPct >= 0)signal = 'flat / netral';
      else                        signal = 'backwardation — bearish / capitulation signal';
      btcBasis = { basisPct, annualizedPct, exchangeCount: basisTickers.length, signal, source: 'CoinGecko' };
    }
  } catch (_) {}
  if (!btcBasis) console.warn('⚠️  BTC Basis Rate gagal: data tidak cukup dari CoinGecko');

  // ── Skew proxy (via funding rate + Deribit OI) ────────────────────────────
  let optionsSkew = null;
  try {
    // Funding-rate-based skew proxy (dari tickers yang sudah difetch)
    const fundingTickers = btcPerps.filter(t => t.funding_rate != null);
    const avgFunding     = fundingTickers.length
      ? fundingTickers.reduce((s, t) => s + t.funding_rate, 0) / fundingTickers.length
      : null;

    let skewProxy = null;
    let signal    = 'data tidak tersedia';
    if (avgFunding !== null) {
      skewProxy = parseFloat((-avgFunding * 1000).toFixed(2));
      if (skewProxy > 10)       signal = 'fear tinggi — funding negatif kuat, put premium implied (bearish/fase 4)';
      else if (skewProxy > 3)   signal = 'netral-bearish — sedikit downside concern';
      else if (skewProxy >= -3) signal = 'netral — pasar seimbang';
      else                      signal = 'call premium — greed / fase 3 signal';
    }

    // Deribit OI dari CoinGecko exchange endpoint (panggil terpisah, bukan /derivatives)
    let deribitOiBtc = null;
    let deribitOiUsdBillion = null;
    try {
      const deribitRes = await axios.get(
        'https://api.coingecko.com/api/v3/derivatives/exchanges/deribit',
        { timeout: 10000 }
      );
      deribitOiBtc = parseFloat((deribitRes.data?.open_interest_btc ?? 0).toFixed(0));
      const price  = btcPriceHint ?? 0;
      deribitOiUsdBillion = price ? parseFloat(((deribitOiBtc * price) / 1e9).toFixed(2)) : null;
    } catch (_) {}

    optionsSkew = {
      skewProxy,
      avgFunding8h: avgFunding !== null ? parseFloat(avgFunding.toFixed(6)) : null,
      deribitOiBtc,
      deribitOiUsdBillion,
      signal,
      note: 'Proxy via perp funding rate — Deribit direct API tidak accessible dari server ini',
      source: 'CoinGecko',
    };
  } catch (err) {
    console.warn('⚠️  Options skew proxy gagal:', err.message);
  }

  return { btcOI, btcBasis, optionsSkew };
}

// ── AGGREGATE: SEMUA DAILY DATA ───────────────────────────────────────────────
export async function fetchAllDailyData(config = {}) {
  console.log('📊 Fetching daily data...');
  _hlCache = null; // reset cache tiap fetch

  const [crypto, fearGreed, funding, dxy, gold, cmc, nuplProxy] = await Promise.allSettled([
    fetchCryptoData(),
    fetchFearGreed(),
    fetchFundingRates(),
    fetchDXY({ twelveData: config.twelveDataKey, alphaVantage: config.alphaVantageApiKey }),
    fetchGold(config.twelveDataKey),
    fetchCoinMarketCapGlobal(config.coinMarketCapApiKey),
    fetchNuplProxy(),
  ]);

  // Derivatives bundle: satu fetch /derivatives → OI + Basis + Skew (hindari 3x CoinGecko 429)
  const cryptoVal    = crypto.status === 'fulfilled' ? crypto.value : null;
  const btcPriceHint = cryptoVal?.btc?.price ?? null;
  const derivBundle  = await fetchBtcDerivativesBundle(btcPriceHint).catch(() => ({}));

  // Brent Oil: OilPriceAPI → Google News RSS → null (SQLite cache handled in index.js)
  let brentOil = null;
  try {
    brentOil = await fetchBrentOilHyperliquid(config.oilPriceApiKey);
    if (!brentOil || brentOil.skipped) {
      console.log('  ⚠️  OilPriceAPI tidak tersedia — mencoba Google News RSS...');
      brentOil = await fetchBrentOilFromNews();
    }
  } catch (e) {
    console.warn('⚠️  Brent Oil OilPriceAPI error:', e.message);
    brentOil = await fetchBrentOilFromNews().catch(() => null);
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
    cmc:        cmc.status        === 'fulfilled' ? cmc.value        : null,
    nuplProxy:  nuplProxy.status  === 'fulfilled' ? nuplProxy.value  : null,
    brentOil,
    btcOI:       derivBundle.btcOI       ?? null,
    btcBasis:    derivBundle.btcBasis     ?? null,
    optionsSkew: derivBundle.optionsSkew ?? null,
  };
}
