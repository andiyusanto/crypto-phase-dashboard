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
// Prices: Binance primary (real-time, no rate limit) → CoinGecko fallback
// Dominance / total market cap / stablecoin supply: CoinGecko /global only
//   (Binance is an exchange; it doesn't compute market-wide aggregates)
export async function fetchCryptoData() {
  // Run CoinGecko global + stablecoin mcap in parallel with Binance prices
  const [cgGlobalRes, cgStableRes, bnTickerRes] = await Promise.allSettled([
    axios.get('https://api.coingecko.com/api/v3/global', { timeout: 12000 }),
    axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'tether,usd-coin,bitcoin', vs_currencies: 'usd', include_market_cap: true, include_24hr_vol: true },
      timeout: 12000,
    }),
    axios.get('https://api.binance.com/api/v3/ticker/24hr', {
      params: { symbols: JSON.stringify(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AVAXUSDT', 'XRPUSDT']) },
      timeout: 8000,
    }),
  ]);

  // ── CoinGecko global (dominance, total mcap) ──────────────────────────────
  if (cgGlobalRes.status !== 'fulfilled') {
    console.error('❌ CoinGecko /global gagal:', cgGlobalRes.reason?.message);
    return null;
  }
  const global       = cgGlobalRes.value.data.data;
  const btcDominance = global.market_cap_percentage.btc;

  // ── Stablecoin market caps + BTC aggregate volume ─────────────────────────
  let stablecoinSupply = { usdt: null, usdc: null, total: null };
  let btcAggregateVol24hBillion = null;
  if (cgStableRes.status === 'fulfilled') {
    const sp = cgStableRes.value.data;
    const usdt = parseFloat((sp.tether?.['usd_market_cap']    / 1e9).toFixed(2));
    const usdc = parseFloat((sp['usd-coin']?.['usd_market_cap'] / 1e9).toFixed(2));
    stablecoinSupply = { usdt, usdc, total: parseFloat((usdt + usdc).toFixed(2)) };
    if (sp.bitcoin?.usd_24h_vol != null) {
      btcAggregateVol24hBillion = parseFloat((sp.bitcoin.usd_24h_vol / 1e9).toFixed(2));
    }
  } else {
    console.warn('⚠️  Stablecoin mcap gagal:', cgStableRes.reason?.message);
  }

  // ── Prices: Binance primary, CoinGecko fallback ───────────────────────────
  let btc, eth, sol, avax, xrp;

  if (bnTickerRes.status === 'fulfilled') {
    const tickers = bnTickerRes.value.data;
    const find    = (sym) => tickers.find(t => t.symbol === sym);
    const bn      = { btc: find('BTCUSDT'), eth: find('ETHUSDT'), sol: find('SOLUSDT'), avax: find('AVAXUSDT'), xrp: find('XRPUSDT') };

    // Prefer CoinGecko aggregate volume (global) over Binance spot-only quoteVolume
    const binanceSpotVolBn = parseFloat((parseFloat(bn.btc.quoteVolume) / 1e9).toFixed(2));
    btc  = { price: Math.round(parseFloat(bn.btc.lastPrice)), change24h: parseFloat(parseFloat(bn.btc.priceChangePercent).toFixed(2)), volume24hBillion: btcAggregateVol24hBillion ?? binanceSpotVolBn };
    eth  = { price: Math.round(parseFloat(bn.eth.lastPrice)), change24h: parseFloat(parseFloat(bn.eth.priceChangePercent).toFixed(2)) };
    sol  = { price: parseFloat(parseFloat(bn.sol.lastPrice).toFixed(2)), change24h: parseFloat(parseFloat(bn.sol.priceChangePercent).toFixed(2)) };
    avax = bn.avax ? { price: parseFloat(parseFloat(bn.avax.lastPrice).toFixed(2)), change24h: parseFloat(parseFloat(bn.avax.priceChangePercent).toFixed(2)) } : null;
    xrp  = bn.xrp  ? { price: parseFloat(parseFloat(bn.xrp.lastPrice).toFixed(4)),  change24h: parseFloat(parseFloat(bn.xrp.priceChangePercent).toFixed(2))  } : null;
    if (!bn.avax) console.warn('⚠️  AVAXUSDT tidak ditemukan di Binance response');
    if (!bn.xrp)  console.warn('⚠️  XRPUSDT tidak ditemukan di Binance response');
    console.log('  ✓ Harga via Binance');
  } else {
    console.warn('⚠️  Binance ticker gagal, fallback ke CoinGecko:', bnTickerRes.reason?.message);
    try {
      const fb = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: { ids: 'bitcoin,ethereum,solana,avalanche-2,ripple', vs_currencies: 'usd', include_24hr_change: true, include_24hr_vol: true },
        timeout: 12000,
      });
      const p = fb.data;
      btc  = { price: Math.round(p.bitcoin.usd), change24h: parseFloat(p.bitcoin.usd_24h_change.toFixed(2)), volume24hBillion: btcAggregateVol24hBillion ?? parseFloat((p.bitcoin.usd_24h_vol / 1e9).toFixed(2)) };
      eth  = { price: Math.round(p.ethereum.usd), change24h: parseFloat(p.ethereum.usd_24h_change.toFixed(2)) };
      sol  = { price: parseFloat(p.solana.usd.toFixed(2)), change24h: parseFloat(p.solana.usd_24h_change.toFixed(2)) };
      avax = { price: parseFloat(p['avalanche-2'].usd.toFixed(2)), change24h: parseFloat(p['avalanche-2'].usd_24h_change.toFixed(2)) };
      xrp  = { price: parseFloat(p.ripple.usd.toFixed(4)), change24h: parseFloat(p.ripple.usd_24h_change.toFixed(2)) };
      console.log('  ✓ Harga via CoinGecko (fallback)');
    } catch (err) {
      console.error('❌ CoinGecko price fallback juga gagal:', err.message);
      return null;
    }
  }

  return {
    btc,
    eth,
    sol,
    avax,
    xrp,
    btcDominance:          parseFloat(btcDominance.toFixed(2)),
    totalMarketCapBillion: parseFloat((global.total_market_cap?.usd / 1e9).toFixed(2)),
    ethBtcRatio:           parseFloat((eth.price / btc.price).toFixed(6)),
    solBtcRatio:           parseFloat((sol.price / btc.price).toFixed(6)),
    avaxBtcRatio:          avax ? parseFloat((avax.price / btc.price).toFixed(8)) : null,
    xrpBtcRatio:           xrp  ? parseFloat((xrp.price  / btc.price).toFixed(8)) : null,
    stablecoinSupply,
  };
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
// Funding rate standard industri: % per 8 jam.
// Primary: Binance /fapi/v1/premiumIndex — lastFundingRate adalah 8h rate sebagai desimal.
// Fallback 1: Hyperliquid — per-1h rate × 8 × 100.
// Fallback 2: CoinGecko /derivatives — median dari semua exchange.
export async function fetchFundingRates() {
  // ── Primary: Binance ──────────────────────────────────────────────────────
  try {
    const [btcRes, ethRes] = await Promise.all([
      axios.get('https://fapi.binance.com/fapi/v1/premiumIndex', { params: { symbol: 'BTCUSDT' }, timeout: 8000 }),
      axios.get('https://fapi.binance.com/fapi/v1/premiumIndex', { params: { symbol: 'ETHUSDT' }, timeout: 8000 }),
    ]);
    const btcRate8h = parseFloat(btcRes.data.lastFundingRate) * 100;
    const ethRate8h = parseFloat(ethRes.data.lastFundingRate) * 100;
    console.log(`  ✓ Funding rate via Binance | BTC: ${btcRate8h.toFixed(4)}% | ETH: ${ethRate8h.toFixed(4)}%`);
    return {
      btc: parseFloat(btcRate8h.toFixed(4)),
      eth: parseFloat(ethRate8h.toFixed(4)),
      source: 'Binance Futures',
      note: '8h funding rate dari Binance perp (lastFundingRate)',
      btcSentiment: btcRate8h > 0.05 ? 'overheated_long' : btcRate8h < -0.01 ? 'short_pressure' : 'neutral',
      ethSentiment: ethRate8h > 0.05 ? 'overheated_long' : ethRate8h < -0.01 ? 'short_pressure' : 'neutral',
    };
  } catch (err) {
    console.warn(`⚠️  Funding rate Binance gagal: ${err.message}`);
  }

  // ── Fallback 1: Hyperliquid DEX ───────────────────────────────────────────
  try {
    const { universe, ctxs } = await getHyperliquidMeta();
    const find = (name) => {
      const idx = universe.findIndex(a => a.name === name);
      if (idx === -1) throw new Error(`${name} tidak ditemukan di Hyperliquid universe`);
      return ctxs[idx];
    };
    const btcRate1h = parseFloat(find('BTC').funding);
    const ethRate1h = parseFloat(find('ETH').funding);
    const btcRate8h = btcRate1h * 8 * 100;
    const ethRate8h = ethRate1h * 8 * 100;
    console.log(`  ✓ Funding rate via Hyperliquid (fallback) | BTC: ${btcRate8h.toFixed(4)}% | ETH: ${ethRate8h.toFixed(4)}%`);
    return {
      btc: parseFloat(btcRate8h.toFixed(4)),
      eth: parseFloat(ethRate8h.toFixed(4)),
      source: 'Hyperliquid (fallback)',
      note: '8h equivalent dari 1h rate Hyperliquid',
      btcSentiment: btcRate8h > 0.05 ? 'overheated_long' : btcRate8h < -0.01 ? 'short_pressure' : 'neutral',
      ethSentiment: ethRate8h > 0.05 ? 'overheated_long' : ethRate8h < -0.01 ? 'short_pressure' : 'neutral',
    };
  } catch (err) {
    console.warn(`⚠️  Funding rate Hyperliquid gagal: ${err.message}`);
  }

  // ── Fallback 2: CoinGecko /derivatives ────────────────────────────────────
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/derivatives', { timeout: 12000 });
    const tickers = res.data;
    const validPerp = (base) => tickers.filter(t =>
      t.base === base && t.contract_type === 'perpetual' &&
      t.funding_rate !== null && !isNaN(parseFloat(t.funding_rate))
    );
    const btcPerps = validPerp('BTC');
    const ethPerps = validPerp('ETH');
    if (!btcPerps.length || !ethPerps.length) throw new Error('Data tidak cukup dari CoinGecko');
    const median = (perps) => {
      const rates = perps.map(t => parseFloat(t.funding_rate) * 100).sort((a, b) => a - b);
      const mid = Math.floor(rates.length / 2);
      return rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
    };
    const btcRate = median(btcPerps);
    const ethRate = median(ethPerps);
    console.log(`  ✓ Funding rate via CoinGecko (fallback) | BTC median dari ${btcPerps.length} exchanges`);
    return {
      btc: parseFloat(btcRate.toFixed(4)),
      eth: parseFloat(ethRate.toFixed(4)),
      source: `CoinGecko median (${btcPerps.length} exchanges, fallback)`,
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
    // 402 = paid tier required (free tier exhausted/expired) — common, downgrade ke warn.
    // 401/403 = auth fail. Other errors = real problem.
    if (err.response?.status === 402) {
      console.warn(`  ⚠️  OilPriceAPI: paid tier required (HTTP 402) — pakai Google News RSS fallback`);
    } else {
      console.error(`❌ OilPriceAPI error: ${err.message}`);
    }
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

// ── 4. DXY (DOLLAR INDEX) — Yahoo Finance primary, Twelve Data fallback ───────
// Yahoo's DX-Y.NYB is the real ICE Dollar Index, free, and accurate.
// Twelve Data's DX-Y.NYB has been observed returning stale/wrong values (~84 when real DXY ~97).
async function fetchDXYYahoo() {
  try {
    const res = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB', {
      params: { interval: '1d', range: '5d' },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    });
    const result = res.data?.chart?.result?.[0];
    if (!result) throw new Error('No data from Yahoo Finance DX-Y.NYB');

    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const valid  = closes.filter(c => c != null);
    if (valid.length < 2) throw new Error('Not enough DXY closes from Yahoo');

    const today     = valid[valid.length - 1];
    const yesterday = valid[valid.length - 2];

    // Sanity: post-2008 DXY historically 80–115. Out-of-bound = fall through to Twelve Data.
    if (today < 80 || today > 115) {
      throw new Error(`Yahoo DX-Y.NYB returned anomaly ${today.toFixed(2)} (expected 80–115)`);
    }

    const change = today - yesterday;
    console.log(`  ✓ DXY via Yahoo Finance | ${today.toFixed(2)} | Δ${change >= 0 ? '+' : ''}${change.toFixed(2)}`);
    return {
      value: parseFloat(today.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      direction: getDirection(change),
      symbol: 'DX-Y.NYB',
      source: 'Yahoo Finance',
    };
  } catch (err) {
    console.warn(`⚠️  DXY Yahoo Finance gagal: ${err.message} — coba Twelve Data fallback`);
    return null;
  }
}

export async function fetchDXY(keys = {}) {
  const twelveDataKey = typeof keys === 'string' ? keys : keys.twelveData;
  const alphaVantageKey = keys.alphaVantage;

  // Try Yahoo Finance first (free, no key needed, accurate)
  const yahoo = await fetchDXYYahoo();
  if (yahoo) return yahoo;

  if (!twelveDataKey || twelveDataKey === 'your_twelve_data_key_here') {
    return fetchDXYAlphaVantage(alphaVantageKey);
  }

  // Twelve Data fallback (note: DX-Y.NYB on Twelve Data has been observed returning wrong values)
  const symbols = ['DXY', 'DX-Y.NYB'];
  for (const symbol of symbols) {
    try {
      const res = await axios.get('https://api.twelvedata.com/time_series', {
        params: { symbol, interval: '1day', outputsize: 2, apikey: twelveDataKey },
        timeout: 8000,
      });
      if (res.data.status === 'error' || !res.data.values) continue;
      const values = res.data.values;
      if (values.length < 2) continue;
      const today = parseFloat(values[0].close);
      const yesterday = parseFloat(values[1].close);
      if (today < 80 || today > 115) {
        console.warn(`⚠️  DXY: Twelve Data symbol "${symbol}" anomali: ${today} (expected 80–115)`);
        continue;
      }
      const change = today - yesterday;
      return {
        value: parseFloat(today.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        direction: getDirection(change),
        symbol,
        source: 'Twelve Data',
      };
    } catch {
      continue;
    }
  }

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

    // ── NUPL: 5yr median as realized price proxy ──────────────────────────
    // Median is more resistant to bull-run price spikes than mean.
    // A 5yr mean is inflated by 2021 ($69k) and 2024 ($104k) peaks,
    // causing realized price to read too high → NUPL systematically low.
    const sorted5yr = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted5yr.length / 2);
    const realizedPriceProxy = sorted5yr.length % 2
      ? sorted5yr[mid]
      : (sorted5yr[mid - 1] + sorted5yr[mid]) / 2;

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

    // ── ATH context ───────────────────────────────────────────────────────
    const ath           = md.ath?.usd ?? null;
    const athChangePct  = ath ? parseFloat(((currentPrice - ath) / ath * 100).toFixed(2)) : null;

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

    // SOPR proxy = currentPrice / 30d_avg. This is a price-ratio, not true per-UTXO SOPR.
    // Thresholds calibrated for this ratio's actual behavior:
    //   Bull trend normal range: 1.03–1.20 (price consistently above 30d avg)
    //   Neutral/ranging: 0.95–1.05
    //   Correction: 0.85–0.95 (price pulled back but still near 30d avg)
    //   Sharp selloff: < 0.85 (price well below 30d avg — potential bottom zone)
    //   Overextended: > 1.20 (price far above 30d avg — pullback likely)
    let soprSignal;
    if (sopr > 1.20)       soprSignal = 'overextended — harga jauh di atas 30d avg, risiko pullback tinggi';
    else if (sopr > 1.05)  soprSignal = 'bullish — harga di atas 30d avg, trend sehat';
    else if (sopr >= 0.95) soprSignal = 'netral — harga dekat 30d avg, pasar konsolidasi';
    else if (sopr >= 0.85) soprSignal = 'koreksi — harga di bawah 30d avg, monitor support';
    else                   soprSignal = 'selloff tajam — harga jauh di bawah 30d avg, potensi zona akumulasi';

    // ── Pi Cycle Top indicator ────────────────────────────────────────────────
    // 111d MA crossing ABOVE 2×350d MA = historically precise BTC cycle top signal.
    // prices[] is chronological (oldest→newest), so slice(-N) = last N days.
    let piCycle = null;
    if (prices.length >= 350) {
      const ma111   = prices.slice(-111).reduce((s, p) => s + p, 0) / 111;
      const ma350   = prices.slice(-350).reduce((s, p) => s + p, 0) / 350;
      const ma350x2 = ma350 * 2;
      const gapPct  = parseFloat(((ma111 - ma350x2) / ma350x2 * 100).toFixed(2));

      let piSignal;
      if (gapPct > 0)        piSignal = '🚨 CROSSING — historical top signal! MA111 melewati 2×MA350';
      else if (gapPct > -10) piSignal = '⚠️ mendekati top — gap < 10%, waspadai';
      else if (gapPct > -30) piSignal = 'moderat — mid-cycle, belum bahaya';
      else                   piSignal = 'aman — jauh dari top, fase early/accumulation';

      piCycle = {
        ma111:    parseFloat(ma111.toFixed(0)),
        ma350x2:  parseFloat(ma350x2.toFixed(0)),
        gapPct,
        signal:   piSignal,
        note:     'Crossing (gapPct > 0) = historical BTC cycle top. Saat ini: ' + gapPct + '%',
      };
    }

    // ── 200d MA ───────────────────────────────────────────────────────────────
    let ma200 = null;
    let ma200GapPct = null;
    let ma200Signal = null;
    if (prices.length >= 200) {
      const ma200raw  = prices.slice(-200).reduce((s, p) => s + p, 0) / 200;
      ma200           = parseFloat(ma200raw.toFixed(0));
      ma200GapPct     = parseFloat(((currentPrice - ma200raw) / ma200raw * 100).toFixed(2));
      if (ma200GapPct > 50)       ma200Signal = 'sangat overextended di atas 200d MA — fase 3/4, waspadai';
      else if (ma200GapPct > 20)  ma200Signal = 'bullish kuat — harga jauh di atas 200d MA';
      else if (ma200GapPct > 0)   ma200Signal = 'bullish — harga di atas 200d MA';
      else if (ma200GapPct > -10) ma200Signal = 'danger zone — harga mendekati/di bawah 200d MA';
      else                        ma200Signal = 'bearish — harga jauh di bawah 200d MA, fase 0/1';
    }

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
      piCycle,
      ath,
      athChangePct,
      ma200,
      ma200GapPct,
      ma200Signal,
      note: '5yr median price → NUPL proxy | 30d avg price → SOPR proxy | Pi Cycle + 200d MA (blockchain.info + CoinGecko)',
      source: 'blockchain.info + CoinGecko',
    };
  } catch (err) {
    console.warn('⚠️  NUPL/SOPR proxy gagal:', err.message);
    return null;
  }
}

