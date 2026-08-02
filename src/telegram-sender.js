// ============================================
// TELEGRAM SENDER
// Kirim hasil analisis + fetch data ke Telegram channel/group
//
// Setup:
// 1. Buat bot via @BotFather → dapat TELEGRAM_BOT_TOKEN
// 2. Tambahkan bot ke channel/group sebagai admin
// 3. Dapat TELEGRAM_CHAT_ID:
//    - Channel : @channelname  atau  -100xxxxxxxxxx
//    - Group   : -xxxxxxxxxx
//    - Private : angka positif (user ID)
//
// Telegram limit: 4096 karakter per pesan
// Script ini split otomatis di batas kalimat/paragraf
// ============================================

import axios from 'axios';

const TELEGRAM_MAX_CHARS = 4000; // sedikit di bawah 4096 untuk safety margin
const RATE_LIMIT_DELAY   = 1200; // ms antara pesan (Telegram limit 30 msg/sec, aman di 1/sec)

// ── Helper: delay ─────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Helper: escape karakter untuk MarkdownV2 ─────────────────────────────────
// Telegram MarkdownV2 punya banyak reserved char yang harus di-escape
function escapeMarkdownV2(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, c => '\\' + c);
}

// ── Helper: split teks panjang menjadi chunks ≤ maxLen chars ─────────────────
// Strategi split: prioritas di double-newline → newline → spasi → paksa split
function splitMessage(text, maxLen = TELEGRAM_MAX_CHARS) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let cutAt = maxLen;

    // Coba split di paragraf (double newline)
    const paraIdx = remaining.lastIndexOf('\n\n', maxLen);
    if (paraIdx > maxLen * 0.5) {
      cutAt = paraIdx + 2;
    } else {
      // Coba split di newline
      const nlIdx = remaining.lastIndexOf('\n', maxLen);
      if (nlIdx > maxLen * 0.5) {
        cutAt = nlIdx + 1;
      } else {
        // Coba split di spasi
        const spIdx = remaining.lastIndexOf(' ', maxLen);
        if (spIdx > maxLen * 0.5) {
          cutAt = spIdx + 1;
        }
        // else: paksa cut di maxLen
      }
    }

    chunks.push(remaining.slice(0, cutAt).trimEnd());
    remaining = remaining.slice(cutAt).trimStart();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

// ── Helper: kirim satu pesan ──────────────────────────────────────────────────
async function sendOne(botToken, chatId, text, options = {}) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = {
    chat_id:    chatId,
    text:       text,
    parse_mode: options.parseMode || 'Markdown',  // 'Markdown', 'HTML', atau undefined
    disable_web_page_preview: true,
    disable_notification: options.silent ?? false,
  };

  // Retry helper untuk transient 5xx / network / 429
  const postWithRetry = async (body, maxRetries = 3) => {
    let lastErr;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await axios.post(url, body, { timeout: 10000 });
        return res.data;
      } catch (err) {
        lastErr = err;
        const status = err.response?.status;
        const transient = status === 503 || status === 502 || status === 504 || status === 429 || !status;
        if (!transient || attempt === maxRetries - 1) throw err;
        const wait = Math.min(2000 * Math.pow(2, attempt), 15000);
        console.warn(`  ⚠️  Telegram HTTP ${status ?? 'network'}, retry in ${wait}ms (attempt ${attempt + 2}/${maxRetries})`);
        await sleep(wait);
      }
    }
    throw lastErr;
  };

  try {
    return await postWithRetry(payload);
  } catch (err) {
    if (err.response?.data?.description?.includes('parse')) {
      console.warn('  ⚠️  Telegram parse error, retry as plain text');
      const plainPayload = { ...payload, parse_mode: undefined };
      return await postWithRetry(plainPayload);
    }
    throw err;
  }
}

