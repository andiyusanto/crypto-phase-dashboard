// ============================================
// FORMATTER v5
// Template prompt dengan Fed Liquidity Layer + Portfolio Allocation
// — phase definitions table, threshold reference, structured output sections
// ============================================

export function formatDashboardPrompt(daily, weekly, monthly, fed, manualOverrides = {}, war = null) {
  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const jam = new Date().toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit',
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
  const solBtcDir = v(weekly?.ratioTrend?.solBtc?.direction);
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
  const exchangeNetflow = manualOverrides.exchangeNetflow
    ?? (weekly?.exchangeNetflow?.label ?? '[data tidak tersedia]');

  // ── Monthly ───────────────────────────────────────────────────────────────
  const monthlySrc  = srcLabel(monthly);
  const cpiYoy      = v(monthly?.cpi?.yoy);
  const fedRateLbl  = v(monthly?.fedRate?.label);

  const m2 = monthly?.m2;
  let m2Line;
  if (m2 && !m2.skipped && m2.globalYoY !== null && m2.globalTrillions) {
    m2Line = `- Global M2 YoY growth: ${m2.globalYoY}% | Total: $${m2.globalTrillions}T
  (US: $${m2.us}T ${m2.usYoY !== null ? `${m2.usYoY}% YoY` : ''} | CN: $${m2.cn}T ${m2.cnYoY !== null ? `${m2.cnYoY}% YoY` : ''} | JP: $${m2.jp}T | EZ: $${m2.ez}T)`;
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

  // ── Portfolio Context ─────────────────────────────────────────────────────
  const portfolioSize = manualOverrides.portfolioSize ?? '$1,000';
  const leverageMax   = manualOverrides.leverageMax   ?? 'N/A';

  // ── ASSEMBLE ──────────────────────────────────────────────────────────────
  return `📋 PROMPT ANALISIS — ${today}
${today}, ${jam} WIB
────────────────────────────────
Kamu adalah hedge fund analyst untuk crypto portfolio saya.
Gunakan framework 5 fase dengan liquidity hierarchy berikut:
Fed Balance Sheet → RRP → Global M2 → FCI → DXY/10Y → BTC → ETH/Alts

ATURAN PRIORITAS SIGNAL:
- Upstream selalu lebih dipercaya dari downstream
- Jika data tidak cukup untuk suatu indikator, sebutkan asumsi yang digunakan
- Jangan overconfident: jika signal konflik tanpa resolusi jelas, nyatakan "inconclusive"

---
## DEFINISI FASE

| Fase | Label | Karakteristik Utama |
|------|-------|---------------------|
| 0 | Liquidity Collapse | Risk-off ekstrem, Fed kontraksi, DXY spike, BTC dump |
| 1 | Early Recovery | Likuiditas mulai longgar, akumulasi diam-diam, fear tinggi |
| 2 | Expansion | Risk-on building, FCI loose, BTC leading, alts mulai ikut |
| 3 | Late Cycle | Euphoria, funding rate tinggi, dominance turun, alts outperform |
| 4 | Distribution | Topping signal, whale exit, stablecoin naik, volume divergence |

Perubahan fase hanya valid jika ≥3 signal upstream konfirmasi.

---
## THRESHOLD REFERENSI (untuk konteks historis)

| Indikator | Bearish | Netral | Bullish |
|-----------|---------|--------|---------|
| FCI (NFCI) | > 0.3 | -0.3 s/d 0.3 | < -0.3 |
| DXY | > 104 | 100–104 | < 100 |
| US 10Y Yield | > 4.5% | 4.0–4.5% | < 4.0% |
| Fear & Greed | < 25 | 25–60 | > 60 |
| BTC Funding Rate | < -0.05% | -0.05–0.05% | > 0.05% |
| BTC Exchange Netflow | Inflow besar | Flat | Outflow besar |
| TVL DeFi WoW | < -5% | -5–+5% | > +5% |
| Oil Brent | > $100 | $80–100 | < $80 |

---
## DATA — ${today} | FASE ESTIMASI SAYA: ${faseEstimasi}

### FED LIQUIDITY LAYER ${fedSrc}
${fedBlock}

### DAILY DATA ✅ live
- BTC price: $${btcPrice} | 24h: ${btcChange}%
- BTC Dominance: ${btcDom}% | arah: ${btcDomDir}
- ETH/BTC: ${ethBtc} | SOL/BTC: ${solBtc}
- DXY: ${dxyVal} | arah: ${dxyDir}
- Gold (XAUUSD): $${goldPrice} | 24h: ${goldChange}%
- Oil Brent: $${oilPrice} | arah: ${oilDir}
- Fear & Greed: ${fgValue} (${fgLabel})
- Funding rate BTC perp: ${btcFunding}% | ETH perp: ${ethFunding}%
- Stablecoin supply: $${totalStable}B
- TOTAL2: ${total2} | TOTAL3: ${total3} | OTHERS.D: ${othersDom}%
- War headline (sumber: Google News RSS (Reuters/AP/BBC via GNews)):
  - Timteng: ${warTimteng}
  - Rusia-Ukraine: ${warRusiaUkraine}
  - Taiwan: ${warTaiwan}

### WEEKLY DATA ${weeklySrc}
- FCI (Chicago Fed NFCI): ${nfci} | vs minggu lalu: ${nfciPrev}
- US 10Y Yield: ${yield10y}% | arah: ${yieldDir}
- ETH/BTC ratio: ${ethBtc} | arah minggu ini: ${v(weekly?.ratioTrend?.ethBtc?.direction)} ${v(weekly?.ratioTrend?.ethBtc?.weekChange, '')}%
- SOL/BTC ratio: ${solBtc} | arah: ${solBtcDir}
- BTC.D arah minggu ini: ${btcDomDir}
- BTC exchange netflow: ${exchangeNetflow}
- Altseason Index: ${altseasonIdx}
- TVL DeFi (DefiLlama): $${tvl}B | vs minggu lalu: ${tvlChg}%
- MSCI EM: ${msciEm} | arah: ${msciDir}

### MONTHLY DATA ${monthlySrc}
${monthlyBlock}

---
## PORTFOLIO CONTEXT

PORTFOLIO SIZE (USD): ${portfolioSize}
LEVERAGE MAKS: ${leverageMax}

### INSTRUKSI ALOKASI

- Seluruh alokasi bersifat DINAMIS — tentukan aset, bobot, dan nominal
  berdasarkan kondisi market minggu ini
- Maksimal 4 posisi aktif sekaligus (hindari terlalu terpecah)
- Minimal per posisi: $50 (jangan rekomendasikan posisi di bawah $50)
- Jika fase 0–1: boleh alokasikan sebagian ke stablecoin/cash
- Jika fase 2–3: maksimalkan eksposur sesuai risk profile hasil analisis
- Jika fase 4: kurangi eksposur agresif, geser ke BTC/cash

### KANDIDAT ASET

LAYER 0–1 (CORE / SAFE HAVEN):
- BTC, ETH, Gold (XAU)

LAYER 2 (L1 / HIGH-BETA):
- SOL, AVAX, ALGO

LAYER 3 (DeFi Core):
- LDO, AAVE, UNI, LINK

LAYER 4 (Alts / High-risk):
- Blue-chip alts: MATIC, ARB, OP, DOT
- Speculative: $HYPE
  - hypeRanking: [ranking saat ini, diisi AI]
  - hypeCategory: [DeFi core / High-risk / Meme, diisi AI]
  - hypeReason: [alasan singkat, diisi AI]

### ATURAN RISK PROFILE

riskProfile: [defensif / moderat / agresif — ditentukan AI dari fase]
- Fase 0–1 → defensif: Core ≥ 60%, High-risk ≤ 10%
- Fase 2   → moderat:  Core 40–60%, High-risk ≤ 20%
- Fase 3   → agresif:  Core ≥ 30%, High-risk ≤ 35%
- Fase 4   → defensif: Core ≥ 70%, sisa cash/stablecoin

---
## OUTPUT YANG DIMINTA

### 1. FED LIQUIDITY STATUS
Baca Fed trifecta dan seluruh layer likuiditas upstream.
Apakah likuiditas mendukung atau menentang fase saat ini?
Format: EKSPANSI / KONTRAKSI / MIXED — alasan ≤3 kalimat.

---

### 2. FASE SAAT INI
- Fase: [0–4] — [label]
- Confidence: tinggi / sedang / rendah
- Signal penentu utama (2–3 poin)
- Perubahan dari minggu lalu: Ya / Tidak
  - Jika Ya: signal apa yang trigger perubahan?
  - Jika Tidak: kondisi apa yang harus terpenuhi agar fase berubah?

---

### 3. SIGNAL SCORECARD

**Layer 0 — Fed Liquidity**
| Indikator | Value | vs Threshold | Status | Arah |
|-----------|-------|--------------|--------|------|

**Layer 1 — Macro**
| Indikator | Value | vs Threshold | Status | Arah |
|-----------|-------|--------------|--------|------|

**Layer 2 — Market Structure**
| Indikator | Value | vs Threshold | Status | Arah |
|-----------|-------|--------------|--------|------|

**Layer 3 — On-chain & Crypto**
| Indikator | Value | vs Threshold | Status | Arah |
|-----------|-------|--------------|--------|------|

Status: ✅ bullish / ⚠️ netral / 🔴 bearish

Divergence alert wajib: flag otomatis jika funding rate dan Fear & Greed
menunjukkan arah berlawanan, atau jika BTC dominance naik tapi TVL DeFi
juga naik.

---

### 4. KONFLIK SIGNAL
- Ada konflik?: Ya / Tidak
- Jika Ya:
  - Signal A vs Signal B: [deskripsi konflik]
  - Yang lebih dipercaya: [A/B] — alasan (gunakan rule upstream > downstream)
  - Resolusi: conclusive / inconclusive

---

### 5. WAR PREMIUM STATUS
| Konflik | Level Risiko | Update Singkat | Dampak Market |
|---------|-------------|----------------|---------------|
| Timteng | rendah/sedang/tinggi | ___ | oil/gold |
| Rusia-Ukraine | rendah/sedang/tinggi | ___ | energi/risk-off |
| Taiwan | rendah/sedang/tinggi | ___ | tech/semi |

- warSource: Google News RSS (Reuters/AP/BBC via GNews)
- Oil sebagai real-time proxy: $${oilPrice} | threshold alert: $100
- War override aktif?: Ya / Tidak
  - Jika Ya: aset mana yang paling terdampak dan bagaimana?

---

### 6. RANKING ASET (update berdasarkan data baru)

| Ranking | Aset | Layer | Perubahan | Alasan Singkat |
|---------|------|-------|-----------|----------------|

- $HYPE:
  - hypeRanking: [isi AI]
  - hypeCategory: DeFi core / High-risk / Meme [isi AI]
  - hypeReason: [isi AI — alasan singkat]
- Sebutkan 2–3 faktor utama yang menggerakkan perubahan ranking

---

### 7. RISK PROFILE MINGGU INI
- riskProfile: defensif / moderat / agresif [tentukan AI dari fase]
- Alasan: [2–3 kalimat berdasarkan fase dan signal dominan]

---

### 8. ALLOCATION REKOMENDASI

Berdasarkan riskProfile dan fase minggu ini, tentukan alokasi optimal
untuk portfolio ${portfolioSize}.

| Aset | Layer | Bobot (%) | Nominal ($) | Alasan Singkat |
|------|-------|-----------|-------------|----------------|
| ...  | ...   | ...       | ...         | ...            |
| CASH/USDT | — | ...  | ...         | buffer / wait  |
| **TOTAL** | | **100%** | **${portfolioSize}** | |

Catatan:
- Maksimal 4 posisi aktif
- Minimal $50 per posisi
- Sertakan cash/stablecoin jika kondisi tidak mendukung full deployment

---

### 9. ACTION HARI INI (maks 3)

Format:
[HOLD/ADD/TRIM/WAIT/HEDGE] — [aset] — [alasan singkat] — [syarat/trigger]

---

### 10. WATCHLIST MINGGU INI

| Kategori | Item | Detail | Dampak Jika Terjadi |
|----------|------|--------|---------------------|
| Data Makro | ___ | tanggal rilis | bullish/bearish jika ___ |
| Level Teknikal | ___ | harga/zona | konfirmasi fase jika ___ |
| War Signal | ___ | indikator | override jika ___ |
| Konfirmasi Fase | ___ | kondisi | fase berubah ke ___ jika ___ |

---

Gunakan bahasa ringkas. Prioritaskan kejelasan dan actionability.
Jika ada data yang hilang atau ambigu, nyatakan asumsi secara eksplisit
sebelum melanjutkan analisis.`;
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