// ── 8. BLOCKCHAIN.INFO BUNDLE — active addresses + miner revenue ──────────────
// Sequential calls (400ms apart) to avoid rate-limiting the same server.
// Unit: active addresses = raw count | miner revenue = USD per day.
export async function fetchBlockchainInfoBundle() {
  const headers = { 'User-Agent': 'Mozilla/5.0' };
  const getValues = async (chart, timespan = '14days') => {
    const res = await axios.get(`https://api.blockchain.info/charts/${chart}`, {
      params: { timespan, format: 'json', cors: 'true' }, headers, timeout: 20000,
    });
    return (res.data?.values ?? []).sort((a, b) => b.x - a.x);
  };

  const summarise = (sorted) => {
    const latest7 = sorted.slice(0, 7).map(v => v.y);
    const prev7   = sorted.slice(7, 14).map(v => v.y);
    if (!latest7.length) return null;
    const avg7d   = latest7.reduce((s, v) => s + v, 0) / latest7.length;
    const avgPrev = prev7.length >= 4 ? prev7.reduce((s, v) => s + v, 0) / prev7.length : null;
    let weekChange = null, trend = '___';
    if (avgPrev) {
      weekChange = parseFloat(((avg7d - avgPrev) / avgPrev * 100).toFixed(2));
      trend = weekChange > 2 ? 'naik' : weekChange < -2 ? 'turun' : 'flat';
    }
    return { avg7d, weekChange, trend };
  };

  // ── Active Addresses ──────────────────────────────────────────────────────
  let activeAddresses = null;
  try {
    const vals = await getValues('n-unique-addresses');
    const s = summarise(vals);
    if (s) {
      let signal;
      if (s.trend === 'naik' && s.avg7d > 800000) signal = 'adoption meningkat — bullish long-term';
      else if (s.trend === 'naik')                signal = 'activity naik — network health membaik';
      else if (s.trend === 'turun' && s.weekChange < -10) signal = 'activity drop tajam — potensi capitulation';
      else if (s.trend === 'turun')               signal = 'activity sedikit turun — monitor';
      else                                        signal = 'activity stabil';
      activeAddresses = { avg7d: Math.round(s.avg7d), weekChange: s.weekChange, trend: s.trend, signal, source: 'blockchain.info' };
    }
  } catch (err) {
    console.warn('⚠️  Active Addresses gagal:', err.message);
  }

  await sleep(400);

  // ── Miner Revenue ─────────────────────────────────────────────────────────
  let minerRevenue = null;
  try {
    const vals = await getValues('miners-revenue');
    const s = summarise(vals);
    if (s) {
      const revMillion = parseFloat((s.avg7d / 1e6).toFixed(2));
      let signal;
      if (s.trend === 'turun' && s.weekChange < -20) signal = 'revenue drop tajam — miner capitulation risk tinggi';
      else if (s.trend === 'turun')                  signal = 'revenue turun — monitor miner stress';
      else if (s.trend === 'naik')                   signal = 'revenue naik — miner confidence tinggi';
      else                                           signal = 'revenue stabil';
      minerRevenue = { revMillion, weekChange: s.weekChange, trend: s.trend, signal, source: 'blockchain.info' };
    }
  } catch (err) {
    console.warn('⚠️  Miner Revenue gagal:', err.message);
  }

  await sleep(400);

  // ── Estimated TX Volume (BTC) — NVT raw material ──────────────────────────
  // NVT = Market Cap USD / (txVolBTC × btcPrice), computed in formatter
  // blockchain.info unit: BTC per day (estimated output volume excluding change)
  let txVolume = null;
  try {
    const vals = await getValues('estimated-transaction-volume', '14days');
    const sorted = vals; // already sorted desc by getValues
    if (sorted.length >= 1) {
      const avg7d   = sorted.slice(0, 7).reduce((s, v) => s + v.y, 0) / Math.min(7, sorted.length);
      const avg7dPrev = sorted.slice(7, 14).length >= 3
        ? sorted.slice(7, 14).reduce((s, v) => s + v.y, 0) / sorted.slice(7, 14).length
        : null;
      const weekChange = avg7dPrev != null
        ? parseFloat(((avg7d - avg7dPrev) / avg7dPrev * 100).toFixed(2)) : null;
      txVolume = {
        avg7dBtc:   parseFloat(avg7d.toFixed(0)),
        weekChange,
        source: 'blockchain.info',
      };
    }
  } catch (err) {
    console.warn('⚠️  TX Volume gagal:', err.message);
  }

  await sleep(400);

  // ── Output Volume (BTC) — HODL Wave proxy ─────────────────────────────────
  // Low output volume relative to 30d avg = fewer coins moving = HODLers active
  let outputVolume = null;
  try {
    const vals = await getValues('output-volume', '14days');
    const sorted = vals;
    if (sorted.length >= 1) {
      const avg7d   = sorted.slice(0, 7).reduce((s, v) => s + v.y, 0) / Math.min(7, sorted.length);
      const avg7dPrev = sorted.slice(7, 14).length >= 3
        ? sorted.slice(7, 14).reduce((s, v) => s + v.y, 0) / sorted.slice(7, 14).length
        : null;
      const weekChange = avg7dPrev != null
        ? parseFloat(((avg7d - avg7dPrev) / avg7dPrev * 100).toFixed(2)) : null;
      // Turun = lebih sedikit koin bergerak = HODL behavior meningkat
      const hodlSignal = weekChange == null ? '—'
        : weekChange < -10 ? '✅ coin velocity turun — HODLing meningkat'
        : weekChange < -3  ? '✅ velocity slight down — akumulasi'
        : weekChange > 10  ? '🔴 coin velocity naik tinggi — distribusi'
        :                    '⚠️ velocity stabil';
      outputVolume = {
        avg7dBtc:   parseFloat(avg7d.toFixed(0)),
        weekChange,
        hodlSignal,
        source: 'blockchain.info',
      };
    }
  } catch (err) {
    console.warn('⚠️  Output Volume gagal:', err.message);
  }

  return { activeAddresses, minerRevenue, txVolume, outputVolume };
}

