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
  const btcVol     = daily?.crypto?.btc?.volume24hBillion ?? null;
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

  // ── NUPL + SOPR Proxy ─────────────────────────────────────────────────────
  const nupl = daily?.nuplProxy;
  const nuplLine = nupl
    ? `- NUPL proxy: ${nupl.nupl > 0 ? '+' : ''}${nupl.nupl} | zona: ${nupl.nuplZone} | realized price proxy: $${nupl.realizedPriceProxy.toLocaleString('en-US')} | ${nupl.nuplSignal}`
    : `- NUPL proxy: ___`;
  const soprLine = nupl?.sopr != null
    ? `- SOPR proxy (price ratio: $${nupl.currentPrice.toLocaleString('en-US')} / $${nupl.soprAvg30dPrice.toLocaleString('en-US')} 30d avg): ${nupl.sopr} | ${nupl.soprSignal}`
    : `- SOPR proxy: ___`;

  // ── BTC price context ─────────────────────────────────────────────────────
  const ath        = nupl?.ath ?? null;
  const athChg     = nupl?.athChangePct ?? null;
  const ma200      = nupl?.ma200 ?? null;
  const ma200Gap   = nupl?.ma200GapPct ?? null;
  const ma200Sig   = nupl?.ma200Signal ?? null;

  const athLine = ath != null
    ? `- BTC vs ATH: $${ath.toLocaleString('en-US')} | saat ini ${athChg > 0 ? '+' : ''}${athChg}% dari ATH`
    : `- BTC vs ATH: ___`;
  const ma200Line = ma200 != null
    ? `- BTC vs 200d MA: $${ma200.toLocaleString('en-US')} | harga ${ma200Gap > 0 ? '+' : ''}${ma200Gap}% di ${ma200Gap >= 0 ? 'atas' : 'bawah'} MA | ${ma200Sig}`
    : `- BTC vs 200d MA: ___`;

  // ── On-chain / Derivatives ────────────────────────────────────────────────
  const oi     = daily?.btcOI;
  const basis  = daily?.btcBasis;
  const skew   = daily?.optionsSkew;

  const oiLine = oi
    ? `- OI BTC (${oi.exchangeCount} exchanges): $${oi.totalBillion}B | trend: ${oi.trend} [${oi.source}]`
    : `- OI BTC: ___`;

  const basisLine = basis
    ? `- BTC perp premium (basis proxy, annualized): ${basis.annualizedPct}% | raw: ${basis.basisPct}% | signal: ${basis.signal} [${basis.source}, ${basis.exchangeCount} exchanges]`
    : `- BTC perp premium / basis: ___`;

  const skewLine = skew
    ? `- Perp sentiment proxy (funding-based, NOT options skew): ${skew.skewProxy != null ? (skew.skewProxy > 0 ? '+' : '') + skew.skewProxy : '___'} | avg funding 8h: ${skew.avgFunding8h != null ? skew.avgFunding8h + '%' : '___'} | Deribit OI: ${skew.deribitOiBtc}BTC ($${skew.deribitOiUsdBillion}B) | signal: ${skew.signal}`
    : `- Perp sentiment proxy (funding-based): ___`;

  const total2Raw = daily?.cmc?.total2 ?? null;
  const total3Raw = daily?.cmc?.total3 ?? null;
  const stableRaw = daily?.crypto?.stablecoinSupply?.total ?? null;
  const prevWeek  = daily?._prevWeek ?? null;

  // WoW % change helper
  const wowPct = (curr, prev) => {
    if (curr == null || prev == null || prev === 0) return null;
    return parseFloat(((curr - prev) / Math.abs(prev) * 100).toFixed(2));
  };
  const fmtWow = (pct) => {
    if (pct == null) return '';
    const sign = pct > 0 ? '+' : '';
    return ` | WoW: ${sign}${pct}%`;
  };

  const total2WoW = wowPct(total2Raw, prevWeek?.total2_trillion);
  const total3WoW = wowPct(total3Raw, prevWeek?.total3_billion);
  const stableWoW = wowPct(stableRaw, prevWeek?.stablecoin_billion);

  // ── Tier-1 additions ─────────────────────────────────────────────────────
  const ls  = daily?.longShortRatio;
  const hr  = daily?.hashRate;

  // Stablecoin dominance: stablecoin supply / total market cap
  const totalMcapB   = daily?.crypto?.totalMarketCapBillion ?? null;
  const stableDomPct = (stableRaw != null && totalMcapB != null && totalMcapB > 0)
    ? parseFloat((stableRaw / totalMcapB * 100).toFixed(2))
    : null;

  // Realized price multiple (simplified MVRV): current price / 5yr avg realized price proxy
  const realizedMult = (nupl?.currentPrice && nupl?.realizedPriceProxy)
    ? parseFloat((nupl.currentPrice / nupl.realizedPriceProxy).toFixed(2))
    : null;

  // ── Tier-2 additions ─────────────────────────────────────────────────────
  const activeAddr = daily?.activeAddresses;
  const minerRev   = daily?.minerRevenue;
  const piCycle    = daily?.nuplProxy?.piCycle ?? null;

  // ── Tier-3: Google Trends ─────────────────────────────────────────────────
  const gt = (!daily?.googleTrends?.skipped) ? daily?.googleTrends : null;

  const addrLine = activeAddr
    ? `- Active Addresses (7d avg): ${activeAddr.avg7d.toLocaleString('en-US')} | WoW: ${activeAddr.weekChange != null ? (activeAddr.weekChange > 0 ? '+' : '') + activeAddr.weekChange + '%' : '___'} | ${activeAddr.signal}`
    : `- Active Addresses: ___`;

  const minerLine = minerRev
    ? `- Miner Revenue (7d avg): $${minerRev.revMillion}M/day | WoW: ${minerRev.weekChange != null ? (minerRev.weekChange > 0 ? '+' : '') + minerRev.weekChange + '%' : '___'} | ${minerRev.signal}`
    : `- Miner Revenue: ___`;

  const piLine = piCycle
    ? `- Pi Cycle Top: MA111 $${piCycle.ma111.toLocaleString('en-US')} | 2×MA350 $${piCycle.ma350x2.toLocaleString('en-US')} | gap: ${piCycle.gapPct > 0 ? '+' : ''}${piCycle.gapPct}% | ${piCycle.signal}`
    : `- Pi Cycle Top: ___`;

  const lsDetail = ls
    ? (ls.longPct != null
        ? `longs: ${ls.longPct}% / shorts: ${ls.shortPct}%`           // Binance format
        : `users: ${ls.longUsers}L / ${ls.shortUsers}S | taker: ${ls.takerRatio}`) // Gate.io fallback
    : null;
  const lsLine = ls
    ? `- Long/Short Ratio (accounts): ${ls.ratio} | ${lsDetail} | ${ls.signal} [${ls.source}]`
    : `- Long/Short Ratio: ___`;

  const hrLine = hr
    ? `- Hash Rate (7d avg): ${hr.latestEH} EH/s | WoW: ${hr.weekChange != null ? (hr.weekChange > 0 ? '+' : '') + hr.weekChange + '%' : '___'} | ${hr.signal} [${hr.source}]`
    : `- Hash Rate: ___`;

  const trendsLine = gt
    ? `- Google Trends "bitcoin": ${gt.currentValue}/100${gt._fromCache ? ' 💾' : ''} | avg4w: ${gt.avg4w} | WoW: ${gt.weekChange != null ? (gt.weekChange > 0 ? '+' : '') + gt.weekChange : '___'} pts | trend: ${gt.trend} | ${gt.signal}`
    : `- Google Trends "bitcoin": ___ (SERPAPI_API_KEY tidak diset)`;

  const stableDomLine = stableDomPct != null
    ? `- Stablecoin Dominance: ${stableDomPct}% | $${stableRaw}B / $${totalMcapB}B total${fmtWow(stableWoW)}`
    : `- Stablecoin Dominance: ___`;

  const realizedMultLine = realizedMult != null
    ? `- Realized Price Multiple (MVRV proxy): ${realizedMult}x | realized proxy: $${nupl.realizedPriceProxy.toLocaleString('en-US')} | ${realizedMult > 3.5 ? 'overvalued — zona distribusi' : realizedMult > 2.0 ? 'moderat — fase expansion/late' : realizedMult > 1.0 ? 'undervalued ringan — fase akumulasi' : 'sangat undervalued — capitulation'}`
    : `- Realized Price Multiple (MVRV proxy): ___`;

  const total2 = manualOverrides.total2
    ?? (total2Raw != null ? `$${total2Raw}T${fmtWow(total2WoW)}` : null)
    ?? '___';
  const total3 = manualOverrides.total3
    ?? (total3Raw != null ? `$${total3Raw}B${fmtWow(total3WoW)}` : null)
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
| BTC vs 200d MA | < -10% (bearish, fase 0/1) | -10% s/d +20% | > +20% (bullish kuat) |
| BTC vs ATH | < -50% (bear market) | -20% s/d -50% | < -20% (bull market recovery) |
| FCI (NFCI) | > 0.3 | -0.3 s/d 0.3 | < -0.3 |
| DXY | > 104 | 100–104 | < 100 |
| US 10Y Yield | > 4.5% | 4.0–4.5% | < 4.0% |
| Fear & Greed | < 25 | 25–60 | > 60 |
| BTC Funding Rate | < -0.05% | -0.05–0.05% | > 0.05% |
| BTC Exchange Netflow | Inflow besar | Flat | Outflow besar |
| TVL DeFi WoW | < -5% | -5–+5% | > +5% |
| Oil Brent | > $100 | $80–100 | < $80 |
| NUPL proxy | < 0 (capitulation) | 0–0.25 (hope) | > 0.5 (belief/euphoria) |
| SOPR proxy (price ratio) | < 0.85 (selloff tajam) | 0.95–1.05 (netral) | > 1.20 (overextended) |
| Realized Price Multiple (MVRV proxy) | < 1.0x (capitulation) | 1.0–2.0x (akumulasi) | > 3.5x (distribusi) |
| Long/Short Ratio | < 0.6 (shorts dominan) | 0.9–1.2 (netral) | > 1.8 (longs dominan, waspadai squeeze) |
| Hash Rate WoW | < -5% (miner capitulation) | -1% s/d +1% | > +1% (miner confidence naik) |
| Stablecoin Dominance (USDT+USDC only) | > 6% (risk-off tinggi) | 3–6% | < 3% (risk-on) |
| Active Addresses WoW | < -10% (capitulation signal) | -2% s/d +2% | > +2% (adoption naik) |
| Miner Revenue WoW | < -20% (capitulation risk) | -2% s/d +2% | > +2% (miner confidence) |
| Pi Cycle Top gap | > 0% (crossing = top signal) | -10% s/d 0% (bahaya) | < -30% (aman) |
| OI BTC (all exchanges) | Kontraksi tajam | $15–30B | Ekspansi >$30B |
| Basis Rate 3M (ann.) | < 0% (backwardation) | 0–15% | 5–15% (carry positif) |
| Perp Sentiment Proxy (funding-based) | > 10 (fear/shorts dominan) | -3 s/d +10 | < -3 (greed/longs dominan) |
| Google Trends "bitcoin" | > 80 (FOMO ekstrem) | 40–80 | < 20 (bear/capitulation) |

