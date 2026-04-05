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

  // Jika mode HTML, tidak perlu escape
  // Jika Markdown, karakter tertentu bisa bermasalah — fallback ke plain text jika error
  try {
    const res = await axios.post(url, payload, { timeout: 10000 });
    return res.data;
  } catch (err) {
    if (err.response?.data?.description?.includes('parse')) {
      // Fallback: kirim ulang tanpa parse_mode (plain text)
      console.warn('  ⚠️  Telegram parse error, retry as plain text');
      const plainPayload = { ...payload, parse_mode: undefined };
      const res2 = await axios.post(url, plainPayload, { timeout: 10000 });
      return res2.data;
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
      lines.push(`WLRRAL: $${fed.reserves.totalTrillions}T ${fed.reserves.signal}`);
    lines.push(`Score: *${fed.trifectaScore}* → ${fed.overallStatus}`);
  }

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
      lines.push(`TOTAL2: $${daily.cmc.total2}T`);
      lines.push(`TOTAL3: $${daily.cmc.total3}B`);
      lines.push(`Others.D: ${daily.cmc.othersDominance}%`);
    }
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
        lines.push(`MSCI EM: ${weekly.msciEm.value} (${weekly.msciEm.direction})`);
      if (weekly.othersDom?.othersDominance)
        lines.push(`OTHERS.D: ${weekly.othersDom.othersDominance}%`);
      if (weekly.ratioTrend?.ethBtc)
        lines.push(`ETH/BTC: ${weekly.ratioTrend.ethBtc.ratio} (${weekly.ratioTrend.ethBtc.direction})`);
    }
  }

  // Monthly
  if (monthly?.cpi && !monthly.cpi.skipped) {
    lines.push('', `📆 *MONTHLY*`);
    lines.push(`CPI: ${monthly.cpi.yoy}% YoY`);
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

  const ts  = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const day = new Date().toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  // Header ringkas untuk prompt
  const header = [
    `📋 *PROMPT ANALISIS — ${day}*`,
    `_${ts} WIB_`,
    `${'─'.repeat(32)}`,
    '',
  ].join('\n');

  const fullText = header + promptText;

  await sendToTelegram(fullText, {
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