// ── 10. LONG/SHORT RATIO ─────────────────────────────────────────────────────
// Primary: Binance globalLongShortAccountRatio — most representative (~40-50% of BTC futures OI).
//   longAccount + shortAccount = 1 (percentages); ratio = longAccount / shortAccount.
// Fallback: Gate.io contract_stats — smaller exchange but same directional signal.
export async function fetchLongShortRatio() {
  // ── Primary: Binance ──────────────────────────────────────────────────────
  try {
    const res = await axios.get(
      'https://fapi.binance.com/futures/data/globalLongShortAccountRatio',
      { params: { symbol: 'BTCUSDT', period: '1h', limit: 1 }, timeout: 8000 }
    );
    const latest = res.data?.[0];
    if (latest) {
      const ratio    = parseFloat(parseFloat(latest.longShortRatio).toFixed(3));
      const longPct  = parseFloat((parseFloat(latest.longAccount)  * 100).toFixed(2));
      const shortPct = parseFloat((parseFloat(latest.shortAccount) * 100).toFixed(2));

      let signal;
      if (ratio > 1.8)      signal = 'sangat bullish — waspadai long squeeze';
      else if (ratio > 1.2) signal = 'bullish — longs dominan';
      else if (ratio > 0.9) signal = 'netral — seimbang';
      else if (ratio > 0.6) signal = 'bearish — shorts dominan';
      else                  signal = 'sangat bearish — waspadai short squeeze';

      return { ratio, longPct, shortPct, takerRatio: null, longUsers: null, shortUsers: null, signal, source: 'Binance Futures' };
    }
  } catch (err) {
    console.warn('⚠️  L/S Binance gagal, mencoba Gate.io:', err.message);
  }

  // ── Fallback: Gate.io ─────────────────────────────────────────────────────
  try {
    const res = await axios.get(
      'https://api.gateio.ws/api/v4/futures/usdt/contract_stats',
      { params: { contract: 'BTC_USDT', interval: '1h', limit: 1 }, timeout: 8000 }
    );
    const latest = res.data?.[0];
    if (!latest) return null;

    const ratio      = parseFloat(parseFloat(latest.lsr_account).toFixed(3));
    const takerRatio = parseFloat(parseFloat(latest.lsr_taker).toFixed(3));

    let signal;
    if (ratio > 1.4)      signal = 'sangat bullish — waspadai long squeeze';
    else if (ratio > 0.9) signal = 'bullish — longs dominan';
    else if (ratio > 0.7) signal = 'netral — seimbang';
    else if (ratio > 0.5) signal = 'bearish — shorts dominan';
    else                  signal = 'sangat bearish — waspadai short squeeze';

    return { ratio, longPct: null, shortPct: null, takerRatio, longUsers: latest.long_users ?? null, shortUsers: latest.short_users ?? null, signal, source: 'Gate.io Futures (fallback)' };
  } catch (err) {
    console.warn('⚠️  Long/Short Ratio semua sumber gagal:', err.message);
    return null;
  }
}