---
## DATA — ${today} | FASE ESTIMASI SAYA: ${faseEstimasi}

### FED LIQUIDITY LAYER ${fedSrc}
${fedBlock}

### DATA HARIAN ✅ live
- BTC price: $${btcPrice} | 24h: ${btcChange}%${btcVol != null ? ` | vol 24h: $${btcVol}B` : ''}
${athLine}
${ma200Line}
- BTC Dominance: ${btcDom}% | arah: ${btcDomDir}
- ETH/BTC: ${ethBtc} | SOL/BTC: ${solBtc}
- DXY: ${dxyVal} | arah: ${dxyDir}
- Gold (XAUUSD): $${goldPrice} | 24h: ${goldChange}%
- Oil Brent: $${oilPrice} | arah: ${oilDir}
- Fear & Greed: ${fgValue} (${fgLabel})
- Funding rate BTC perp: ${btcFunding}% | ETH perp: ${ethFunding}%
- Stablecoin supply: $${totalStable}B${fmtWow(stableWoW)}
${stableDomLine}
- TOTAL2: ${total2} | TOTAL3: ${total3} | OTHERS.D: ${othersDom}%

### DERIVATIF & ON-CHAIN ✅ live
${nuplLine}
${soprLine}
${realizedMultLine}
${piLine}
${addrLine}
${minerLine}
${oiLine}
${basisLine}
${skewLine}
${lsLine}
${hrLine}
${trendsLine}