// ── KIRIM PESAN (dengan auto-split) ──────────────────────────────────────────
export async function sendToTelegram(text, options = {}) {
  const {
    botToken,
    chatId,
    silent    = false,
    parseMode = 'Markdown',
    label     = '',       // label untuk log, misal "Claude analysis"
  } = options;

  if (!botToken || botToken === 'your_telegram_bot_token_here') {
    throw new Error('TELEGRAM_BOT_TOKEN tidak diset di .env');
  }
  if (!chatId || chatId === 'your_telegram_chat_id_here') {
    throw new Error('TELEGRAM_CHAT_ID tidak diset di .env');
  }

  const chunks = splitMessage(text, TELEGRAM_MAX_CHARS);
  const totalChunks = chunks.length;

  console.log(`  📤 Mengirim ke Telegram${label ? ` (${label})` : ''}: ${totalChunks} pesan`);

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];

    // Tambahkan header part jika multi-chunk
    if (totalChunks > 1) {
      chunk = `_(${i + 1}/${totalChunks})_\n\n${chunk}`;
    }

    await sendOne(botToken, chatId, chunk, { parseMode, silent });
    console.log(`    ✓ Bagian ${i + 1}/${totalChunks} terkirim`);

    // Rate limiting: tunggu antar pesan
    if (i < chunks.length - 1) await sleep(RATE_LIMIT_DELAY);
  }

  return { success: true, chunks: totalChunks };
}