// ── 11. HASH RATE (blockchain.info) ──────────────────────────────────────────
// Hash rate trend = miner confidence proxy. Unit from blockchain.info: TH/s.
// Convert to EH/s (÷1e6) for readability at current scale (~900+ EH/s).
// Requires User-Agent header — without it the API returns empty values.
export async function fetchHashRate() {
  try {
    const res = await axios.get(
      'https://api.blockchain.info/charts/hash-rate',
      {
        params: { timespan: '1years', format: 'json', cors: 'true' },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 20000,
      }
    );
    const values = res.data?.values ?? [];
    if (values.length < 7) throw new Error('Insufficient hash rate data');

    const sorted     = [...values].sort((a, b) => b.x - a.x);
    const latest7    = sorted.slice(0, 7).map(v => v.y);
    const prev7      = sorted.slice(7, 14).map(v => v.y);

    const avgLatest  = latest7.reduce((s, v) => s + v, 0) / latest7.length;
    const avgPrev    = prev7.length >= 4 ? prev7.reduce((s, v) => s + v, 0) / prev7.length : null;
    const latestEH   = parseFloat((avgLatest / 1e6).toFixed(0)); // TH/s ÷ 1e6 = EH/s

    let trend = '___';
    let weekChange = null;
    if (avgPrev) {
      weekChange = parseFloat(((avgLatest - avgPrev) / avgPrev * 100).toFixed(2));
      trend = weekChange > 1 ? 'naik' : weekChange < -1 ? 'turun' : 'flat';
    }

    let signal;
    if (trend === 'naik')                          signal = 'miner confidence tinggi — network expanding';
    else if (trend === 'turun' && weekChange < -5) signal = 'hash rate drop tajam — potensi miner capitulation';
    else if (trend === 'turun')                    signal = 'hash rate sedikit turun — monitor';
    else                                           signal = 'hash rate stabil';

    return { latestEH, trend, weekChange, signal, source: 'blockchain.info' };
  } catch (err) {
    console.warn('⚠️  Hash Rate gagal:', err.message);
    return null;
  }
}