- War headline (sumber: Google News RSS (Reuters/AP/BBC via GNews)):
  - Timteng: ${warTimteng}
  - Rusia-Ukraine: ${warRusiaUkraine}
  - Taiwan: ${warTaiwan}

### DATA MINGGUAN ${weeklySrc}
- FCI (Chicago Fed NFCI): ${nfci} | vs minggu lalu: ${nfciPrev}
- US 10Y Yield: ${yield10y}% | arah: ${yieldDir}
- ETH/BTC ratio: ${ethBtc} | arah minggu ini: ${v(weekly?.ratioTrend?.ethBtc?.direction)} ${v(weekly?.ratioTrend?.ethBtc?.weekChange, '')}%
- SOL/BTC ratio: ${solBtc} | arah: ${solBtcDir}
- BTC.D arah minggu ini: ${btcDomDir}
- BTC exchange netflow: ${exchangeNetflow}
- Altseason Index: ${altseasonIdx}
- TVL DeFi (DefiLlama): $${tvl}B | vs minggu lalu: ${tvlChg}%
- MSCI EM: ${msciEm} | arah: ${msciDir}

### DATA BULANAN ${monthlySrc}
${monthlyBlock}

---
## KONTEKS PORTFOLIO

UKURAN PORTFOLIO (USD): ${portfolioSize}
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