// ── FORMAT FETCH DATA SUMMARY UNTUK TELEGRAM ─────────────────────────────────
// Mengubah data mentah menjadi pesan ringkasan yang clean untuk Telegram
export function formatFetchSummaryForTelegram(daily, weekly, monthly, fed) {
  const ts  = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const day = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const lines = [
    `📊 *CRYPTO DASHBOARD — DATA UPDATE*`,
    `🗓 ${day} | ${ts} WIB`,
    `${'─'.repeat(32)}`,
  ];

  // Fed Liquidity
  if (fed && !fed.skipped) {
    lines.push('', `🏦 *FED LIQUIDITY TRIFECTA*`);
    if (fed.walcl?.totalTrillions != null)
      lines.push(`WALCL: $${fed.walcl.totalTrillions}T (${fed.walcl.weekChangeBillions >= 0 ? '+' : ''}${fed.walcl.weekChangeBillions}B) ${fed.walcl.signal}`);
    if (fed.rrp?.balanceBillions != null)
      lines.push(`RRP  : $${fed.rrp.balanceBillions}B | trend: ${fed.rrp.trend} ${fed.rrp.signal}`);
    if (fed.reserves?.totalTrillions != null)
      lines.push(`WRESBAL: $${fed.reserves.totalTrillions}T ${fed.reserves.signal}`);
    lines.push(`Score: *${fed.trifectaScore}* → ${fed.overallStatus}`);
    lines.push('', `📉 *PHASE 0 MACRO STRESS*`);
    if (fed.tga?.balanceBillions != null)
      lines.push(`TGA  : $${fed.tga.balanceBillions}B (Δ${fed.tga.weekChangeBillions >= 0 ? '+' : ''}${fed.tga.weekChangeBillions}B | ${fed.tga.trend}) ${fed.tga.signal}`);
    if (fed.hySpread?.spreadPct != null)
      lines.push(`HY OAS: ${fed.hySpread.spreadPct}% | ${fed.hySpread.zone} ${fed.hySpread.signal}`);
    if (fed.yieldCurve?.spread != null)
      lines.push(`Curve: ${fed.yieldCurve.spread >= 0 ? '+' : ''}${fed.yieldCurve.spread}% (${fed.yieldCurve.zone}) ${fed.yieldCurve.signal}`);
    if (fed.vix?.value != null)
      lines.push(`VIX  : ${fed.vix.value} | ${fed.vix.zone} ${fed.vix.signal}`);
    if (fed.macroStressScore)
      lines.push(`Stress: *${fed.macroStressScore}* merah → ${fed.macroStressLabel}`);
  }

  // WoW helper
  const wowStr = (curr, prev) => {
    if (curr == null || prev == null || prev === 0) return '';
    const pct = ((curr - prev) / Math.abs(prev) * 100).toFixed(2);
    return ` | WoW: ${pct > 0 ? '+' : ''}${pct}%`;
  };
  const prevWeek = daily?._prevWeek ?? null;

  // Daily
  if (daily?.crypto) {
    const c = daily.crypto;
    lines.push('', `💹 *DAILY*`);
    if (c.btc?.price)
      lines.push(`BTC: $${c.btc.price.toLocaleString()} (${c.btc.change24h >= 0 ? '+' : ''}${c.btc.change24h}%)`);
    if (c.eth?.price)
      lines.push(`ETH: $${c.eth.price.toLocaleString()} (${c.eth.change24h >= 0 ? '+' : ''}${c.eth.change24h}%)`);
    if (c.btcDominance)
      lines.push(`BTC.D: ${c.btcDominance}%`);
    if (daily.fearGreed?.value)
      lines.push(`F&G: ${daily.fearGreed.value} — ${daily.fearGreed.label}`);
    if (daily.funding?.btc != null)
      lines.push(`Funding: BTC ${daily.funding.btc}% | ETH ${daily.funding.eth}% (${daily.funding.source || ''})`);
    if (daily.dxy?.value)
      lines.push(`DXY: ${daily.dxy.value} (${daily.dxy.direction})`);
    if (daily.gold?.price)
      lines.push(`Gold: $${daily.gold.price} (${daily.gold.change24h >= 0 ? '+' : ''}${daily.gold.change24h}%)`);
    if (daily.brentOil?.price)
      lines.push(`Oil Brent: $${daily.brentOil.price} (${daily.brentOil.direction})`);
    if (daily.cmc && !daily.cmc.skipped) {
      lines.push(`TOTAL2: $${daily.cmc.total2}T${wowStr(daily.cmc.total2, prevWeek?.total2_trillion)}`);
      lines.push(`TOTAL3: $${daily.cmc.total3}B${wowStr(daily.cmc.total3, prevWeek?.total3_billion)}`);
      lines.push(`Others.D: ${daily.cmc.othersDominance}%`);
    }
    if (c.stablecoinSupply?.total != null) {
      const stableWow = wowStr(c.stablecoinSupply.total, prevWeek?.stablecoin_billion);
      const dom = (c.totalMarketCapBillion && c.totalMarketCapBillion > 0)
        ? ` | Dom: ${(c.stablecoinSupply.total / c.totalMarketCapBillion * 100).toFixed(2)}%`
        : '';
      lines.push(`Stable: $${c.stablecoinSupply.total}B${dom}${stableWow}`);
    }
  }

  // On-chain & Derivatives
  const nupl  = daily?.nuplProxy;
  const oi    = daily?.btcOI;
  const basis = daily?.btcBasis;
  const ls    = daily?.longShortRatio;
  const hr    = daily?.hashRate;
  const aa    = daily?.activeAddresses;
  const mr    = daily?.minerRevenue;
  const pc    = daily?.nuplProxy?.piCycle ?? null;
  const gt    = (!daily?.googleTrends?.skipped) ? daily?.googleTrends : null;
  const cm    = daily?.coinMetrics ?? null;
  const etf   = daily?.etfFlow ?? null;
  const hasOnchain = nupl || oi || basis || ls || hr || aa || mr || pc || gt || cm || etf;
  if (hasOnchain) {
    lines.push('', `⛓ *ON-CHAIN & DERIVATIF*`);
    if (cm?.exchangeReserve) {
      const er = cm.exchangeReserve;
      const mv = cm.mvrv;
      const rc = cm.realizedCap;
      lines.push(`Exchange Reserve: ${(er.current / 1000).toFixed(1)}k BTC | 7d: ${er.change7d > 0 ? '+' : ''}${er.change7d.toLocaleString()} BTC (${er.changePct7d > 0 ? '+' : ''}${er.changePct7d}%) ${er.signal}`);
      if (mv?.value != null) lines.push(`MVRV (true): ${mv.value} | ${mv.zone} ${mv.value > 3.5 ? '🔴' : mv.value > 2.0 ? '⚠️' : '✅'}`);
      if (rc?.valueBillion != null) lines.push(`Realized Cap: $${rc.valueBillion}B | MoM: ${rc.growthMoM != null ? (rc.growthMoM >= 0 ? '+' : '') + rc.growthMoM + '%' : '—'} ${rc.growthMoM > 5 ? '✅' : rc.growthMoM > 0 ? '⚠️' : '🔴'}`);
    }
    if (daily?.txVolume?.avg7dBtc != null) {
      const tv = daily.txVolume;
      const btcPx = daily?.crypto?.btc?.price;
      const mktB  = cm?.mktCapBillion;
      const txUsdB = (tv.avg7dBtc != null && btcPx) ? parseFloat((tv.avg7dBtc * btcPx / 1e9).toFixed(1)) : null;
      const nvt = (mktB && txUsdB) ? parseFloat((mktB / txUsdB).toFixed(1)) : null;
      lines.push(`NVT: ${nvt ?? '—'} | TxVol: ${tv.avg7dBtc.toLocaleString()} BTC/day ${nvt != null ? (nvt < 50 ? '✅ undervalued' : nvt < 150 ? '⚠️ fair' : nvt < 300 ? '🔴 elevated' : '🔴 sangat tinggi') : ''}`);
    }
    if (daily?.outputVolume?.avg7dBtc != null) {
      const ov = daily.outputVolume;
      lines.push(`Coin Velocity: ${ov.avg7dBtc.toLocaleString()} BTC/day | WoW: ${ov.weekChange != null ? (ov.weekChange >= 0 ? '+' : '') + ov.weekChange + '%' : '—'} | ${ov.hodlSignal}`);
    }
    // Phase 3 — Flow Acceleration + DVOL + Funding Streak
    if (cm?.flowAcceleration != null)
      lines.push(`Flow Accel: ${cm.flowAcceleration >= 0 ? '+' : ''}${cm.flowAcceleration}% WoW inflow | ${cm.flowAccelSignal}`);
    const dvol3 = daily?.deribitIV;
    if (dvol3)
      lines.push(`BTC RVol 30d: ${dvol3.value}% ann | ${dvol3.zone} ${dvol3.signal.split('—')[0].trim()}`);
    const fs = daily?.fundingStreak;
    if (fs && fs.streakDays >= 1)
      lines.push(`Funding Streak: ${fs.streakDays} hari >0.05% | avg7d: ${fs.avgRate7d ?? '—'}% | ${fs.signal}`);
    // Phase 4 — Realized P/L + Skew proxy + Stablecoin Growth
    const rc4 = cm?.realizedCap;
    if (rc4?.growth7d != null)
      lines.push(`Realized P/L (7d δ): ${rc4.growth7d >= 0 ? '+' : ''}${rc4.growth7d}% | ${rc4.realizedPLSignal}`);
    const ba4 = daily?.btcBasis?.annualizedPct ?? null;
    const fu4 = daily?.funding?.btc ?? null;
    if (ba4 != null && fu4 != null) {
      const sk4sig = ba4 < 0 ? '🔴 backwardation' : ba4 < 5 && fu4 > 0.05 ? '🔴 diverge Phase 4' : ba4 < 10 && fu4 > 0.03 ? '⚠️ hedging mulai' : ba4 > 15 && fu4 > 0.05 ? '⚠️ Phase 3 late' : '✅ normal';
      lines.push(`Skew proxy: basis ${ba4}% ann | funding ${fu4}% | ${sk4sig}`);
    }
    const sn4 = daily?.crypto?.stablecoinSupply?.total ?? null;
    const sp4 = daily?._prevWeek?.stablecoin_billion ?? null;
    const sg4 = (sn4 != null && sp4 != null && sp4 > 0)
      ? parseFloat(((sn4 - sp4) / sp4 * 100).toFixed(2)) : null;
    if (sg4 != null)
      lines.push(`Stable Supply WoW: ${sg4 >= 0 ? '+' : ''}${sg4}% | $${sn4}B ${sg4 < -1 ? '🔴 rotasi cash' : sg4 > 5 ? '✅ printing' : '⚠️ flat'}`);
    // Phase 2 — CME Premium + L2 TVL
    const cme2 = daily?.btcCmePremium;
    const spot2 = daily?.crypto?.btc?.price;
    const pct2 = (cme2?.futuresPrice != null && spot2 != null && spot2 > 0)
      ? parseFloat(((cme2.futuresPrice - spot2) / spot2 * 100).toFixed(2)) : null;
    if (pct2 != null)
      lines.push(`CME Premium: ${pct2 >= 0 ? '+' : ''}${pct2}% | futures $${cme2.futuresPrice.toLocaleString()}`);
    const l2_2 = daily?.l2TVL;
    if (l2_2)
      lines.push(`L2 TVL: $${l2_2.totalBillion}B | ${l2_2.chains.slice(0, 3).map(c => `${c.name} $${c.tvlBillion}B`).join(' | ')} | ${l2_2.signal}`);
    if (etf)
      lines.push(`ETF Flow ⚠️: ${etf.label} | skor: ${etf.score > 0 ? '+' : ''}${etf.score} ${etf.signal} (${etf.etfsUsed} ETFs, estimasi)`);
    if (nupl) {
      const mult = nupl.currentPrice && nupl.realizedPriceProxy
        ? (nupl.currentPrice / nupl.realizedPriceProxy).toFixed(2) : null;
      lines.push(`NUPL: ${nupl.nupl > 0 ? '+' : ''}${nupl.nupl} (${nupl.nuplZone})${mult ? ` | MVRV proxy: ${mult}x` : ''}`);
      lines.push(`SOPR: ${nupl.sopr}`);
    }
    if (pc)
      lines.push(`Pi Cycle: gap ${pc.gapPct > 0 ? '+' : ''}${pc.gapPct}% | ${pc.signal.replace(/^[🚨⚠️]+\s*/u, '')}`);
    if (aa)
      lines.push(`Active Addr: ${aa.avg7d.toLocaleString('en-US')} | WoW: ${aa.weekChange != null ? (aa.weekChange > 0 ? '+' : '') + aa.weekChange + '%' : '___'} (${aa.trend})`);
    if (mr)
      lines.push(`Miner Rev: $${mr.revMillion}M/day | WoW: ${mr.weekChange != null ? (mr.weekChange > 0 ? '+' : '') + mr.weekChange + '%' : '___'} (${mr.trend})`);
    if (ls) {
      const lsDetail = ls.longPct != null
        ? `${ls.longPct}%L / ${ls.shortPct}%S`
        : `${ls.longUsers}L / ${ls.shortUsers}S`;
      lines.push(`L/S: ${ls.ratio} (${lsDetail}) — ${ls.signal}`);
    }
    if (hr)
      lines.push(`Hash Rate: ${hr.latestEH} EH/s | WoW: ${hr.weekChange != null ? (hr.weekChange > 0 ? '+' : '') + hr.weekChange + '%' : '___'} (${hr.trend})`);
    if (gt)
      lines.push(`Trends: ${gt.currentValue}/100${gt._fromCache ? ' 💾' : ''} | avg4w: ${gt.avg4w} | WoW: ${gt.weekChange != null ? (gt.weekChange > 0 ? '+' : '') + gt.weekChange + ' pts' : '___'} — ${gt.signal}`);
    if (oi)
      lines.push(`OI BTC: $${oi.totalBillion}B (${oi.trend})`);
    if (basis)
      lines.push(`Basis: ${basis.annualizedPct}% ann. — ${basis.signal}`);
  }

  // Weekly
  if (weekly && !weekly.skipped) {
    const hasWeeklyData = weekly.yield10y?.value || weekly.nfci?.value || weekly.tvl?.tvl;
    if (hasWeeklyData) {
      lines.push('', `📅 *WEEKLY*`);
      if (weekly.yield10y?.value)
        lines.push(`10Y Yield: ${weekly.yield10y.value}% (${weekly.yield10y.direction})`);
      if (weekly.nfci?.value)
        lines.push(`NFCI: ${weekly.nfci.value} (${weekly.nfci.trend})`);
      if (weekly.tvl?.tvl)
        lines.push(`DeFi TVL: $${weekly.tvl.tvl}B (${weekly.tvl.changePercent >= 0 ? '+' : ''}${weekly.tvl.changePercent}%)`);
      if (weekly.oil?.price)
        lines.push(`Oil 7d: $${weekly.oil.price} (${weekly.oil.weekChange >= 0 ? '+' : ''}${weekly.oil.weekChange}%)`);
      if (weekly.msciEm?.value)
        lines.push(`EEM ETF (MSCI EM proxy): $${weekly.msciEm.value} (${weekly.msciEm.direction})`);
      if (weekly.othersDom?.othersDominance)
        lines.push(`OTHERS.D: ${weekly.othersDom.othersDominance}%`);
      if (weekly.ratioTrend?.ethBtc)
        lines.push(`ETH/BTC: ${weekly.ratioTrend.ethBtc.ratio} (${weekly.ratioTrend.ethBtc.direction})`);
      if (weekly.altseason?.value != null)
        lines.push(`Altszn: ${weekly.altseason.value} — ${weekly.altseason.signal}`);
    }
  }

  // Monthly
  if (monthly?.cpi && !monthly.cpi.skipped) {
    lines.push('', `📆 *MONTHLY*`);
    lines.push(`CPI: ${monthly.cpi.yoy}% YoY`);
    if (!monthly.pmi?.skipped && monthly.pmi?.value != null)
      lines.push(`PMI: ${monthly.pmi.value} (${monthly.pmi.condition})`);
    if (!monthly.fedRate?.skipped)
      lines.push(`Fed: ${monthly.fedRate.label}`);
    if (monthly.m2?.globalTrillions)
      lines.push(`Global M2: $${monthly.m2.globalTrillions}T | YoY: ${monthly.m2.globalYoY}%`);
  }

  lines.push('', `${'─'.repeat(32)}`);
  lines.push(`_Data auto-fetched oleh Crypto Dashboard_`);

  return lines.join('\n');
}