// ── 12. DERIVATIVES BUNDLE — satu fetch CoinGecko untuk OI + Basis + Skew proxy ─
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
      // Multiplier 100: typical 8h funding 0.001%-0.1% maps to skew range -10 to +30
      // Sign flipped so positive skew = fear (negative funding), negative = greed (positive funding)
      skewProxy = parseFloat((-avgFunding * 100).toFixed(2));
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

// ── 13. GOOGLE TRENDS "bitcoin" — via SerpAPI ────────────────────────────────
// Retail FOMO signal: score 0–100. Free tier = 100 searches/month.
// 12h in-memory cache → 2 effective calls/day × 30 = 60/month (well under limit).
let _trendsCache     = null;
let _trendsCacheTime = 0;

export async function fetchGoogleTrends(apiKey) {
  if (!apiKey) return { skipped: true, reason: 'SERPAPI_API_KEY tidak diset' };

  const TTL = 12 * 60 * 60 * 1000; // 12 jam
  if (_trendsCache && (Date.now() - _trendsCacheTime) < TTL) {
    return { ..._trendsCache, _fromCache: true };
  }

  try {
    const res = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine:    'google_trends',
        q:         'bitcoin',
        data_type: 'TIMESERIES',
        date:      'today 3-m',
        api_key:   apiKey,
      },
      timeout: 15000,
    });

    const timeline = res.data?.interest_over_time?.timeline_data ?? [];
    if (!timeline.length) throw new Error('No timeline data from SerpAPI');

    const values = timeline
      .map(pt => {
        const v = pt.values?.[0]?.extracted_value;
        return v != null ? parseInt(v) : null;
      })
      .filter(v => v !== null);

    if (!values.length) throw new Error('No valid values in SerpAPI timeline');

    const currentValue = values[values.length - 1];
    const last4        = values.slice(-4);
    const avg4w        = Math.round(last4.reduce((s, v) => s + v, 0) / last4.length);
    const prev         = values.length >= 2 ? values[values.length - 2] : null;
    const weekChange   = prev != null ? currentValue - prev : null;
    const trend        = weekChange == null ? 'flat'
      : weekChange > 5 ? 'naik' : weekChange < -5 ? 'turun' : 'flat';

    let signal;
    if (currentValue >= 80)      signal = 'FOMO ekstrem — retail masuk besar, waspadai top';
    else if (currentValue >= 60) signal = 'interest tinggi — fase expansion/late';
    else if (currentValue >= 40) signal = 'interest moderat — mid-cycle';
    else if (currentValue >= 20) signal = 'interest rendah — fase akumulasi/early';
    else                         signal = 'interest sangat rendah — bear/capitulation';

    const result = { currentValue, avg4w, weekChange, trend, signal, source: 'SerpAPI (Google Trends)', _fromCache: false };
    _trendsCache     = { ...result };
    _trendsCacheTime = Date.now();

    console.log(`  ✓ Google Trends "bitcoin" | score: ${currentValue}/100 | avg4w: ${avg4w} | ${trend}`);
    return result;
  } catch (err) {
    console.warn(`⚠️  Google Trends gagal: ${err.message}`);
    return null;
  }
}

