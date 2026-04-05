// ============================================
// DISCORD SENDER
// Kirim fetch data + hasil analisis ke Discord
// via Webhook — tidak perlu bot token/OAuth
//
// Setup Discord Webhook:
// 1. Buka channel Discord yang dituju
// 2. Settings channel → Integrations → Webhooks
// 3. Create Webhook → copy URL
// 4. Set DISCORD_WEBHOOK_URL di .env
//    Format: https://discord.com/api/webhooks/ID/TOKEN
//
// Discord limits:
//   content       : maks 2000 karakter
//   embed.description : maks 4096 karakter
//   total embed chars : maks 6000 per request
//   rate limit    : ~30 req/menit per webhook
// ============================================

import axios from 'axios';

// Discord limits
const DISCORD_CONTENT_MAX  = 1900;  // sedikit di bawah 2000 untuk safety
const DISCORD_EMBED_MAX    = 3800;  // di bawah 4096 per embed
const DISCORD_RATE_DELAY   = 2000;  // ms antar request (stay under 30/min)

// Warna embed per AI provider (format decimal)
const PROVIDER_COLORS = {
  claude:     0xCC785C,  // oranye anthropic
  chatgpt:    0x10A37F,  // hijau openai
  gemini:     0x4285F4,  // biru google
  perplexity: 0x1FB8CD,  // cyan perplexity
  grok:       0x1A1A1A,  // hitam/abu xAI
  data:       0xF0B429,  // kuning untuk data summary
  default:    0x5865F2,  // ungu discord
};

const PROVIDER_NAMES = {
  claude:     'Claude (Anthropic)',
  chatgpt:    'ChatGPT (OpenAI)',
  gemini:     'Gemini (Google)',
  perplexity: 'Perplexity Sonar',
  grok:       'Grok (xAI)',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Helper: split teks panjang menjadi chunks ─────────────────────────────────
function splitText(text, maxLen = DISCORD_EMBED_MAX) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Prioritas split: double newline → newline → spasi
    let cut = maxLen;
    const para = remaining.lastIndexOf('\n\n', maxLen);
    const nl   = remaining.lastIndexOf('\n',   maxLen);
    const sp   = remaining.lastIndexOf(' ',    maxLen);

    if (para > maxLen * 0.6) cut = para + 2;
    else if (nl > maxLen * 0.6) cut = nl + 1;
    else if (sp > maxLen * 0.6) cut = sp + 1;

    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

// ── Helper: strip Markdown Telegram ke Discord Markdown ───────────────────────
// Telegram pakai *bold*, Discord pakai **bold**
// Beberapa karakter escape Telegram tidak perlu di Discord
function convertMarkdown(text) {
  return text
    .replace(/\*([^*]+)\*/g, '**$1**')   // *bold* → **bold**
    .replace(/\_([^_]+)\_/g, '_$1_')     // _italic_ tetap sama
    .replace(/\\\./g, '.')               // hapus escape titik Telegram
    .replace(/\\\-/g, '-')              // hapus escape dash
    .replace(/\\\!/g, '!')              // hapus escape exclamation
    .replace(/\\\(/g, '(')              // hapus escape parenthesis
    .replace(/\\\)/g, ')')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']');
}