// ── FORMAT HEADER ANALISIS UNTUK TELEGRAM ────────────────────────────────────
export function formatAnalysisHeader(provider, analysisText) {
  const emoji = {
    claude:     '🤖',
    chatgpt:    '🟢',
    gemini:     '✨',
    perplexity: '🔍',
    grok:       '⚡',
  };
  const name = {
    claude:     'Claude (Anthropic)',
    chatgpt:    'ChatGPT (OpenAI)',
    gemini:     'Gemini (Google)',
    perplexity: 'Perplexity Sonar',
    grok:       'Grok (xAI)',
  };

  const ts = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const header = [
    `${emoji[provider] || '🤖'} *ANALISIS ${(name[provider] || provider).toUpperCase()}*`,
    `_${ts} WIB_`,
    `${'─'.repeat(32)}`,
    '',
  ].join('\n');

  return header + analysisText;
}

// ── KIRIM PROMPT KE TELEGRAM ──────────────────────────────────────────────────
// Berguna untuk review/debug prompt sebelum dikirim ke AI,
// atau sebagai dokumentasi prompt yang digunakan pada analisis tertentu
export async function sendPromptToTelegram(promptText, options = {}) {
  const { botToken, chatId, label = 'Prompt' } = options;

  await sendToTelegram(promptText, {
    botToken,
    chatId,
    label,
    parseMode: 'Markdown',
  });
}