// ── BTC ON-CHAIN: COINMETRICS COMMUNITY API (no key required) ─────────────────
// Metrics fetched in one call:
//   SplyExNtv  — BTC held on exchanges (exchange reserve)
//   FlowInExNtv / FlowOutExNtv — daily exchange inflow / outflow
//   CapMVRVCur — true MVRV ratio (Market Cap / Realized Cap)
export async function fetchBtcOnChainCoinMetrics() {
  try {
    const res = await axios.get('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics', {
      params: {
        assets:          'btc',
        metrics:         'SplyExNtv,FlowInExNtv,FlowOutExNtv,CapMVRVCur,CapMrktCurUSD',
        frequency:       '1d',
        limit_per_asset: 32,  // 32 days → 7d delta + 30d MoM for realized cap growth
      },
      timeout: 12000,
    });

    const rows = res.data?.data;
    if (!rows || rows.length < 2) throw new Error('Data tidak cukup');

    const latest  = rows[rows.length - 1];
    const prev7d  = rows.length >= 8 ? rows[rows.length - 8] : rows[0];
    const prev30d = rows[0]; // oldest row (~32 days ago)

    // ── Exchange Reserve ─────────────────────────────────────────────────────
    const reserveNow  = parseFloat(latest.SplyExNtv);
    const reservePrev = parseFloat(prev7d.SplyExNtv);
    const reserveDelta   = Math.round(reserveNow - reservePrev);
    const reserveDeltaPct = parseFloat(((reserveDelta / reservePrev) * 100).toFixed(2));

    // Arah: BTC masuk exchange = whale siap jual = bearish
    //       BTC keluar exchange = whale withdraw/hodl = bullish
    const reserveSignal = reserveDeltaPct >  2   ? '🔴'
      : reserveDeltaPct >  0.5 ? '⚠️'
      : reserveDeltaPct < -2   ? '✅'
      : reserveDeltaPct < -0.5 ? '✅'
      :                          '⚠️';

    const reserveTrend = reserveDeltaPct >  2   ? 'naik tajam — whale deposit, waspadai tekanan jual'
      : reserveDeltaPct >  0.5 ? 'naik moderat — monitor inflow'
      : reserveDeltaPct < -2   ? 'turun tajam — whale withdrawal, akumulasi kuat'
      : reserveDeltaPct < -0.5 ? 'turun moderat — outflow berlanjut, positif'
      :                          'flat — konsolidasi';

    // ── Exchange Flow (latest day) ───────────────────────────────────────────
    const inflow  = Math.round(parseFloat(latest.FlowInExNtv));
    const outflow = Math.round(parseFloat(latest.FlowOutExNtv));
    const netflow = inflow - outflow;
    const flowDir = netflow > 0 ? 'inflow' : 'outflow';
    const flowLabel = `${flowDir} (${netflow > 0 ? '+' : ''}${netflow.toLocaleString()} BTC)`;

    // ── MVRV (True Ratio) ────────────────────────────────────────────────────
    const mvrvRaw = latest.CapMVRVCur != null ? parseFloat(parseFloat(latest.CapMVRVCur).toFixed(3)) : null;
    const mvrvZone = mvrvRaw == null   ? '—'
      : mvrvRaw > 3.5 ? 'Distribusi'
      : mvrvRaw > 2.0 ? 'Late Cycle'
      : mvrvRaw > 1.0 ? 'Fair Value'
      :                 'Capitulation';
    const mvrvSignal = mvrvRaw == null   ? '—'
      : mvrvRaw > 3.5 ? '🔴 distribusi zone'
      : mvrvRaw > 2.0 ? '⚠️ late cycle / stretched'
      : mvrvRaw > 1.0 ? '✅ fair value'
      :                 '✅ undervalued — capitulation';

    // ── Realized Cap — derived exactly from CapMrktCurUSD / CapMVRVCur ────────
    // MVRV is defined as Market Cap / Realized Cap, so: Realized Cap = MktCap / MVRV
    // Both CapMrktCurUSD and CapMVRVCur are free in CoinMetrics Community API.
    const mktCapNow  = latest.CapMrktCurUSD  != null && latest.CapMVRVCur  != null
      ? parseFloat(latest.CapMrktCurUSD)  : null;
    const mktCap30d  = prev30d.CapMrktCurUSD != null && prev30d.CapMVRVCur != null
      ? parseFloat(prev30d.CapMrktCurUSD) : null;
    const mvrv30d    = prev30d.CapMVRVCur != null ? parseFloat(prev30d.CapMVRVCur) : null;

    // 7d realized cap for Phase 4 rate-of-change signal
    const mktCap7d   = prev7d.CapMrktCurUSD != null && prev7d.CapMVRVCur != null
      ? parseFloat(prev7d.CapMrktCurUSD) : null;
    const mvrv7d     = prev7d.CapMVRVCur != null ? parseFloat(prev7d.CapMVRVCur) : null;

    const capRealNow = mktCapNow  != null && mvrvRaw != null && mvrvRaw > 0
      ? mktCapNow  / mvrvRaw : null;
    const capReal30d = mktCap30d  != null && mvrv30d  != null && mvrv30d  > 0
      ? mktCap30d  / mvrv30d : null;
    const capReal7d  = mktCap7d   != null && mvrv7d   != null && mvrv7d   > 0
      ? mktCap7d   / mvrv7d  : null;

    const capRealBillion = capRealNow != null ? parseFloat((capRealNow / 1e9).toFixed(1)) : null;
    const capRealGrowthMoM = capRealNow != null && capReal30d != null && capReal30d > 0
      ? parseFloat(((capRealNow - capReal30d) / capReal30d * 100).toFixed(2))
      : null;
    // 7d realized cap growth — rate-of-change for Phase 4 top signal
    const capRealGrowth7d = capRealNow != null && capReal7d != null && capReal7d > 0
      ? parseFloat(((capRealNow - capReal7d) / capReal7d * 100).toFixed(2))
      : null;
    // Phase 4: sudden slowdown in realized cap growth = profit-taking stall = top signal
    const realizedPLSignal = capRealGrowth7d == null ? '—'
      : capRealGrowth7d > 2   ? '✅ akumulasi aktif'
      : capRealGrowth7d > 0.5 ? '⚠️ pertumbuhan melambat — monitor Phase 4'
      : capRealGrowth7d > 0   ? '🔴 stalling — profit-taking dominan'
      :                         '🔴 negatif — distribusi aktif Phase 4';
    // Market cap in billions (for NVT computation in formatter)
    const mktCapBillion = mktCapNow != null ? parseFloat((mktCapNow / 1e9).toFixed(1)) : null;

    // ── Exchange Inflow Acceleration (Phase 3 signal) ─────────────────────────
    // Acceleration = 7d avg inflow (week1) vs prev 7d (week2) WoW %
    // Rising acceleration = distribution pressure building = Phase 3→4 signal
    const week1Flows   = rows.slice(-7).map(r => parseFloat(r.FlowInExNtv || 0));
    const week2Rows    = rows.slice(-14, -7);
    const avgFlow7d    = week1Flows.reduce((s, v) => s + v, 0) / week1Flows.length;
    const avgFlowPrev7d = week2Rows.length >= 4
      ? week2Rows.map(r => parseFloat(r.FlowInExNtv || 0)).reduce((s, v) => s + v, 0) / week2Rows.length
      : null;
    const flowAcceleration = avgFlowPrev7d != null && avgFlowPrev7d > 0
      ? parseFloat(((avgFlow7d - avgFlowPrev7d) / avgFlowPrev7d * 100).toFixed(1)) : null;
    const flowAccelSignal = flowAcceleration == null ? '—'
      : flowAcceleration > 30  ? '🔴 inflow accelerating — distribusi Phase 3→4'
      : flowAcceleration > 10  ? '⚠️ inflow meningkat — monitor'
      : flowAcceleration < -20 ? '✅ inflow melambat — tekanan jual mereda'
      :                          '⚠️ flat';

    const capRealSignal = capRealGrowthMoM == null ? '—'
      : capRealGrowthMoM > 5  ? '✅ akumulasi aktif (>5% MoM)'
      : capRealGrowthMoM > 2  ? '✅ akumulasi moderat'
      : capRealGrowthMoM > 0  ? '⚠️ pertumbuhan lambat'
      :                         '🔴 stagnan/turun — modal keluar';

    console.log(`  ✓ CoinMetrics | Reserve: ${Math.round(reserveNow / 1000)}k BTC (${reserveDelta > 0 ? '+' : ''}${reserveDelta.toLocaleString()} 7d) | Flow: ${flowLabel} | MVRV: ${mvrvRaw ?? '—'} (${mvrvZone})`);
    console.log(`  ✓ CoinMetrics | RealCap: $${capRealBillion ?? '—'}B (MoM: ${capRealGrowthMoM != null ? (capRealGrowthMoM >= 0 ? '+' : '') + capRealGrowthMoM + '%' : '—'}) | MktCap: $${mktCapBillion ?? '—'}B`);

    return {
      date: latest.time.split('T')[0],
      exchangeReserve: {
        current:      Math.round(reserveNow),
        change7d:     reserveDelta,
        changePct7d:  reserveDeltaPct,
        trend:        reserveTrend,
        signal:       reserveSignal,
      },
      exchangeFlow: {
        inflow,
        outflow,
        netflow,
        direction: flowDir,
        label:     flowLabel,
      },
      mvrv: {
        value:  mvrvRaw,
        zone:   mvrvZone,
        signal: mvrvSignal,
      },
      realizedCap: {
        valueBillion:  capRealBillion,
        growthMoM:     capRealGrowthMoM,
        growth7d:      capRealGrowth7d,
        realizedPLSignal,
        signal:        capRealSignal,
      },
      mktCapBillion,
      flowAcceleration,  // Phase 3: WoW % change in 7d avg exchange inflow
      flowAccelSignal,
      source: 'CoinMetrics Community API',
    };

  } catch (err) {
    console.error('❌ CoinMetrics on-chain error:', err.message);
    return null;
  }
}

