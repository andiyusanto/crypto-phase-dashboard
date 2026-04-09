// ============================================
// FORMATTER v3
// Template prompt dengan Fed Liquidity Layer
// — selalu tampilkan semua section, label sumber data
// ============================================

export function formatDashboardPrompt(daily, weekly, monthly, fed, manualOverrides = {}, war = null) {
  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // ── Helper ────────────────────────────────────────────────────────────────
  const v = (x, fb = '___') => (x === null || x === undefined || x?.skipped) ? fb : x;

  // Source label for section headers
  const srcLabel = (data) => {
    if (!data || data.skipped) return '⚠️ tidak tersedia';
    if (data._fromCache) {
      const d = data._cachedAt ? data._cachedAt.slice(0, 10) : '?';
      return `💾 cache: ${d}`;
    }
    return '✅ live';
  };

  // ── Phase & War ───────────────────────────────────────────────────────────
  const faseEstimasi    = manualOverrides.faseEstimasi ?? '?';
  const warTimteng      = (manualOverrides.warTimteng !== 'none' && manualOverrides.warTimteng)
                        || war?.timteng || '[fetch gagal — isi manual]';
  const warRusiaUkraine = (manualOverrides.warRusiaUkraine !== 'none' && manualOverrides.warRusiaUkraine)
                        || war?.rusiaUkraine || '[fetch gagal — isi manual]';
  const warTaiwan       = (manualOverrides.warTaiwan !== 'none' && manualOverrides.warTaiwan)
                        || war?.taiwan || '[fetch gagal — isi manual]';
  const warSource       = war?.source ? `(sumber: ${war.source})` : '(isi manual)';

  // ── Fed Liquidity ─────────────────────────────────────────────────────────
  const fedSrc = srcLabel(fed);
  const w  = fed?.walcl;
  const r  = fed?.rrp;
  const rv = fed?.reserves;
  const p  = fed?.pmi;

  const pmiMonth = p?.releasedMonth ?? null;
  const pmiLabel = pmiMonth
    ? (() => {
        const [yr, mo] = pmiMonth.split('-');
        return `${new Date(+yr, +mo - 1).toLocaleString('en-US', { month: 'long' })} ${yr}`;
      })()
    : null;
  const pmiSrc = p?._fromCache ? ` 💾` : p ? ` ✅` : '';
  const pmiLine = (p?.manufacturing?.value || p?.services?.value)
    ? `- ISM PMI${pmiLabel ? ` (${pmiLabel})` : ''}${pmiSrc}: Mfg: ${v(p?.manufacturing?.value)} | Svc: ${v(p?.services?.value)}`
    : `- ISM PMI: ___`;

  const fedBlock = `- Fed Balance Sheet (WALCL): $${v(w?.totalTrillions)}T
  vs minggu lalu: ${w ? (w.weekChangeBillions > 0 ? 'naik' : 'turun') + ' $' + Math.abs(w.weekChangeBillions) + 'B' : '___'}
- RRP balance (RRPONTSYD): $${v(r?.balanceBillions)}B
  vs minggu lalu: ${r ? (r.weekChangeBillions > 0 ? 'naik' : 'turun') + ' $' + Math.abs(r.weekChangeBillions) + 'B' : '___'}
  trend: ${v(r?.trend)}
- Reserve balances (WLRRAL): $${v(rv?.totalTrillions)}T
  vs minggu lalu: ${rv ? (rv.weekChangeBillions > 0 ? 'naik' : 'turun') + ' $' + Math.abs(rv.weekChangeBillions) + 'B' : '___'}
${pmiLine}
- Fed trifecta: ${v(fed?.trifectaScore)} hijau (${v(fed?.overallStatus)})`;

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
  const oilDir     = v(daily?.brentOil?.direction ?? weekly?.oil?.direction);

  const total2 = manualOverrides.total2
    ?? (daily?.cmc?.total2 ? `$${daily.cmc.total2}T` : null)
    ?? '___';
  const total3 = manualOverrides.total3
    ?? (daily?.cmc?.total3 ? `$${daily.cmc.total3}B` : null)
    ?? '___';
  const othersDom = manualOverrides.othersDManual
    ?? v(daily?.cmc?.othersDominance)
    ?? v(weekly?.othersDom?.othersDominance);

  // ── Weekly ────────────────────────────────────────────────────────────────
  const weeklySrc = srcLabel(weekly);
  const nfci      = v(weekly?.nfci?.value);
  const nfciPrev  = v(weekly?.nfci?.prevWeek);
  const yield10y  = v(weekly?.yield10y?.value);
  const yieldDir  = v(weekly?.yield10y?.direction);
  const ethBtc    = v(weekly?.ratioTrend?.ethBtc?.ratio ?? daily?.crypto?.ethBtcRatio);
  const solBtc    = v(weekly?.ratioTrend?.solBtc?.ratio ?? daily?.crypto?.solBtcRatio);
  const tvl       = v(weekly?.tvl?.tvl);
  const tvlChg    = v(weekly?.tvl?.changePercent);
  const msciEm    = v(weekly?.msciEm?.value);
  const msciDir   = v(weekly?.msciEm?.direction);
  const totalStable = v(daily?.crypto?.stablecoinSupply?.total);

  const btcDomDir = manualOverrides.btcDominanceDirection
    ?? (weekly?.ratioTrend?.ethBtc
      ? (weekly.ratioTrend.ethBtc.weekChange < -2 ? 'naik' : weekly.ratioTrend.ethBtc.weekChange > 2 ? 'turun' : 'flat')
      : '___');

  const altseasonFetched = weekly?.altseason?.value != null
    ? `${weekly.altseason.value} — ${weekly.altseason.signal}`
    : null;
  const altseasonIdx    = manualOverrides.altseasonIndex ?? altseasonFetched ?? '___';
  const exchangeNetflow = manualOverrides.exchangeNetflow ?? '[isi manual: CryptoQuant]';

  // ── Monthly ───────────────────────────────────────────────────────────────
  const monthlySrc  = srcLabel(monthly);
  const cpiYoy      = v(monthly?.cpi?.yoy);
  const fedRateLbl  = v(monthly?.fedRate?.label);

  const m2 = monthly?.m2;
  let m2Line;
  if (m2 && !m2.skipped && m2.globalYoY !== null && m2.globalTrillions) {
    m2Line = `- Global M2 YoY growth: ${m2.globalYoY}% | Total: $${m2.globalTrillions}T
  (US: $${m2.us}T ${m2.usYoY !== null ? `[${m2.usYoY}% YoY]` : ''} | CN: $${m2.cn}T ${m2.cnYoY !== null ? `[${m2.cnYoY}% YoY]` : ''} | JP: $${m2.jp}T | EZ: $${m2.ez}T)`;
  } else if (m2 && m2.us) {
    m2Line = `- Global M2 YoY growth: ___ (fallback US M2: $${m2.us}T, ${m2.usYoY}% YoY)`;
  } else {
    m2Line = `- Global M2 YoY growth: ___`;
  }

  const ismMfg   = fed?.pmi?.manufacturing?.value;
  const ismSvc   = fed?.pmi?.services?.value;
  const ismMonth = fed?.pmi?.releasedMonth
    ? (() => {
        const [yr, mo] = fed.pmi.releasedMonth.split('-');
        return `${new Date(+yr, +mo - 1).toLocaleString('en-US', { month: 'long' })} ${yr}`;
      })()
    : null;
  const ismLine = (ismMfg || ismSvc)
    ? `- ISM PMI${ismMonth ? ` (${ismMonth})` : ''}${pmiSrc}: Mfg: ${v(ismMfg)} | Svc: ${v(ismSvc)}`
    : `- ISM PMI: ___`;

  const monthlyBlock = [
    ismLine,
    `- CPI YoY: ${cpiYoy}%`,
    m2Line,
    `- Fed rate keputusan terakhir: ${fedRateLbl}`,
  ].join('\n');

  // ── ASSEMBLE ──────────────────────────────────────────────────────────────
  return `Kamu adalah hedge fund analyst untuk crypto portfolio saya.
Gunakan framework 5 fase dengan liquidity hierarchy berikut:
Fed Balance Sheet → RRP → Global M2 → FCI → DXY/10Y → BTC → ETH/Alts
Analisis semua data di bawah dan output dashboard terstruktur.

---
## DATA — ${today} | FASE ESTIMASI SAYA: ${faseEstimasi}

### FED LIQUIDITY LAYER [${fedSrc}]
${fedBlock}

### DAILY DATA [✅ live]
- BTC price: $${btcPrice}  | 24h: ${btcChange}%
- BTC Dominance: ${btcDom}%  | arah: ${btcDomDir}
- ETH/BTC: ${ethBtc}  | SOL/BTC: ${solBtc}
- DXY: ${dxyVal}  | arah: ${dxyDir}
- Gold (XAUUSD): $${goldPrice}  | 24h: ${goldChange}%
- Oil Brent: $${oilPrice}  | arah: ${oilDir}
- Fear & Greed: ${fgValue} (${fgLabel})
- Funding rate BTC perp: ${btcFunding}%  | ETH perp: ${ethFunding}%
- Stablecoin supply: $${totalStable}B
- TOTAL2: ${total2}  | TOTAL3: ${total3}  | OTHERS.D: ${othersDom}%
- War headline ${warSource}:
  - Timteng: ${warTimteng}
  - Rusia-Ukraine: ${warRusiaUkraine}
  - Taiwan: ${warTaiwan}

### WEEKLY DATA [${weeklySrc}]
- FCI (Chicago Fed NFCI): ${nfci}  | vs minggu lalu: ${nfciPrev}
- US 10Y Yield: ${yield10y}%  | arah: ${yieldDir}
- ETH/BTC ratio: ${ethBtc}  | posisi vs resistance: [isi manual]
- SOL/BTC ratio: ${solBtc}  | arah: ${v(weekly?.ratioTrend?.solBtc?.direction)}
- BTC.D arah minggu ini: ${btcDomDir}
- BTC exchange netflow: ${exchangeNetflow}
- Altseason Index: ${altseasonIdx}
- TVL DeFi (DefiLlama): $${tvl}B  | vs minggu lalu: ${tvlChg}%
- MSCI EM: ${msciEm}  | arah: ${msciDir}

### MONTHLY DATA [${monthlySrc}]
${monthlyBlock}

---
## OUTPUT YANG DIMINTA

**1. FED LIQUIDITY STATUS**
Baca Fed trifecta.
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
- Oil sebagai real-time proxy: $${oilPrice}  | threshold alert: $100
- War override aktif?: Ya / Tidak

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

  // ── Fed ──────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(`FED LIQUIDITY [${fed?._fromCache ? `💾 cache: ${fed._cachedAt?.slice(0,10)}` : fed && !fed.skipped ? '✅ live' : '⚠️ tidak tersedia'}]:`);
  const w  = fed?.walcl;
  const r  = fed?.rrp;
  const rv = fed?.reserves;
  const p  = fed?.pmi;

  if (w?.totalTrillions != null)
    lines.push(`  WALCL   : $${w.totalTrillions}T (${(w.weekChangeBillions ?? 0) >= 0 ? '+' : ''}${w.weekChangeBillions ?? '?'}B)`);
  else
    lines.push(`  WALCL   : ___`);

  if (r?.balanceBillions != null)
    lines.push(`  RRP     : $${r.balanceBillions}B (${r.trend ?? '?'})`);
  else
    lines.push(`  RRP     : ___`);

  if (rv?.totalTrillions != null)
    lines.push(`  WLRRAL  : $${rv.totalTrillions}T (${(rv.weekChangeBillions ?? 0) >= 0 ? '+' : ''}${rv.weekChangeBillions ?? '?'}B)`);
  else
    lines.push(`  WLRRAL  : ___`);

  if (p) {
    const mfg = p.manufacturing?.value ?? '___';
    const svc = p.services?.value ?? '___';
    const mo  = p.releasedMonth
      ? (() => { const [yr, mn] = p.releasedMonth.split('-'); return `${new Date(+yr, +mn - 1).toLocaleString('en-US', { month: 'short' })} ${yr}`; })()
      : null;
    const pSrc = p._fromCache ? '💾' : '✅';
    lines.push(`  PMI     : Mfg ${mfg} | Svc ${svc}${mo ? ` (${mo})` : ''} ${pSrc}`);
  } else {
    lines.push(`  PMI     : ___`);
  }

  lines.push(`  Trifecta: ${fed?.trifectaScore ?? '___'} hijau → ${fed?.overallStatus ?? '___'}`);

  // ── Daily ─────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push('DAILY [✅ live]:');
  if (daily?.crypto) {
    lines.push(`  BTC    : $${daily.crypto.btc?.price?.toLocaleString() ?? '___'} (${daily.crypto.btc?.change24h >= 0 ? '+' : ''}${daily.crypto.btc?.change24h ?? '___'}%)`);
    lines.push(`  ETH    : $${daily.crypto.eth?.price?.toLocaleString() ?? '___'} (${daily.crypto.eth?.change24h >= 0 ? '+' : ''}${daily.crypto.eth?.change24h ?? '___'}%)`);
    lines.push(`  BTC.D  : ${daily.crypto.btcDominance ?? '___'}%`);
    lines.push(`  ETH/BTC: ${daily.crypto.ethBtcRatio ?? '___'}  | SOL/BTC: ${daily.crypto.solBtcRatio ?? '___'}`);
    lines.push(`  F&G    : ${daily.fearGreed?.value ?? '___'} — ${daily.fearGreed?.label ?? '___'}`);
    lines.push(`  Funding: BTC ${daily.funding?.btc ?? '___'}% | ETH ${daily.funding?.eth ?? '___'}% (${daily.funding?.source ?? ''})`);
  } else {
    lines.push(`  crypto : ___`);
  }
  lines.push(`  DXY    : ${daily?.dxy?.value ?? '___'} (${daily?.dxy?.direction ?? '___'})`);
  lines.push(`  Gold   : $${daily?.gold?.price ?? '___'} (${daily?.gold?.change24h ?? '___'}%)`);
  lines.push(`  Oil    : $${daily?.brentOil?.price ?? '___'} (${daily?.brentOil?.direction ?? '___'})`);
  if (daily?.cmc && !daily.cmc.skipped) {
    lines.push(`  TOTAL2 : $${daily.cmc.total2}T  | TOTAL3: $${daily.cmc.total3}B  | Others.D: ${daily.cmc.othersDominance}%`);
  } else {
    lines.push(`  CMC    : ___`);
  }
  if (daily?.crypto?.stablecoinSupply?.total)
    lines.push(`  Stable : $${daily.crypto.stablecoinSupply.total}B`);

  // ── Weekly ────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(`WEEKLY [${weekly?._fromCache ? `💾 cache: ${weekly._cachedAt?.slice(0,10)}` : weekly && !weekly.skipped ? '✅ live' : '⚠️ tidak tersedia'}]:`);
  lines.push(`  10Y    : ${weekly?.yield10y?.value ?? '___'}% (${weekly?.yield10y?.direction ?? '___'})`);
  lines.push(`  NFCI   : ${weekly?.nfci?.value ?? '___'} (${weekly?.nfci?.trend ?? '___'})`);
  lines.push(`  TVL    : $${weekly?.tvl?.tvl ?? '___'}B (${weekly?.tvl?.changePercent != null ? (weekly.tvl.changePercent >= 0 ? '+' : '') + weekly.tvl.changePercent : '___'}%)`);
  lines.push(`  MSCI EM: ${weekly?.msciEm?.value ?? '___'} (${weekly?.msciEm?.direction ?? '___'})`);
  lines.push(`  ETH/BTC: ${weekly?.ratioTrend?.ethBtc?.ratio ?? '___'} (${weekly?.ratioTrend?.ethBtc?.direction ?? '___'})`);
  lines.push(`  SOL/BTC: ${weekly?.ratioTrend?.solBtc?.ratio ?? '___'} (${weekly?.ratioTrend?.solBtc?.direction ?? '___'})`);
  if (weekly?.altseason?.value != null)
    lines.push(`  Altszn : ${weekly.altseason.value} — ${weekly.altseason.signal} ✅`);
  else
    lines.push(`  Altszn : ___`);

  // ── Monthly ───────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(`MONTHLY [${monthly?._fromCache ? `💾 cache: ${monthly._cachedAt?.slice(0,10)}` : monthly && !monthly.skipped ? '✅ live' : '⚠️ tidak tersedia'}]:`);
  lines.push(`  CPI    : ${monthly?.cpi?.yoy ?? '___'}% YoY`);
  lines.push(`  Fed    : ${monthly?.fedRate?.label ?? '___'}`);
  if (monthly?.m2?.globalTrillions) {
    lines.push(`  G-M2   : $${monthly.m2.globalTrillions}T total | YoY: ${monthly.m2.globalYoY}%`);
    lines.push(`           US $${monthly.m2.us}T | CN $${monthly.m2.cn}T | JP $${monthly.m2.jp}T | EZ $${monthly.m2.ez}T`);
  } else if (monthly?.m2?.us) {
    lines.push(`  US M2  : $${monthly.m2.us}T | YoY: ${monthly.m2.usYoY}%`);
  } else {
    lines.push(`  G-M2   : ___`);
  }

  lines.push('', '═══════════════════════════════════════════');
  return lines.join('\n');
}