### 1. STATUS LIKUIDITAS FED
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

### 3. SCORECARD SINYAL

**Layer 0 — Fed Liquidity**
| Indikator | Nilai | vs Threshold | Status | Arah |
|-----------|-------|--------------|--------|------|

**Layer 1 — Macro**
| Indikator | Nilai | vs Threshold | Status | Arah |
|-----------|-------|--------------|--------|------|

**Layer 2 — Market Structure**
| Indikator | Nilai | vs Threshold | Status | Arah |
|-----------|-------|--------------|--------|------|
| BTC vs 200d MA | ${ma200Gap != null ? (ma200Gap > 0 ? '+' : '') + ma200Gap + '%' : '___'} | <-10% bearish, >+20% bullish kuat | | ${ma200Sig ?? '___'} |
| BTC vs ATH | ${athChg != null ? athChg + '%' : '___'} | <-50% bear market, >-20% bull recovery | | |
| BTC vol 24h | ${btcVol != null ? '$' + btcVol + 'B' : '___'} | konteks konfirmasi trend | | |

**Layer 3 — Derivatives & On-chain**
| Indikator | Nilai | vs Threshold | Status | Arah |
|-----------|-------|--------------|--------|------|
| NUPL proxy | ${nupl?.nupl != null ? (nupl.nupl > 0 ? '+' : '') + nupl.nupl : '___'} | <0 capitulation, >0.75 euphoria | | zona: ${nupl?.nuplZone ?? '___'} |
| SOPR proxy (price ratio) | ${nupl?.sopr ?? '___'} | <0.85 selloff tajam, >1.20 overextended | | |
| Realized Price Multiple | ${realizedMult != null ? realizedMult + 'x' : '___'} | <1.0x capitulation, >3.5x distribusi | | |
| Pi Cycle Top gap | ${piCycle ? (piCycle.gapPct > 0 ? '+' : '') + piCycle.gapPct + '%' : '___'} | >0% crossing=top, <-30% aman | | |
| Active Addresses WoW | ${activeAddr?.weekChange != null ? (activeAddr.weekChange > 0 ? '+' : '') + activeAddr.weekChange + '%' : '___'} | <-10% capitulation, >+2% adoption | | ${activeAddr?.trend ?? '___'} |
| Miner Revenue WoW | ${minerRev?.weekChange != null ? (minerRev.weekChange > 0 ? '+' : '') + minerRev.weekChange + '%' : '___'} | <-20% capitulation risk, >+2% bullish | | ${minerRev?.trend ?? '___'} |
| Long/Short Ratio | ${ls?.ratio ?? '___'} | <0.6 shorts dominan, >1.8 longs dominan | | ${ls?.signal ?? '___'} |
| Hash Rate WoW | ${hr?.weekChange != null ? (hr.weekChange > 0 ? '+' : '') + hr.weekChange + '%' : '___'} | <-5% capitulation, >+1% bullish | | ${hr?.trend ?? '___'} |
| Stablecoin Dom. (USDT+USDC) | ${stableDomPct != null ? stableDomPct + '%' : '___'} | >6% risk-off, <3% risk-on | | ${stableWoW != null ? (stableWoW > 0 ? '+' : '') + stableWoW + '% WoW' : '___'} |
| OI BTC | $${oi?.totalBillion ?? '___'}B | ekspansi >$30B, kontraksi <$15B | | ${oi?.trend ?? '___'} |
| Perp Premium (ann.) | ${basis?.annualizedPct ?? '___'}% | >15% overleveraged, <0% backwardation | | |
| Perp Sentiment Proxy | ${skew?.skewProxy != null ? (skew.skewProxy > 0 ? '+' : '') + skew.skewProxy : '___'} | >10 fear/shorts, <-3 greed/longs | | |
| Google Trends "bitcoin" | ${gt ? gt.currentValue + '/100' + (gt._fromCache ? ' 💾' : '') : '___'} | >80 FOMO ekstrem, <20 bear | | ${gt?.trend ?? '___'} |