// ── BTC ETF FLOW PROXY (Yahoo Finance v8 OHLCV) ──────────────────────────────
// True flow requires sharesOutstanding data (blocked by auth on all free APIs).
// Proxy: price_change × relative_volume for each ETF → aggregate sentiment score.
// Returns directional signal, clearly labeled as proxy/estimate.
export async function fetchBtcEtfFlow() {
  const TICKERS = ['IBIT', 'FBTC', 'ARKB', 'GBTC', 'BITB'];
  // Approx AUM weights (IBIT largest, others smaller)
  const WEIGHTS = { IBIT: 0.45, FBTC: 0.20, ARKB: 0.10, GBTC: 0.15, BITB: 0.10 };

  try {
    const results = await Promise.allSettled(
      TICKERS.map(ticker =>
        axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
          params: { interval: '1d', range: '10d' },
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 10000,
        })
      )
    );

    let weightedScore = 0;
    let totalWeight   = 0;
    const breakdown   = [];
    let latestDate    = null;

    for (let i = 0; i < TICKERS.length; i++) {
      const ticker = TICKERS[i];
      const r = results[i];
      if (r.status !== 'fulfilled') continue;

      const chartData = r.value.data?.chart?.result?.[0];
      if (!chartData) continue;

      const closes  = chartData.indicators?.quote?.[0]?.close ?? [];
      const volumes = chartData.indicators?.quote?.[0]?.volume ?? [];
      const timestamps = chartData.timestamp ?? [];

      // Filter out nulls
      const valid = closes.map((c, idx) => ({ c, v: volumes[idx], t: timestamps[idx] }))
        .filter(x => x.c != null && x.v != null && x.v > 0);

      if (valid.length < 3) continue;

      // Latest day
      const last   = valid[valid.length - 1];
      const prev   = valid[valid.length - 2];
      if (!latestDate && last.t) {
        latestDate = new Date(last.t * 1000).toISOString().split('T')[0];
      }

      // Price change %
      const pricePct = ((last.c - prev.c) / prev.c) * 100;

      // Volume ratio vs 5-day average (excl today)
      const volWindow = valid.slice(-6, -1).map(x => x.v);
      const avgVol    = volWindow.reduce((a, b) => a + b, 0) / volWindow.length;
      const volRatio  = avgVol > 0 ? last.v / avgVol : 1;

      // Score: price direction amplified by volume (volRatio capped at 2.5)
      const cappedVolRatio = Math.min(volRatio, 2.5);
      const score = pricePct * cappedVolRatio;

      const w = WEIGHTS[ticker] ?? 0.1;
      weightedScore += score * w;
      totalWeight   += w;

      breakdown.push({
        ticker,
        pricePct: parseFloat(pricePct.toFixed(2)),
        volRatio:  parseFloat(cappedVolRatio.toFixed(2)),
        score:     parseFloat(score.toFixed(2)),
        price:     parseFloat(last.c.toFixed(2)),
      });
    }

    if (breakdown.length === 0) throw new Error('Semua ETF gagal diambil');

    const normalizedScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

    // Map score to label
    const label   = normalizedScore >  2   ? 'Strong Inflow'
      : normalizedScore >  0.5 ? 'Inflow'
      : normalizedScore < -2   ? 'Strong Outflow'
      : normalizedScore < -0.5 ? 'Outflow'
      :                          'Neutral';
    const signal  = normalizedScore >  0.5 ? '✅'
      : normalizedScore < -0.5 ? '🔴'
      :                          '⚠️';
    const trend   = normalizedScore >  2   ? 'beli agresif, demand ETF tinggi'
      : normalizedScore >  0.5 ? 'aliran masuk — sentimen positif'
      : normalizedScore < -2   ? 'tekanan jual kuat pada ETF'
      : normalizedScore < -0.5 ? 'aliran keluar — risk-off'
      :                          'konsolidasi — arah belum jelas';

    console.log(`  ✓ ETF Flow proxy | Score: ${normalizedScore.toFixed(2)} → ${label} (${breakdown.length} ETFs, date: ${latestDate})`);

    return {
      date:            latestDate,
      label,
      signal,
      trend,
      score:           parseFloat(normalizedScore.toFixed(2)),
      etfsUsed:        breakdown.length,
      breakdown,
      isProxy:         true,
      source:          'Yahoo Finance v8 (volume-price proxy)',
    };

  } catch (err) {
    console.error('❌ ETF Flow proxy error:', err.message);
    return null;
  }
}

// ── BTC REALIZED VOLATILITY 30D — blockchain.info price history ───────────────
// Proxy for Options ATM IV (Deribit DVOL blocked by ISP).
// Realized vol and IV are highly correlated for BTC; same directional signal.
// Annualized 30d RVol = sqrt(252) * std(log_daily_returns_last_30d) * 100
// Zones: <30% complacency | 30-60% normal | 60-90% elevated | >90% panic
export async function fetchDeribitIV() {
  try {
    const res = await axios.get(
      'https://api.blockchain.info/charts/market-price',
      {
        params: { timespan: '60days', format: 'json', cors: 'true' },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
      }
    );
    const values = res.data?.values ?? [];
    if (values.length < 32) throw new Error('Insufficient price history for RVol');

    // Sort chronological, take last 31 days for 30 returns
    const prices = [...values].sort((a, b) => a.x - b.x).map(v => v.y).filter(p => p > 0);
    const last31 = prices.slice(-31);
    if (last31.length < 31) throw new Error('Not enough days for 30d RVol');

    // Log daily returns
    const logReturns = [];
    for (let i = 1; i < last31.length; i++) {
      logReturns.push(Math.log(last31[i] / last31[i - 1]));
    }
    const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
    const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / logReturns.length;
    const rvol30d  = parseFloat((Math.sqrt(variance * 252) * 100).toFixed(1));

    // 7d change: compare last 7 days vs prev 7 days for day-change proxy
    const last8  = prices.slice(-8);
    const prev7dPrices = last8.slice(0, 7);
    const cur7dPrices  = last8.slice(1);
    const rvolPrev7 = (() => {
      const rets = [];
      for (let i = 1; i < prev7dPrices.length; i++) rets.push(Math.log(prev7dPrices[i] / prev7dPrices[i-1]));
      if (!rets.length) return rvol30d;
      const m = rets.reduce((s, r) => s + r, 0) / rets.length;
      return parseFloat((Math.sqrt(rets.reduce((s, r) => s + (r-m)**2, 0) / rets.length * 252) * 100).toFixed(1));
    })();
    const weekChange = parseFloat((rvol30d - rvolPrev7).toFixed(1));

    const date   = new Date().toISOString().slice(0, 10);
    const zone   = rvol30d < 30 ? 'complacency'
      : rvol30d < 60 ? 'normal'
      : rvol30d < 90 ? 'elevated'
      : 'panic';
    const signal = rvol30d < 30 ? '⚠️ complacency — vol rendah, Phase 3→4 warning'
      : rvol30d < 60 ? '✅ normal'
      : rvol30d < 90 ? '⚠️ elevated'
      : '🔴 panic — capitulation signal Phase 0';

    console.log(`  ✓ BTC RVol 30d | ${rvol30d}% ann | Δ7d: ${weekChange >= 0 ? '+' : ''}${weekChange} | ${zone}`);
    return {
      value:     rvol30d,
      dayChange: weekChange,
      date,
      zone,
      signal,
      source: 'blockchain.info 30d RVol (proxy IV)',
    };
  } catch (err) {
    console.warn(`⚠️  BTC RVol gagal: ${err.message}`);
    return null;
  }
}