// ── Kirim satu payload ke Discord webhook ─────────────────────────────────────
async function sendPayload(webhookUrl, payload) {
  const res = await axios.post(webhookUrl, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  // Discord mengembalikan 204 No Content untuk success
  if (res.status !== 200 && res.status !== 204) {
    throw new Error(`Discord webhook error: HTTP ${res.status}`);
  }
  return res;
}

// ── Kirim teks panjang sebagai beberapa embed ─────────────────────────────────
export async function sendToDiscord(text, options = {}) {
  const {
    webhookUrl,
    title     = '',
    color     = PROVIDER_COLORS.default,
    username  = 'Crypto Dashboard',
    avatarUrl = null,
    label     = '',
    footer    = '',
  } = options;

  if (!webhookUrl || webhookUrl.includes('your_discord_webhook')) {
    throw new Error('DISCORD_WEBHOOK_URL tidak diset di .env');
  }

  const cleanText = convertMarkdown(text);
  const chunks    = splitText(cleanText, DISCORD_EMBED_MAX);
  const total     = chunks.length;

  console.log(`  📤 Mengirim ke Discord${label ? ` (${label})` : ''}: ${total} embed`);

  for (let i = 0; i < chunks.length; i++) {
    const isFirst = i === 0;
    const isLast  = i === chunks.length - 1;

    const embed = {
      description: chunks[i],
      color,
      timestamp: isLast ? new Date().toISOString() : undefined,
    };

    // Title hanya di embed pertama
    if (isFirst && title) embed.title = title.slice(0, 256);

    // Footer hanya di embed terakhir
    if (isLast && footer) embed.footer = { text: footer.slice(0, 2048) };

    // Indikator bagian jika multi-chunk
    if (total > 1) {
      embed.footer = {
        text: `${footer ? footer + ' · ' : ''}Bagian ${i + 1}/${total}`,
      };
    }

    const payload = {
      username,
      embeds: [embed],
    };
    if (avatarUrl) payload.avatar_url = avatarUrl;

    await sendPayload(webhookUrl, payload);
    console.log(`    ✓ Embed ${i + 1}/${total} terkirim`);

    // Rate limit delay antar chunk
    if (i < chunks.length - 1) await sleep(DISCORD_RATE_DELAY);
  }

  return { success: true, chunks: total };
}

// ── Format data summary untuk Discord (rich embed) ───────────────────────────
export function buildDataSummaryEmbed(daily, weekly, monthly, fed) {
  const ts  = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const day = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const fields = [];

  // Fed Liquidity
  if (fed && !fed.skipped) {
    const w  = fed.walcl;
    const r  = fed.rrp;
    const rv = fed.reserves;
    const lines = [];
    if (w?.totalTrillions  != null) lines.push(`**WALCL**: $${w.totalTrillions}T (${w.weekChangeBillions >= 0 ? '+' : ''}${w.weekChangeBillions}B) ${w.signal}`);
    if (r?.balanceBillions != null) lines.push(`**RRP**: $${r.balanceBillions}B · trend: ${r.trend} ${r.signal}`);
    if (rv?.totalTrillions != null) lines.push(`**WLRRAL**: $${rv.totalTrillions}T ${rv.signal}`);
    lines.push(`**Trifecta**: ${fed.trifectaScore} → ${fed.overallStatus}`);
    if (lines.length) fields.push({ name: '🏦 Fed Liquidity', value: lines.join('\n'), inline: false });
  }

  // Daily crypto
  if (daily?.crypto) {
    const c = daily.crypto;
    const lines = [];
    if (c.btc?.price)       lines.push(`**BTC**: $${c.btc.price.toLocaleString()} (${c.btc.change24h >= 0 ? '+' : ''}${c.btc.change24h}%)`);
    if (c.eth?.price)       lines.push(`**ETH**: $${c.eth.price.toLocaleString()} (${c.eth.change24h >= 0 ? '+' : ''}${c.eth.change24h}%)`);
    if (c.btcDominance)     lines.push(`**BTC.D**: ${c.btcDominance}%`);
    if (daily.fearGreed?.value) lines.push(`**F&G**: ${daily.fearGreed.value} — ${daily.fearGreed.label}`);
    if (daily.funding?.btc != null) lines.push(`**Funding**: BTC ${daily.funding.btc}% · ETH ${daily.funding.eth}% _(${daily.funding.source || ''})_`);
    if (lines.length) fields.push({ name: '💹 Daily', value: lines.join('\n'), inline: true });
  }

  // Daily macro
  if (daily) {
    const lines = [];
    if (daily.dxy?.value)       lines.push(`**DXY**: ${daily.dxy.value} (${daily.dxy.direction})`);
    if (daily.gold?.price)      lines.push(`**Gold**: $${daily.gold.price} (${daily.gold.change24h >= 0 ? '+' : ''}${daily.gold.change24h}%)`);
    if (daily.brentOil?.price)  lines.push(`**Brent**: $${daily.brentOil.price} (${daily.brentOil.direction})`);
    if (daily.cmc && !daily.cmc.skipped) {
      lines.push(`**TOTAL2**: $${daily.cmc.total2}T`);
      lines.push(`**TOTAL3**: $${daily.cmc.total3}B`);
      lines.push(`**Others.D**: ${daily.cmc.othersDominance}%`);
    }
    if (lines.length) fields.push({ name: '🌍 Macro', value: lines.join('\n'), inline: true });
  }

  // Weekly
  if (weekly && !weekly.skipped) {
    const lines = [];
    if (weekly.yield10y?.value) lines.push(`**10Y Yield**: ${weekly.yield10y.value}% (${weekly.yield10y.direction})`);
    if (weekly.nfci?.value)     lines.push(`**NFCI**: ${weekly.nfci.value} (${weekly.nfci.trend})`);
    if (weekly.tvl?.tvl)        lines.push(`**DeFi TVL**: $${weekly.tvl.tvl}B (${weekly.tvl.changePercent >= 0 ? '+' : ''}${weekly.tvl.changePercent}%)`);
    if (weekly.oil?.price)      lines.push(`**Oil 7d**: $${weekly.oil.price} (${weekly.oil.weekChange >= 0 ? '+' : ''}${weekly.oil.weekChange}%)`);
    if (weekly.msciEm?.value)   lines.push(`**MSCI EM**: ${weekly.msciEm.value} (${weekly.msciEm.direction})`);
    if (weekly.ratioTrend?.ethBtc) lines.push(`**ETH/BTC**: ${weekly.ratioTrend.ethBtc.ratio} (${weekly.ratioTrend.ethBtc.direction})`);
    if (weekly.othersDom?.othersDominance) lines.push(`**OTHERS.D**: ${weekly.othersDom.othersDominance}%`);
    if (lines.length) fields.push({ name: '📅 Weekly', value: lines.join('\n'), inline: false });
  }

  // Monthly
  if (monthly?.cpi && !monthly.cpi.skipped) {
    const lines = [];
    lines.push(`**CPI YoY**: ${monthly.cpi.yoy}%`);
    if (!monthly.pmi?.skipped)     lines.push(`**PMI**: ${monthly.pmi.value} (${monthly.pmi.condition})`);
    if (!monthly.fedRate?.skipped) lines.push(`**Fed Rate**: ${monthly.fedRate.label}`);
    if (monthly.m2?.globalTrillions) lines.push(`**Global M2**: $${monthly.m2.globalTrillions}T · YoY ${monthly.m2.globalYoY}%`);
    if (lines.length) fields.push({ name: '📆 Monthly', value: lines.join('\n'), inline: false });
  }

  return {
    username: 'Crypto Dashboard',
    embeds: [{
      title: `📊 Data Update — ${day}`,
      color: PROVIDER_COLORS.data,
      fields,
      footer: { text: `${ts} WIB · Auto-fetched by Crypto Dashboard` },
      timestamp: new Date().toISOString(),
    }],
  };
}

// ── Format header analisis untuk Discord ─────────────────────────────────────
export function formatAnalysisHeaderDiscord(provider) {
  const emoji = { claude: '🤖', chatgpt: '🟢', gemini: '✨', perplexity: '🔍' };
  const name  = PROVIDER_NAMES[provider] || provider;
  const ts    = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  return {
    title:  `${emoji[provider] || '🤖'} Analisis ${name}`,
    color:  PROVIDER_COLORS[provider] || PROVIDER_COLORS.default,
    footer: `${ts} WIB`,
  };
}

// ── Kirim data summary ke Discord (rich embed format) ────────────────────────
export async function sendDataSummaryToDiscord(webhookUrl, daily, weekly, monthly, fed) {
  if (!webhookUrl || webhookUrl.includes('your_discord_webhook')) {
    console.warn('  ⚠️  Discord: DISCORD_WEBHOOK_URL belum diset, skip');
    return;
  }

  console.log('  📤 Mengirim data summary ke Discord...');
  const payload = buildDataSummaryEmbed(daily, weekly, monthly, fed);
  await sendPayload(webhookUrl, payload);
  console.log('    ✓ Data summary Discord terkirim');
}

// ── Kirim analisis AI ke Discord ──────────────────────────────────────────────
export async function sendAnalysisToDiscord(webhookUrl, provider, analysisText) {
  if (!webhookUrl || webhookUrl.includes('your_discord_webhook')) {
    console.warn('  ⚠️  Discord: DISCORD_WEBHOOK_URL belum diset, skip');
    return;
  }

  const { title, color, footer } = formatAnalysisHeaderDiscord(provider);
  await sendToDiscord(analysisText, {
    webhookUrl,
    title,
    color,
    footer,
    label: `${PROVIDER_NAMES[provider] || provider} analysis`,
  });
}
