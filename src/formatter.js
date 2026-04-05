// ============================================
// FORMATTER v2
// Template prompt baru dengan Fed Liquidity Layer
// ============================================

export function formatDashboardPrompt(daily, weekly, monthly, fed, manualOverrides = {}, war = null) {
  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const dayOfWeek  = new Date().getDay();
  const isMonday   = dayOfWeek === 1;
  const isThursday = dayOfWeek === 4;
  const isFriday   = dayOfWeek === 5;
  const isFirstWeek = new Date().getDate() <= 7;

  const showFed     = fed && !fed.skipped;
  const showWeekly  = weekly && !weekly.skipped;
  const showMonthly = monthly && !monthly.skipped;

  // ── Helper ────────────────────────────────────────────────────────────────
  const v  = (x, fb = '___') => (x === null || x === undefined || x?.skipped) ? fb : x;
  const pv = (x, fb = '___') => (x === null || x === undefined || x?.skipped) ? fb : `${x}%`;
  const sign = (n) => n > 0 ? `+${n}` : `${n}`;

  // ── Daily ─────────────────────────────────────────────────────────────────
  const btcPrice   = v(daily?.crypto?.btc?.price);
  const btcChange  = v(daily?.crypto?.btc?.change24h);
  const btcDom     = v(daily?.crypto?.btcDominance);
  const dxyVal     = v(daily?.dxy?.value);
  const dxyDir     = v(daily?.dxy?.direction);
  const goldPrice  = v(daily?.gold?.price);
  const goldChange = v(daily?.gold?.change24h);
  const fgValue    = v(daily?.fearGreed?.value);
  const fgLabel    = v(daily?.fearGreed?.label);
  const btcFunding = v(daily?.funding?.btc);
  const ethFunding = v(daily?.funding?.eth);
  const oilPrice   = v(daily?.brentOil?.price ?? weekly?.oil?.price);

  // War: manual override > auto-fetched > placeholder
  const warTimteng      = (manualOverrides.warTimteng !== 'none' && manualOverrides.warTimteng)
                        || war?.timteng
                        || '[isi manual atau set warTimteng di manualOverrides]';
  const warRusiaUkraine = (manualOverrides.warRusiaUkraine !== 'none' && manualOverrides.warRusiaUkraine)
                        || war?.rusiaUkraine
                        || '[isi manual]';
  const warTaiwan       = (manualOverrides.warTaiwan !== 'none' && manualOverrides.warTaiwan)
                        || war?.taiwan
                        || '[isi manual]';
  const warSource       = war?.source ? `(sumber: ${war.source})` : '(isi manual)';
  const faseEstimasi    = manualOverrides.faseEstimasi    ?? '?';

  // ── Fed Liquidity ─────────────────────────────────────────────────────────
  let fedBlock = '(kosong — bukan Kamis/Jumat atau data belum tersedia)';
  if (showFed) {
    const w  = fed.walcl;
    const r  = fed.rrp;
    const rv = fed.reserves;
    fedBlock = `- Fed Balance Sheet total (WALCL): $${v(w?.totalTrillions)}T
  vs minggu lalu: ${w ? (w.weekChangeBillions > 0 ? 'naik' : 'turun') + ' $' + Math.abs(w.weekChangeBillions) + 'B' : '___'}
- RRP balance (RRPONTSYD): $${v(r?.balanceBillions)}B
  vs minggu lalu: ${r ? (r.weekChangeBillions > 0 ? 'naik' : 'turun') + ' $' + Math.abs(r.weekChangeBillions) + 'B' : '___'}
  trend: ${v(r?.trend)}
- Reserve balances (WLRRAL): $${v(rv?.totalTrillions)}T
  vs minggu lalu: ${rv ? (rv.weekChangeBillions > 0 ? 'naik' : 'turun') + ' $' + Math.abs(rv.weekChangeBillions) + 'B' : '___'}
- Fed trifecta self-assessment: ${v(fed.trifectaScore)} hijau (${v(fed.overallStatus)})`;
  }

  // ── Weekly ────────────────────────────────────────────────────────────────
  const nfci       = v(weekly?.nfci?.value);
  const nfciPrev   = v(weekly?.nfci?.prevWeek);
  const yield10y   = v(weekly?.yield10y?.value);
  const yieldDir   = v(weekly?.yield10y?.direction);
  const ethBtc     = v(weekly?.ratioTrend?.ethBtc?.ratio ?? daily?.crypto?.ethBtcRatio);
  const solBtc     = v(weekly?.ratioTrend?.solBtc?.ratio ?? daily?.crypto?.solBtcRatio);
  const oilWeekChg = v(weekly?.oil?.weekChange ?? daily?.brentOil?.weekChange);
  const oilDir     = v(weekly?.oil?.direction ?? daily?.brentOil?.direction);
  const tvl        = v(weekly?.tvl?.tvl);
  const tvlChg     = v(weekly?.tvl?.changePercent);
  const totalStable = v(daily?.crypto?.stablecoinSupply?.total);
  const msciEm     = v(weekly?.msciEm?.value);
  const msciDir    = v(weekly?.msciEm?.direction);

  // CMC Global Indices (New) — priority: manual > CMC (daily) > weekly > placeholder
  const othersDom  = manualOverrides.othersDManual
                  ?? v(daily?.cmc?.othersDominance)
                  ?? v(weekly?.othersDom?.othersDominance);

  const total2     = manualOverrides.total2
                  ?? (daily?.cmc?.total2 ? `$${daily.cmc.total2}T` : null)
                  ?? '[isi manual: TradingView]';

  const total3     = manualOverrides.total3
                  ?? (daily?.cmc?.total3 ? `$${daily.cmc.total3}B` : null)
                  ?? '[isi manual: TradingView]';

  const btcDomDir  = manualOverrides.btcDominanceDirection
    ?? (weekly?.ratioTrend?.ethBtc
      ? (weekly.ratioTrend.ethBtc.weekChange < -2 ? 'naik' : weekly.ratioTrend.ethBtc.weekChange > 2 ? 'turun' : 'flat')
      : '___');

  const altseasonIdx   = manualOverrides.altseasonIndex   ?? '[isi manual: blockchaincenter.net]';
  const exchangeNetflow = manualOverrides.exchangeNetflow ?? '[isi manual: CryptoQuant]';

  let weeklyBlock = '(kosong — isi manual hari Senin)';
  if (showWeekly) {
    weeklyBlock = `- FCI (Chicago Fed NFCI): ${nfci}  | vs minggu lalu: ${nfciPrev}
- US 10Y Yield: ${yield10y}%  | arah: ${yieldDir}
- ETH/BTC ratio: ${ethBtc}  | posisi vs resistance: [isi manual]
- SOL/BTC ratio: ${solBtc}  | arah: ${v(weekly?.ratioTrend?.solBtc?.direction)}
- BTC.D arah minggu ini: ${btcDomDir}
- BTC exchange netflow: ${exchangeNetflow}
- Stablecoin supply change: $${totalStable}B total
- Altseason Index: ${altseasonIdx}
- TVL DeFi (DefiLlama): $${tvl}B  | vs minggu lalu: ${tvlChg}%
- Oil Brent: $${v(oilPrice)}  | arah: ${oilDir}
- MSCI EM: ${msciEm}  | arah: ${msciDir}
- TOTAL2: ${total2}
- TOTAL3: ${total3}
- OTHERS.D: ${othersDom}%  | arah: [isi manual]`;
  }

  // ── Monthly ───────────────────────────────────────────────────────────────
  const cpiYoy    = v(monthly?.cpi?.yoy);
  const pmiVal    = v(monthly?.pmi?.value);
  const pmiTrend  = v(monthly?.pmi?.trend);
  const fedRateLbl = v(monthly?.fedRate?.label);

  // Global M2 — tampilkan breakdown jika tersedia, fallback ke US M2 saja
  const m2 = monthly?.m2;
  let m2Line;
  if (m2 && !m2.skipped && m2.globalYoY !== null && m2.globalTrillions) {
    m2Line = `- Global M2 YoY growth: ${m2.globalYoY}% | Total: $${m2.globalTrillions}T
  (US: $${m2.us}T ${m2.usYoY !== null ? `[${m2.usYoY}% YoY]` : ''} | CN: $${m2.cn}T ${m2.cnYoY !== null ? `[${m2.cnYoY}% YoY]` : ''} | JP: $${m2.jp}T | EZ: $${m2.ez}T)`;
  } else if (m2 && m2.us) {
    m2Line = `- Global M2 YoY growth: ___ (fallback US M2: $${m2.us}T, ${m2.usYoY}% YoY — CN/JP/EZ gagal fetch)`;
  } else {
    m2Line = `- Global M2 YoY growth: ___`;
  }

  let monthlyBlock = '(kosong — isi manual awal bulan)';
  if (showMonthly) {
    monthlyBlock = `- ISM PMI: ${pmiVal} (${pmi.seriesId} - ${pmi.seriesLabel})  | vs bulan lalu: ${pmiTrend}
- CPI YoY: ${cpiYoy}%
${m2Line}
- Fed rate keputusan terakhir: ${fedRateLbl}`;
  }

  // ── ASSEMBLE ──────────────────────────────────────────────────────────────
  return `Kamu adalah hedge fund analyst untuk crypto portfolio saya.
Gunakan framework 5 fase dengan liquidity hierarchy berikut:
Fed Balance Sheet → RRP → Global M2 → FCI → DXY/10Y → BTC → ETH/Alts
Analisis semua data di bawah dan output dashboard terstruktur.

---
## DATA — ${today} | FASE ESTIMASI SAYA: ${faseEstimasi}

### FED LIQUIDITY LAYER — update Kamis${showFed ? ' ✅' : ''}
${fedBlock}

### DAILY DATA — wajib setiap hari
- BTC price: $${btcPrice}  | 24h: ${btcChange}%
- BTC Dominance: ${btcDom}%  | arah: ${v(daily?.crypto?.btcDominance) !== '___' ? 'lihat_trend' : '___'}
- DXY: ${dxyVal}  | arah: ${dxyDir}
- Gold (XAUUSD): $${goldPrice}  | 24h: ${goldChange}%
- Fear & Greed: ${fgValue} (${fgLabel})
- Funding rate BTC perp: ${btcFunding}%  | ETH perp: ${ethFunding}%
- War headline ${warSource}:
  - Timteng: ${warTimteng}
  - Rusia-Ukraine: ${warRusiaUkraine}
  - Taiwan: ${warTaiwan}

### WEEKLY DATA — isi setiap Senin${showWeekly ? ' ✅' : ''}
${weeklyBlock}

### MONTHLY DATA — isi awal bulan saja${showMonthly ? ' ✅' : ''}
${monthlyBlock}

---
## OUTPUT YANG DIMINTA

**1. FED LIQUIDITY STATUS**
Baca Fed trifecta (jika hari Kamis/Jumat).
Apakah likuiditas dari sumber paling upstream mendukung atau menentang fase saat ini?
Format: [EKSPANSI / KONTRAKSI / MIXED] — alasan singkat.

**2. FASE SAAT INI**
Tentukan fase (0–4) berdasarkan seluruh data.
Confidence: tinggi / sedang / rendah.
Sebutkan 2–3 signal penentu utama.
Apakah fase berubah dari kemarin? Ya/Tidak — alasannya.

**3. SIGNAL SCORECARD**
Tabel per layer — dari upstream ke downstream:
Layer 0 — Fed liquidity:
| Indikator | Value | Status | Arah |
Layer 1 — Macro:
| Indikator | Value | Status | Arah |
Layer 2 — Market structure:
| Indikator | Value | Status | Arah |
Layer 3 — On-chain & crypto:
| Indikator | Value | Status | Arah |
Status: ✅ bullish / ⚠️ netral / 🔴 bearish

**4. KONFLIK SIGNAL**
Adakah indikator yang bertentangan satu sama lain?
Jika ada: mana yang lebih dipercaya dan mengapa?
(Rule: upstream selalu lebih dipercaya dari downstream)

**5. WAR PREMIUM STATUS**
- Timteng: [level risiko: rendah/sedang/tinggi] + dampak ke oil/gold
- Rusia-Ukraine: [update singkat]
- Taiwan: [status]
- Oil sebagai real-time proxy: $${v(oilPrice)}  | threshold alert: $100
- War override aktif?: Ya / Tidak
Jika Ya: action spesifik apa yang harus dilakukan?

**6. ACTION HARI INI**
Maksimal 3 action konkret.
Format:
[HOLD/ADD/TRIM/WAIT/HEDGE] — [aset] — [alasan] — [syarat tambahan jika ada]

**7. YANG DIPANTAU BESOK / MINGGU INI**
- 1 data kritis yang akan keluar (FOMC, PMI, CPI, FRED update)
- 1 level price atau teknikal yang jadi penentu
- 1 war signal yang perlu dimonitor

Gunakan bahasa ringkas. Prioritaskan kejelasan dan actionability di atas segalanya.`;
}