// ── BTC CME FUTURES PREMIUM — Yahoo Finance BTC=F ────────────────────────────
// Phase 2 indicator: institutional participation via CME regulated futures.
// Premium = (CME futures price - spot) / spot * 100.
// Positive = institutions expect higher price (bullish Phase 2). Negative = hedge/bearish.
export async function fetchBtcCmePremium() {
  try {
    const res = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/BTC%3DF', {
      params: { interval: '1d', range: '5d' },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    });
    const result = res.data?.chart?.result?.[0];
    if (!result) throw new Error('No data from Yahoo Finance BTC=F');

    const closes     = result.indicators?.quote?.[0]?.close ?? [];
    const timestamps = result.timestamp ?? [];
    const valid      = closes.map((c, i) => ({ c, t: timestamps[i] })).filter(x => x.c != null);
    if (!valid.length) throw new Error('No valid closes for BTC=F');

    const last         = valid[valid.length - 1];
    const futuresPrice = Math.round(last.c);
    const date         = new Date(last.t * 1000).toISOString().split('T')[0];

    console.log(`  ✓ BTC CME Futures (BTC=F): $${futuresPrice.toLocaleString()} | date: ${date}`);
    return { futuresPrice, date, source: 'Yahoo Finance (BTC=F)' };
  } catch (err) {
    console.warn(`⚠️  BTC CME Premium gagal: ${err.message}`);
    return null;
  }
}

// ── L2 TVL BREAKDOWN — DefiLlama /v2/chains ──────────────────────────────────
// Phase 2 indicator: L2 ecosystem activity = real on-chain expansion beyond BTC/ETH.
// Base, Arbitrum, Optimism are the dominant L2s. Rising TVL = Phase 2/3 on-chain demand.
export async function fetchL2TVL() {
  const TARGETS  = ['Base', 'Arbitrum', 'OP Mainnet', 'Polygon', 'ZKsync Era'];
  const NAME_MAP = { 'OP Mainnet': 'Optimism', 'ZKsync Era': 'zkSync' };

  try {
    const res = await axios.get('https://api.llama.fi/v2/chains', { timeout: 12000 });
    const chains = res.data ?? [];

    const found = TARGETS
      .map(t => {
        const chain = chains.find(c => c.name === t);
        return chain?.tvl != null
          ? { name: NAME_MAP[t] ?? t, tvlBillion: parseFloat((chain.tvl / 1e9).toFixed(2)) }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.tvlBillion - a.tvlBillion);

    if (!found.length) throw new Error('No L2 chains found in DefiLlama response');

    const totalBillion  = parseFloat(found.reduce((s, c) => s + c.tvlBillion, 0).toFixed(2));
    const dominantChain = found[0].name;
    const signal        = totalBillion > 15 ? '✅ L2 mature — Phase 2/3 on-chain activity tinggi'
      : totalBillion > 8                    ? '⚠️ L2 growing — early Phase 2'
      :                                       '🔴 L2 TVL rendah — risk-off / Phase 0/1';

    console.log(`  ✓ L2 TVL | ${found.map(c => `${c.name}: $${c.tvlBillion}B`).join(' | ')} | Total: $${totalBillion}B`);
    return { chains: found, totalBillion, dominantChain, signal, source: 'DefiLlama' };
  } catch (err) {
    console.warn(`⚠️  L2 TVL gagal: ${err.message}`);
    return null;
  }
}

// ── AGGREGATE: SEMUA DAILY DATA ───────────────────────────────────────────────
export async function fetchAllDailyData(config = {}) {
  console.log('📊 Fetching daily data...');
  _hlCache = null; // reset cache tiap fetch

  const [crypto, fearGreed, funding, dxy, gold, cmc, nuplProxy, longShortRatio, hashRate, googleTrends, coinMetrics, etfFlow, deribitIV, btcCmePremium, l2TVL] = await Promise.allSettled([
    fetchCryptoData(),
    fetchFearGreed(),
    fetchFundingRates(),
    fetchDXY({ twelveData: config.twelveDataKey, alphaVantage: config.alphaVantageApiKey }),
    fetchGold(config.twelveDataKey),
    fetchCoinMarketCapGlobal(config.coinMarketCapApiKey),
    fetchNuplProxy(),
    fetchLongShortRatio(),
    fetchHashRate(),
    fetchGoogleTrends(config.serpApiKey),
    fetchBtcOnChainCoinMetrics(),
    fetchBtcEtfFlow(),
    fetchDeribitIV(),
    fetchBtcCmePremium(),
    fetchL2TVL(),
  ]);

  // Derivatives bundle: satu fetch /derivatives → OI + Basis + Skew (hindari 3x CoinGecko 429)
  const cryptoVal    = crypto.status === 'fulfilled' ? crypto.value : null;
  const btcPriceHint = cryptoVal?.btc?.price ?? null;
  const derivBundle  = await fetchBtcDerivativesBundle(btcPriceHint).catch(() => ({}));

  // Blockchain.info bundle: sequential (active addresses + miner revenue)
  const bcBundle = await fetchBlockchainInfoBundle().catch(() => ({}));

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
    nuplProxy:       nuplProxy.status       === 'fulfilled' ? nuplProxy.value       : null,
    longShortRatio:  longShortRatio.status  === 'fulfilled' ? longShortRatio.value  : null,
    hashRate:        hashRate.status        === 'fulfilled' ? hashRate.value        : null,
    googleTrends:    googleTrends.status    === 'fulfilled' ? googleTrends.value    : null,
    coinMetrics:     coinMetrics.status     === 'fulfilled' ? coinMetrics.value     : null,
    etfFlow:         etfFlow.status         === 'fulfilled' ? etfFlow.value         : null,
    deribitIV:       deribitIV.status       === 'fulfilled' ? deribitIV.value       : null,
    btcCmePremium:   btcCmePremium.status   === 'fulfilled' ? btcCmePremium.value   : null,
    l2TVL:           l2TVL.status           === 'fulfilled' ? l2TVL.value           : null,
    activeAddresses: bcBundle.activeAddresses ?? null,
    minerRevenue:    bcBundle.minerRevenue    ?? null,
    txVolume:        bcBundle.txVolume        ?? null,
    outputVolume:    bcBundle.outputVolume    ?? null,
    brentOil,
    btcOI:       derivBundle.btcOI       ?? null,
    btcBasis:    derivBundle.btcBasis     ?? null,
    optionsSkew: derivBundle.optionsSkew ?? null,
  };
}