// ── KIRIM SEMUA: DATA SUMMARY + ANALISIS ─────────────────────────────────────
export async function sendDashboardToTelegram(config, data, analyses = {}) {
  const { telegramBotToken: botToken, telegramChatId: chatId } = config;

  if (!botToken || !chatId) {
    console.warn('  ⚠️  Telegram: TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID tidak diset, skip');
    return;
  }

  const { daily, weekly, monthly, fed } = data;

  console.log('\n📱 Mengirim ke Telegram...');

  try {
    // 1. Kirim data summary
    const summaryText = formatFetchSummaryForTelegram(daily, weekly, monthly, fed);
    await sendToTelegram(summaryText, { botToken, chatId, label: 'Data Summary' });
    await sleep(RATE_LIMIT_DELAY);

    // 2. Kirim tiap analisis AI
    for (const [provider, analysisText] of Object.entries(analyses)) {
      if (!analysisText) continue;
      await sleep(RATE_LIMIT_DELAY);
      const formatted = formatAnalysisHeader(provider, analysisText);
      await sendToTelegram(formatted, { botToken, chatId, label: `${provider} analysis` });
    }

    console.log(chalk_green('✅ Semua terkirim ke Telegram'));
  } catch (err) {
    console.error('❌ Telegram error:', err.message);
    if (err.response?.data) console.error('   Detail:', JSON.stringify(err.response.data));
    throw err;
  }
}

// chalk_green placeholder — chalk diimport di index.js, bukan di sini
function chalk_green(s) { return s; }
