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
// Retry untuk transient 429 (rate limit, hormati Retry-After) dan 5xx.
async function sendPayload(webhookUrl, payload, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await axios.post(webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      if (res.status !== 200 && res.status !== 204) {
        throw new Error(`Discord webhook error: HTTP ${res.status}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const transient = status === 429 || status === 502 || status === 503 || status === 504 || !status;
      if (!transient || attempt === maxRetries - 1) throw err;

      // Discord 429 punya Retry-After (detik atau ms tergantung body)
      const retryAfter = err.response?.headers?.['retry-after'];
      const wait = retryAfter
        ? Math.min(parseFloat(retryAfter) * 1000, 15000)
        : Math.min(2000 * Math.pow(2, attempt), 15000);
      console.warn(`  ⚠️  Discord HTTP ${status ?? 'network'}, retry in ${wait}ms (attempt ${attempt + 2}/${maxRetries})`);
      await sleep(wait);
    }
  }
  throw lastErr;
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

// Discord embed field value limit is 1024 chars. Splits long line arrays into
// multiple fields, appending "(2)", "(3)", … to subsequent chunks so users see
// continuation. Preserves line boundaries.
const DISCORD_FIELD_LIMIT = 1024;
function pushFieldChunks(fields, name, lines, inline = false) {
  if (!lines.length) return;
  const chunks = [];
  let buf = '';
  for (const line of lines) {
    const candidate = buf ? buf + '\n' + line : line;
    if (candidate.length > DISCORD_FIELD_LIMIT) {
      if (buf) chunks.push(buf);
      // Single line longer than limit → hard truncate (rare).
      buf = line.length > DISCORD_FIELD_LIMIT ? line.slice(0, DISCORD_FIELD_LIMIT - 1) + '…' : line;
    } else {
      buf = candidate;
    }
  }
  if (buf) chunks.push(buf);
  chunks.forEach((value, i) => {
    fields.push({ name: i === 0 ? name : `${name} (${i + 1})`, value, inline });
  });
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
    const w   = fed.walcl;
    const r   = fed.rrp;
    const rv  = fed.reserves;
    const tg  = fed.tga;
    const hy  = fed.hySpread;
    const yc  = fed.yieldCurve;
    const vx  = fed.vix;
    const lines = [];
    if (w?.totalTrillions  != null) lines.push(`**WALCL**: $${w.totalTrillions}T (${w.weekChangeBillions >= 0 ? '+' : ''}${w.weekChangeBillions}B) ${w.signal}`);
    if (r?.balanceBillions != null) lines.push(`**RRP**: $${r.balanceBillions}B · trend: ${r.trend} ${r.signal}`);
    if (rv?.totalTrillions != null) lines.push(`**WRESBAL**: $${rv.totalTrillions}T ${rv.signal}`);
    lines.push(`**Trifecta**: ${fed.trifectaScore} → ${fed.overallStatus}`);
    pushFieldChunks(fields, '🏦 Fed Liquidity Trifecta', lines, false);

    const stress = [];
    if (tg?.balanceBillions != null) stress.push(`**TGA**: $${tg.balanceBillions}B (Δ${tg.weekChangeBillions >= 0 ? '+' : ''}${tg.weekChangeBillions}B · ${tg.trend}) ${tg.signal}`);
    if (hy?.spreadPct != null)       stress.push(`**HY OAS**: ${hy.spreadPct}% · ${hy.zone} ${hy.signal}`);
    if (yc?.spread != null)          stress.push(`**Yield Curve**: ${yc.spread >= 0 ? '+' : ''}${yc.spread}% · ${yc.zone} ${yc.signal}`);
    if (vx?.value != null)           stress.push(`**VIX**: ${vx.value} · ${vx.zone} ${vx.signal}`);
    if (fed.macroStressScore)        stress.push(`**Stress Score**: ${fed.macroStressScore} merah → ${fed.macroStressLabel}`);
    pushFieldChunks(fields, '📉 Phase 0 Macro Stress', stress, false);
  }

  // WoW helper
  const wowStr = (curr, prev) => {
    if (curr == null || prev == null || prev === 0) return '';
    const pct = ((curr - prev) / Math.abs(prev) * 100).toFixed(2);
    return ` (WoW: ${pct > 0 ? '+' : ''}${pct}%)`;
  };
  const prevWeek = daily?._prevWeek ?? null;

  // Daily crypto
  if (daily?.crypto) {
    const c = daily.crypto;
    const lines = [];
    if (c.btc?.price)       lines.push(`**BTC**: $${c.btc.price.toLocaleString()} (${c.btc.change24h >= 0 ? '+' : ''}${c.btc.change24h}%)`);
    if (c.eth?.price)       lines.push(`**ETH**: $${c.eth.price.toLocaleString()} (${c.eth.change24h >= 0 ? '+' : ''}${c.eth.change24h}%)`);
    if (c.btcDominance)     lines.push(`**BTC.D**: ${c.btcDominance}%`);
    if (daily.fearGreed?.value) lines.push(`**F&G**: ${daily.fearGreed.value} — ${daily.fearGreed.label}`);
    if (daily.funding?.btc != null) lines.push(`**Funding**: BTC ${daily.funding.btc}% · ETH ${daily.funding.eth}% _(${daily.funding.source || ''})_`);
    pushFieldChunks(fields, '💹 Daily', lines, true);
  }

  // Daily macro
  if (daily) {
    const c = daily.crypto;
    const lines = [];
    if (daily.dxy?.value)       lines.push(`**DXY**: ${daily.dxy.value} (${daily.dxy.direction})`);
    if (daily.gold?.price)      lines.push(`**Gold**: $${daily.gold.price} (${daily.gold.change24h >= 0 ? '+' : ''}${daily.gold.change24h}%)`);
    if (daily.brentOil?.price)  lines.push(`**Brent**: $${daily.brentOil.price} (${daily.brentOil.direction})`);
    if (daily.cmc && !daily.cmc.skipped) {
      lines.push(`**TOTAL2**: $${daily.cmc.total2}T${wowStr(daily.cmc.total2, prevWeek?.total2_trillion)}`);
      lines.push(`**TOTAL3**: $${daily.cmc.total3}B${wowStr(daily.cmc.total3, prevWeek?.total3_billion)}`);
      lines.push(`**Others.D**: ${daily.cmc.othersDominance}%`);
    }
    if (c?.stablecoinSupply?.total != null) {
      const dom = (c.totalMarketCapBillion && c.totalMarketCapBillion > 0)
        ? ` · Dom: ${(c.stablecoinSupply.total / c.totalMarketCapBillion * 100).toFixed(2)}%` : '';
      lines.push(`**Stable**: $${c.stablecoinSupply.total}B${dom}${wowStr(c.stablecoinSupply.total, prevWeek?.stablecoin_billion)}`);
    }
    pushFieldChunks(fields, '🌍 Macro', lines, true);
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
    const lines = [];
    if (cm?.exchangeReserve) {
      const er = cm.exchangeReserve;
      const mv = cm.mvrv;
      const rc = cm.realizedCap;
      lines.push(`**Exchange Reserve**: ${(er.current / 1000).toFixed(1)}k BTC · 7d: ${er.change7d > 0 ? '+' : ''}${er.change7d.toLocaleString()} BTC (${er.changePct7d > 0 ? '+' : ''}${er.changePct7d}%) ${er.signal}`);
      if (mv?.value != null) lines.push(`**MVRV (true)**: ${mv.value} · ${mv.zone} ${mv.value > 3.5 ? '🔴' : mv.value > 2.0 ? '⚠️' : '✅'}`);
      if (rc?.valueBillion != null) lines.push(`**Realized Cap**: $${rc.valueBillion}B · MoM: ${rc.growthMoM != null ? (rc.growthMoM >= 0 ? '+' : '') + rc.growthMoM + '%' : '—'} ${rc.growthMoM > 5 ? '✅' : rc.growthMoM > 0 ? '⚠️' : '🔴'}`);
    }
    if (daily?.txVolume?.avg7dBtc != null) {
      const tv   = daily.txVolume;
      const btcPx = daily?.crypto?.btc?.price;
      const mktB  = cm?.mktCapBillion;
      const txUsdB = (tv.avg7dBtc && btcPx) ? parseFloat((tv.avg7dBtc * btcPx / 1e9).toFixed(1)) : null;
      const nvt   = (mktB && txUsdB) ? parseFloat((mktB / txUsdB).toFixed(1)) : null;
      lines.push(`**NVT**: ${nvt ?? '—'} · TxVol: ${tv.avg7dBtc.toLocaleString()} BTC/day ${nvt != null ? (nvt < 50 ? '✅ undervalued' : nvt < 150 ? '⚠️ fair' : nvt < 300 ? '🔴 elevated' : '🔴 sangat tinggi') : ''}`);
    }
    if (daily?.outputVolume?.avg7dBtc != null) {
      const ov = daily.outputVolume;
      lines.push(`**Coin Velocity**: ${ov.avg7dBtc.toLocaleString()} BTC/day · WoW: ${ov.weekChange != null ? (ov.weekChange >= 0 ? '+' : '') + ov.weekChange + '%' : '—'} · ${ov.hodlSignal}`);
    }
    // Phase 3 — Flow Acceleration + DVOL + Funding Streak
    if (cm?.flowAcceleration != null)
      lines.push(`**Flow Accel**: ${cm.flowAcceleration >= 0 ? '+' : ''}${cm.flowAcceleration}% WoW inflow · ${cm.flowAccelSignal}`);
    const dvol3 = daily?.deribitIV;
    if (dvol3)
      lines.push(`**BTC RVol 30d**: ${dvol3.value}% ann · Δ7d: ${dvol3.dayChange >= 0 ? '+' : ''}${dvol3.dayChange} · ${dvol3.zone} ${dvol3.signal.split('—')[0].trim()}`);
    const fs3 = daily?.fundingStreak;
    if (fs3 && fs3.streakDays >= 1)
      lines.push(`**Funding Streak**: ${fs3.streakDays} hari >0.05% · avg7d: ${fs3.avgRate7d ?? '—'}% · ${fs3.signal}`);
    // Phase 4 — Realized P/L + Skew proxy + Stablecoin Growth
    const rc4d = cm?.realizedCap;
    if (rc4d?.growth7d != null)
      lines.push(`**Realized P/L (7d δ)**: ${rc4d.growth7d >= 0 ? '+' : ''}${rc4d.growth7d}% · ${rc4d.realizedPLSignal}`);
    const ba4d = daily?.btcBasis?.annualizedPct ?? null;
    const fu4d = daily?.funding?.btc ?? null;
    if (ba4d != null && fu4d != null) {
      const sk4d = ba4d < 0 ? '🔴 backwardation' : ba4d < 5 && fu4d > 0.05 ? '🔴 diverge Phase 4' : ba4d < 10 && fu4d > 0.03 ? '⚠️ hedging mulai' : ba4d > 15 && fu4d > 0.05 ? '⚠️ Phase 3 late' : '✅ normal';
      lines.push(`**Skew proxy**: basis ${ba4d}% ann · funding ${fu4d}% · ${sk4d}`);
    }
    const sn4d = daily?.crypto?.stablecoinSupply?.total ?? null;
    const sp4d = daily?._prevWeek?.stablecoin_billion ?? null;
    const sg4d = (sn4d != null && sp4d != null && sp4d > 0)
      ? parseFloat(((sn4d - sp4d) / sp4d * 100).toFixed(2)) : null;
    if (sg4d != null)
      lines.push(`**Stable Supply WoW**: ${sg4d >= 0 ? '+' : ''}${sg4d}% · $${sn4d}B · ${sg4d < -1 ? '🔴 rotasi cash' : sg4d > 5 ? '✅ Tether printing' : '⚠️ flat'}`);
    // Phase 2 — CME Premium + L2 TVL
    const cme2d = daily?.btcCmePremium;
    const spot2d = daily?.crypto?.btc?.price;
    const pct2d = (cme2d?.futuresPrice != null && spot2d != null && spot2d > 0)
      ? parseFloat(((cme2d.futuresPrice - spot2d) / spot2d * 100).toFixed(2)) : null;
    if (pct2d != null)
      lines.push(`**CME Premium**: ${pct2d >= 0 ? '+' : ''}${pct2d}% · futures $${cme2d.futuresPrice.toLocaleString()}`);
    const l2_2d = daily?.l2TVL;
    if (l2_2d)
      lines.push(`**L2 TVL**: $${l2_2d.totalBillion}B · ${l2_2d.chains.slice(0, 3).map(c => `${c.name} $${c.tvlBillion}B`).join(' · ')} · ${l2_2d.signal}`);
    if (etf)
      lines.push(`**ETF Flow ⚠️**: ${etf.label} · skor: ${etf.score > 0 ? '+' : ''}${etf.score} ${etf.signal} (${etf.etfsUsed} ETFs, estimasi)`);
    if (nupl) {
      const mult = nupl.currentPrice && nupl.realizedPriceProxy
        ? (nupl.currentPrice / nupl.realizedPriceProxy).toFixed(2) : null;
      lines.push(`**NUPL**: ${nupl.nupl > 0 ? '+' : ''}${nupl.nupl} · ${nupl.nuplZone}${mult ? ` · MVRV proxy: ${mult}x` : ''}`);
      lines.push(`**SOPR**: ${nupl.sopr}`);
    }
    if (pc)
      lines.push(`**Pi Cycle**: gap ${pc.gapPct > 0 ? '+' : ''}${pc.gapPct}% · MA111 $${pc.ma111.toLocaleString('en-US')} vs 2×MA350 $${pc.ma350x2.toLocaleString('en-US')}`);
    if (aa)
      lines.push(`**Active Addr**: ${aa.avg7d.toLocaleString('en-US')} · WoW: ${aa.weekChange != null ? (aa.weekChange > 0 ? '+' : '') + aa.weekChange + '%' : '___'}`);
    if (mr)
      lines.push(`**Miner Rev**: $${mr.revMillion}M/day · WoW: ${mr.weekChange != null ? (mr.weekChange > 0 ? '+' : '') + mr.weekChange + '%' : '___'}`);
    if (ls) {
      const lsDetail = ls.longPct != null
        ? `${ls.longPct}%L / ${ls.shortPct}%S`
        : `${ls.longUsers}L / ${ls.shortUsers}S`;
      lines.push(`**L/S**: ${ls.ratio} (${lsDetail})`);
    }
    if (hr)
      lines.push(`**Hash Rate**: ${hr.latestEH} EH/s · WoW: ${hr.weekChange != null ? (hr.weekChange > 0 ? '+' : '') + hr.weekChange + '%' : '___'}`);
    if (gt)
      lines.push(`**Trends**: ${gt.currentValue}/100${gt._fromCache ? ' 💾' : ''} · avg4w: ${gt.avg4w} · WoW: ${gt.weekChange != null ? (gt.weekChange > 0 ? '+' : '') + gt.weekChange + ' pts' : '___'} — ${gt.signal}`);
    if (oi)
      lines.push(`**OI BTC**: $${oi.totalBillion}B (${oi.trend})`);
    if (basis)
      lines.push(`**Basis**: ${basis.annualizedPct}% ann.`);
    pushFieldChunks(fields, '⛓ On-Chain & Derivatif', lines, false);
  }

  // Weekly
  if (weekly && !weekly.skipped) {
    const lines = [];
    if (weekly.yield10y?.value) lines.push(`**10Y Yield**: ${weekly.yield10y.value}% (${weekly.yield10y.direction})`);
    if (weekly.nfci?.value)     lines.push(`**NFCI**: ${weekly.nfci.value} (${weekly.nfci.trend})`);
    if (weekly.tvl?.tvl)        lines.push(`**DeFi TVL**: $${weekly.tvl.tvl}B (${weekly.tvl.changePercent >= 0 ? '+' : ''}${weekly.tvl.changePercent}%)`);
    if (weekly.oil?.price)      lines.push(`**Oil 7d**: $${weekly.oil.price} (${weekly.oil.weekChange >= 0 ? '+' : ''}${weekly.oil.weekChange}%)`);
    if (weekly.msciEm?.value)   lines.push(`**EEM ETF (MSCI EM proxy)**: $${weekly.msciEm.value} (${weekly.msciEm.direction})`);
    if (weekly.ratioTrend?.ethBtc) lines.push(`**ETH/BTC**: ${weekly.ratioTrend.ethBtc.ratio} (${weekly.ratioTrend.ethBtc.direction})`);
    if (weekly.othersDom?.othersDominance) lines.push(`**OTHERS.D**: ${weekly.othersDom.othersDominance}%`);
    if (weekly.altseason?.value != null) lines.push(`**Altszn**: ${weekly.altseason.value} — ${weekly.altseason.signal}`);
    pushFieldChunks(fields, '📅 Weekly', lines, false);
  }

  // Monthly
  if (monthly?.cpi && !monthly.cpi.skipped) {
    const lines = [];
    lines.push(`**CPI YoY**: ${monthly.cpi.yoy}%`);
    if (!monthly.pmi?.skipped && monthly.pmi?.value != null)     lines.push(`**PMI**: ${monthly.pmi.value} (${monthly.pmi.condition})`);
    if (!monthly.fedRate?.skipped) lines.push(`**Fed Rate**: ${monthly.fedRate.label}`);
    if (monthly.m2?.globalTrillions) lines.push(`**Global M2**: $${monthly.m2.globalTrillions}T · YoY ${monthly.m2.globalYoY}%`);
    pushFieldChunks(fields, '📆 Monthly', lines, false);
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

// ============================================
// STEP 10 — INSIGHT CARD (Decision Engine + AI Insight Engine)
//
// Additive: fungsi baru, TIDAK mengubah fungsi yang sudah ada di atas atau
// jalur produksi (src/index.js). Sama spirit dengan telegram-sender.js's
// formatInsightForTelegram() — field-based embed pola buildDataSummaryEmbed()
// di atas, tapi isinya Step 8/9's output (state/confidence/divergence/risk/
// allocation + Insight JSON dari AI), bukan raw fetch data.
// ============================================

const CONFLICT_EMOJI = { 'Timteng': '🕌', 'Rusia-Ukraine': '⚔️', 'Taiwan': '🇹🇼' };
const RISK_LEVEL_EMOJI = { rendah: '🟢', sedang: '🟡', tinggi: '🔴' };
const ACTION_EMOJI = { HOLD: '⏸', ADD: '➕', TRIM: '✂️', WAIT: '⏳', HEDGE: '🛡' };
const STATE_COLOR = { defensif: 0xE74C3C, moderat: 0xF1C40F, agresif: 0x2ECC71 };
// Same fix as telegram-sender.js's formatInsightForTelegram(): decision.
// geopoliticalFlag uses English region names from providers/geopolitical/
// index.js, but War Premium below uses Indonesian labels for the same regions.
const GEO_REGION_LABEL_ID = { 'Middle East': 'Timteng', 'Russia-Ukraine': 'Rusia-Ukraine', 'Taiwan': 'Taiwan' };

function fmtUSD(n) { return n == null ? '—' : `$${n.toLocaleString('en-US')}`; }

export function buildInsightEmbed(decision, confidence, riskAssessment, allocation, insight) {
  const ts = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const fields = [];

  const confLines = [`**Confidence**: ${confidence.level}`, ...confidence.reasons.slice(0, 3).map(r => `• ${r}`)];
  if (decision.isManualReview) {
    const geoLabels = decision.geopoliticalFlag.map(r => GEO_REGION_LABEL_ID[r] ?? r);
    confLines.push(`⚠️ **MANUAL REVIEW**${geoLabels.length ? ` — geopolitik: ${geoLabels.join(', ')}` : ''}${decision.blockedByDivergence.length ? ` — divergence: ${decision.blockedByDivergence.join(', ')}` : ''}`);
  }
  pushFieldChunks(fields, '📊 State & Confidence', confLines, false);

  pushFieldChunks(fields, '💰 Risk Profile', [
    `**Profile**: ${riskAssessment.riskProfile ?? '—'}`,
    `**Core**: ${riskAssessment.coreBandPct ? `${riskAssessment.coreBandPct.min}-${riskAssessment.coreBandPct.max}%` : '—'} (${fmtUSD(allocation.coreBandUSD?.min)}-${fmtUSD(allocation.coreBandUSD?.max)})`,
    `**High-risk**: ${riskAssessment.highRiskBandPct ? `${riskAssessment.highRiskBandPct.min}-${riskAssessment.highRiskBandPct.max}%` : 'tidak didefinisikan fase ini'} (${allocation.highRiskBandUSD ? `${fmtUSD(allocation.highRiskBandUSD.min)}-${fmtUSD(allocation.highRiskBandUSD.max)}` : '—'})`,
  ], false);

  if (insight.parseFailed) {
    pushFieldChunks(fields, '⚠️ AI Response', [`Gagal di-parse jadi JSON: ${insight.parseError}`, `Raw (truncated): ${insight.rawText.slice(0, 800)}`], false);
    return {
      username: 'Crypto Dashboard',
      embeds: [{
        title: `📊 ${decision.state} (Fase ${decision.legacyPhase ?? '?'})`,
        color: 0x95A5A6,
        fields,
        footer: { text: `${ts} WIB · provider: ${insight.provider} · Step 8+9 Insight Card` },
        timestamp: new Date().toISOString(),
      }],
    };
  }

  const p = insight.parsed;

  if (!insight.valid) {
    pushFieldChunks(fields, '⚠️ Validation Issues', insight.validationIssues, false);
  }

  if (p.warPremium?.length) {
    pushFieldChunks(fields, '🌍 War Premium', p.warPremium.map(w =>
      `${CONFLICT_EMOJI[w.conflict] ?? '🌐'} **${w.conflict}**: ${RISK_LEVEL_EMOJI[w.riskLevel] ?? ''} ${w.riskLevel} — ${w.update}${w.marketImpact ? ` _(${w.marketImpact})_` : ''}`
    ), false);
  }

  if (p.allocation?.length) {
    const allocLines = p.allocation.map(a =>
      `**${a.asset}** (${a.layer}) — ${a.weightPct}%${a.nominalUSD != null ? ` (${fmtUSD(a.nominalUSD)})` : ''} — ${a.reason}`
    );
    allocLines.push(`**CASH** — ${p.cashPct}%${p.cashUSD != null ? ` (${fmtUSD(p.cashUSD)})` : ''}`);
    pushFieldChunks(fields, '📦 Allocation', allocLines, false);
  }

  if (p.hype?.included) {
    pushFieldChunks(fields, '⚡ $HYPE', [`rank ${p.hype.ranking ?? '—'} · ${p.hype.category ?? '—'} — ${p.hype.reason ?? ''}`], false);
  }

  if (p.actionItems?.length) {
    pushFieldChunks(fields, '✅ Action Items', p.actionItems.map(a =>
      `${ACTION_EMOJI[a.action] ?? '•'} **[${a.action}]** ${a.asset} — ${a.reason} _(trigger: ${a.trigger})_`
    ), false);
  }

  if (p.aiCaveat) pushFieldChunks(fields, '⚠️ AI Caveat', [p.aiCaveat], false);

  return {
    username: 'Crypto Dashboard',
    embeds: [{
      title: `📊 ${decision.state} (Fase ${decision.legacyPhase ?? '?'})`,
      description: p.narrative ?? undefined,
      color: STATE_COLOR[riskAssessment.riskProfile] ?? PROVIDER_COLORS.default,
      fields,
      footer: { text: `${ts} WIB · provider: ${insight.provider} · Step 8+9 Insight Card` },
      timestamp: new Date().toISOString(),
    }],
  };
}

// Tidak dipanggil dari index.js — dipicu manual/via script terpisah sampai
// jalur ini sudah cukup teruji live untuk diwire ke produksi.
export async function sendInsightToDiscord(webhookUrl, decision, confidence, riskAssessment, allocation, insight) {
  if (!webhookUrl || webhookUrl.includes('your_discord_webhook')) {
    console.warn('  ⚠️  Discord: DISCORD_WEBHOOK_URL belum diset, skip');
    return { success: false, skipped: true };
  }
  const payload = buildInsightEmbed(decision, confidence, riskAssessment, allocation, insight);
  await sendPayload(webhookUrl, payload);
  console.log('    ✓ Insight card Discord terkirim');
  return { success: true };
}