// ── Ringkasan terminal ─────────────────────────────────────────────────────
export function formatDataSummary(daily, weekly, monthly, fed) {
  const lines = ['',
    '═══════════════════════════════════════════',
    '  RINGKASAN DATA YANG BERHASIL DIFETCH',
    '═══════════════════════════════════════════',
  ];

  if (fed && !fed.skipped) {
    lines.push('');
    lines.push('FED LIQUIDITY:');
    const w  = fed.walcl;
    const r  = fed.rrp;
    const rv = fed.reserves;
    if (w && w.totalTrillions != null)
      lines.push(`  WALCL   : $${w.totalTrillions}T (${(w.weekChangeBillions ?? 0) >= 0 ? '+' : ''}${w.weekChangeBillions ?? '?'}B)`);
    else
      lines.push(`  WALCL   : fetch gagal (cek FRED_API_KEY atau series WALCL)`);
    if (r && r.balanceBillions != null)
      lines.push(`  RRP     : $${r.balanceBillions}B (${r.trend ?? '?'})`);
    else
      lines.push(`  RRP     : fetch gagal`);
    if (rv && rv.totalTrillions != null)
      lines.push(`  WLRRAL  : $${rv.totalTrillions}T (${(rv.weekChangeBillions ?? 0) >= 0 ? '+' : ''}${rv.weekChangeBillions ?? '?'}B)`);
    else
      lines.push(`  WLRRAL  : fetch gagal`);
    lines.push(`  Trifecta: ${fed.trifectaScore ?? '0/3'} hijau → ${fed.overallStatus ?? 'UNKNOWN'}`);
  }

  if (daily?.crypto) {
    lines.push('');
    lines.push('DAILY:');
    lines.push(`  BTC    : $${daily.crypto.btc?.price?.toLocaleString()} (${daily.crypto.btc?.change24h > 0 ? '+' : ''}${daily.crypto.btc?.change24h}%)`);
    lines.push(`  ETH    : $${daily.crypto.eth?.price?.toLocaleString()} (${daily.crypto.eth?.change24h > 0 ? '+' : ''}${daily.crypto.eth?.change24h}%)`);
    lines.push(`  BTC.D  : ${daily.crypto.btcDominance}%`);
    lines.push(`  F&G    : ${daily.fearGreed?.value} — ${daily.fearGreed?.label}`);
    lines.push(`  Funding: BTC ${daily.funding?.btc}% | ETH ${daily.funding?.eth}% (${daily.funding?.source || ''})`);
    if (!daily.dxy?.skipped)      lines.push(`  DXY    : ${daily.dxy?.value} (${daily.dxy?.direction})`);
    if (!daily.gold?.skipped)     lines.push(`  Gold   : $${daily.gold?.price} (${daily.gold?.change24h}%)`);
    if (daily.brentOil)           lines.push(`  Oil    : $${daily.brentOil?.price} (${daily.brentOil?.direction})`);
    if (daily.cmc && !daily.cmc.skipped) {
      lines.push(`  TOTAL2 : $${daily.cmc.total2}T`);
      lines.push(`  TOTAL3 : $${daily.cmc.total3}B`);
      lines.push(`  Others.D: ${daily.cmc.othersDominance}%`);
    }
  }

  if (weekly && !weekly.skipped) {
    lines.push('');
    lines.push('WEEKLY:');
    if (weekly.yield10y?.value)       lines.push(`  10Y    : ${weekly.yield10y.value}% (${weekly.yield10y.direction})`);
    if (weekly.nfci?.value)           lines.push(`  NFCI   : ${weekly.nfci.value} (${weekly.nfci.trend})`);
    if (weekly.tvl?.tvl)              lines.push(`  TVL    : $${weekly.tvl.tvl}B (${weekly.tvl.changePercent > 0 ? '+' : ''}${weekly.tvl.changePercent}%)`);
    if (weekly.oil?.price)            lines.push(`  Oil 7d : $${weekly.oil.price} (${weekly.oil.weekChange > 0 ? '+' : ''}${weekly.oil.weekChange}%)`);
    if (weekly.msciEm?.value)         lines.push(`  MSCI EM: ${weekly.msciEm.value} (${weekly.msciEm.direction})`);
    if (weekly.othersDom?.othersDominance) lines.push(`  Others.D: ${weekly.othersDom.othersDominance}%`);
    if (weekly.ratioTrend) {
      lines.push(`  ETH/BTC: ${weekly.ratioTrend.ethBtc?.ratio} (${weekly.ratioTrend.ethBtc?.direction})`);
      lines.push(`  SOL/BTC: ${weekly.ratioTrend.solBtc?.ratio} (${weekly.ratioTrend.solBtc?.direction})`);
    }
  }

  if (monthly?.cpi && !monthly.cpi.skipped) {
    lines.push('');
    lines.push('MONTHLY:');
    lines.push(`  CPI    : ${monthly.cpi.yoy}% YoY`);
    if (!monthly.pmi?.skipped)     lines.push(`  PMI    : ${monthly.pmi.value} (${monthly.pmi.condition})`);
    if (!monthly.fedRate?.skipped) lines.push(`  Fed    : ${monthly.fedRate.label}`);
    if (monthly.m2 && !monthly.m2.skipped) {
      if (monthly.m2.globalTrillions) {
        lines.push(`  G-M2   : $${monthly.m2.globalTrillions}T total | YoY: ${monthly.m2.globalYoY}%`);
        lines.push(`           US $${monthly.m2.us}T | CN $${monthly.m2.cn}T | JP $${monthly.m2.jp}T | EZ $${monthly.m2.ez}T`);
      } else {
        lines.push(`  US M2  : $${monthly.m2.us}T | YoY: ${monthly.m2.usYoY}%`);
      }
    }
  }

  lines.push('', '═══════════════════════════════════════════');
  return lines.join('\n');
}