Status: ✅ bullish / ⚠️ netral / 🔴 bearish

Divergence alert wajib — flag otomatis jika salah satu kondisi berikut terjadi:
- Funding rate dan Fear & Greed menunjukkan arah berlawanan
- BTC Dominance naik tapi TVL DeFi juga naik (alts accumulation senyap)
- NUPL proxy > 0.5 tapi SOPR proxy < 0.95 (holder kaya secara historis, tapi harga di bawah 30d avg → distribusi atau koreksi dalam)
- OI naik tapi Basis Rate negatif (leverage naik di tengah backwardation → sinyal divergen berbahaya)
- Long/Short Ratio > 1.8 tapi Fear & Greed < 40 (positioning bullish tapi sentiment takut → long squeeze probable)
- Perp Sentiment Proxy > 10 tapi Basis Rate positif (perp sentiment bearish tapi basis masih contango → divergen, pasar tidak konsisten)
- Hash Rate turun tajam (WoW < -5%) tapi harga stabil/naik (miner capitulation tersembunyi — sering precede dump)
- Stablecoin Dominance (USDT+USDC) naik WoW tapi TOTAL2 juga naik (money masuk tapi ke stablecoin, bukan risk-on)
- Realized Price Multiple > 3.0x tapi Long/Short Ratio < 1.0 (valuasi stretched, positioning tidak konfirmasi → topping signal)
- Miner Revenue turun tajam (WoW < -20%) tapi Hash Rate stabil (revenue crash bukan karena network, tapi harga jatuh → miner stress)
- Active Addresses turun WoW tapi TOTAL2 naik (harga naik tanpa on-chain adoption → rally tidak sustainable)
- Pi Cycle gap < -10% (mendekati crossing) tapi NUPL < 0.5 (cycle belum mature untuk top — monitor closely)
- BTC harga naik tapi volume 24h turun signifikan vs rata-rata (price discovery tanpa volume konfirmasi → rally lemah, waspadai reversal)
- BTC > +50% di atas 200d MA tapi NUPL < 0.5 (overextended secara price structure tapi holder belum euphoria → mid-cycle stretch, bukan top)
- Google Trends > 80 tapi Fear & Greed < 50 (retail FOMO tapi sentiment crypto belum konfirmasi → bisa false spike)
- Google Trends < 20 tapi BTC price naik (harga naik tanpa retail interest → whale/institutional driven, belum sustainable untuk alt season)

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
    const bvol = daily.crypto.btc?.volume24hBillion;
    lines.push(`  BTC    : $${daily.crypto.btc?.price?.toLocaleString() ?? '___'} (${daily.crypto.btc?.change24h >= 0 ? '+' : ''}${daily.crypto.btc?.change24h ?? '___'}%)${bvol != null ? ` | vol: $${bvol}B` : ''}`);
    if (daily.nuplProxy?.ath != null)
      lines.push(`  ATH    : $${daily.nuplProxy.ath.toLocaleString('en-US')} | dari ATH: ${daily.nuplProxy.athChangePct}%`);
    if (daily.nuplProxy?.ma200 != null)
      lines.push(`  200MA  : $${daily.nuplProxy.ma200.toLocaleString('en-US')} | gap: ${daily.nuplProxy.ma200GapPct > 0 ? '+' : ''}${daily.nuplProxy.ma200GapPct}%`);
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
  if (daily?.crypto?.stablecoinSupply?.total) {
    const stableB    = daily.crypto.stablecoinSupply.total;
    const totalMcapB = daily.crypto.totalMarketCapBillion;
    const dom        = (totalMcapB && totalMcapB > 0) ? ` | Dom: ${parseFloat((stableB / totalMcapB * 100).toFixed(2))}%` : '';
    lines.push(`  Stable : $${stableB}B${dom}`);
  }

  // ── On-chain & Derivatives ──────────────────────────────────────────────
  lines.push('');
  lines.push('ON-CHAIN & DERIVATIF [✅ live]:');
  if (daily?.nuplProxy) {
    const n = daily.nuplProxy;
    const mult = n.currentPrice && n.realizedPriceProxy
      ? parseFloat((n.currentPrice / n.realizedPriceProxy).toFixed(2))
      : null;
    lines.push(`  NUPL   : ${n.nupl > 0 ? '+' : ''}${n.nupl} | zona: ${n.nuplZone}`);
    lines.push(`  SOPR   : ${n.sopr} | realized proxy: $${n.realizedPriceProxy.toLocaleString('en-US')}`);
    if (mult != null) lines.push(`  MVRV*  : ${mult}x | (current $${n.currentPrice.toLocaleString()} / realized $${n.realizedPriceProxy.toLocaleString()})`);
  } else {
    lines.push(`  NUPL/SOPR/MVRV: ___`);
  }
  if (daily?.longShortRatio) {
    const ls = daily.longShortRatio;
    const lsd = ls.longPct != null
      ? `longs: ${ls.longPct}% / shorts: ${ls.shortPct}%`
      : `${ls.longUsers}L / ${ls.shortUsers}S | taker: ${ls.takerRatio}`;
    lines.push(`  L/S    : ${ls.ratio} | ${lsd} — ${ls.signal} (${ls.source})`);
  } else {
    lines.push(`  L/S    : ___`);
  }
  if (daily?.hashRate) {
    const hr = daily.hashRate;
    lines.push(`  HashR  : ${hr.latestEH} EH/s | WoW: ${hr.weekChange != null ? (hr.weekChange > 0 ? '+' : '') + hr.weekChange + '%' : '___'} — ${hr.trend}`);
  } else {
    lines.push(`  HashR  : ___`);
  }
  if (daily?.activeAddresses) {
    const aa = daily.activeAddresses;
    lines.push(`  Addr   : ${aa.avg7d.toLocaleString('en-US')} (7d avg) | WoW: ${aa.weekChange != null ? (aa.weekChange > 0 ? '+' : '') + aa.weekChange + '%' : '___'} — ${aa.trend}`);
  } else {
    lines.push(`  Addr   : ___`);
  }
  if (daily?.minerRevenue) {
    const mr = daily.minerRevenue;
    lines.push(`  Miners : $${mr.revMillion}M/day | WoW: ${mr.weekChange != null ? (mr.weekChange > 0 ? '+' : '') + mr.weekChange + '%' : '___'} — ${mr.trend}`);
  } else {
    lines.push(`  Miners : ___`);
  }
  if (daily?.nuplProxy?.piCycle) {
    const pc = daily.nuplProxy.piCycle;
    lines.push(`  PiCycle: gap ${pc.gapPct > 0 ? '+' : ''}${pc.gapPct}% | MA111 $${pc.ma111.toLocaleString('en-US')} vs 2×MA350 $${pc.ma350x2.toLocaleString('en-US')}`);
  } else {
    lines.push(`  PiCycle: ___`);
  }
  if (daily?.btcOI)
    lines.push(`  OI     : $${daily.btcOI.totalBillion}B | ${daily.btcOI.trend} (${daily.btcOI.exchangeCount} exchanges)`);
  else
    lines.push(`  OI     : ___`);
  if (daily?.btcBasis)
    lines.push(`  Basis  : ${daily.btcBasis.annualizedPct}% ann. — ${daily.btcBasis.signal}`);
  else
    lines.push(`  Basis  : ___`);
  if (daily?.optionsSkew)
    lines.push(`  Skew   : ${daily.optionsSkew.skewProxy != null ? (daily.optionsSkew.skewProxy > 0 ? '+' : '') + daily.optionsSkew.skewProxy : '___'} | funding: ${daily.optionsSkew.avgFunding8h ?? '___'}%`);
  else
    lines.push(`  Skew   : ___`);
  if (daily?.googleTrends && !daily.googleTrends.skipped) {
    const gt = daily.googleTrends;
    lines.push(`  Trends : ${gt.currentValue}/100${gt._fromCache ? ' 💾' : ''} | avg4w: ${gt.avg4w} | WoW: ${gt.weekChange != null ? (gt.weekChange > 0 ? '+' : '') + gt.weekChange + ' pts' : '___'} — ${gt.trend}`);
  } else {
    lines.push(`  Trends : ___ (SERPAPI_API_KEY tidak diset)`);
  }

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
