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
  const v = (x, fb = '—') => (x === null || x === undefined || x?.skipped) ? fb : x;

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
  // war.* may be an object {headline, severity, severityLabel, severityReason}
  // or a legacy string (backwards compat from cached data).
  const faseEstimasi    = manualOverrides.faseEstimasi ?? '?';
  const warField = (region) => {
    const w = war?.[region];
    if (typeof w === 'string') return { headline: w, severity: null, severityLabel: '—' };
    return w || { headline: '[fetch gagal — isi manual]', severity: null, severityLabel: '—' };
  };
  const warFmt = (override, regionKey) => {
    if (override && override !== 'none') return { headline: override, severity: null, severityLabel: 'manual override' };
    return warField(regionKey);
  };
  const warTimtengObj      = warFmt(manualOverrides.warTimteng, 'timteng');
  const warRusiaUkraineObj = warFmt(manualOverrides.warRusiaUkraine, 'rusiaUkraine');
  const warTaiwanObj       = warFmt(manualOverrides.warTaiwan, 'taiwan');
  const warDisplay = (obj) => obj.severity != null
    ? `severity ${obj.severity}/5 (${obj.severityLabel}) — ${obj.headline}`
    : obj.headline;
  const warTimteng      = warDisplay(warTimtengObj);
  const warRusiaUkraine = warDisplay(warRusiaUkraineObj);
  const warTaiwan       = warDisplay(warTaiwanObj);

  // ── Fed Liquidity ─────────────────────────────────────────────────────────
  const fedSrc = srcLabel(fed);
  const w  = fed?.walcl;
  const r  = fed?.rrp;
  const rv = fed?.reserves;
  const p  = fed?.pmi;
  const tg = fed?.tga;
  const hy = fed?.hySpread;
  const yc = fed?.yieldCurve;
  const vx = fed?.vix;

  // Freshness tag — show obs date + flag cache/stale so AI knows publish recency.
  // Stale threshold: >10 hari from today (FRED normally lags ~3-5 hari; >10d = suspect).
  const TODAY = new Date();
  const fedTag = (field) => {
    if (!field || field.skipped) return '';
    const date = field.date;
    if (!date) return field._fromCache ? ' ⚠️ cache' : '';
    const ageDays = Math.floor((TODAY - new Date(date)) / 86400000);
    const cacheMark = field._fromCache ? ' ⚠️ cache' : '';
    const staleMark = ageDays > 10 ? ` ⚠️ stale ${ageDays}d` : '';
    return ` (obs ${date}${cacheMark}${staleMark})`;
  };

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

  const tgaLine = tg
    ? `- TGA (WTREGEN)${fedTag(tg)}: $${tg.balanceBillions}B | Δ${tg.weekChangeBillions >= 0 ? '+' : ''}${tg.weekChangeBillions}B | trend: ${tg.trend} ${tg.signal}`
    : `- TGA (WTREGEN): ___`;
  const hyLine = hy
    ? `- HY Credit Spread (BAMLH0A0HYM2)${fedTag(hy)}: ${hy.spreadPct}% | Δ${hy.dayChange >= 0 ? '+' : ''}${hy.dayChange}% | zona: ${hy.zone} ${hy.signal}`
    : `- HY Credit Spread: ___`;
  const ycLine = yc
    ? `- Yield Curve (10Y-2Y)${fedTag(yc)}: spread ${yc.spread >= 0 ? '+' : ''}${yc.spread}% | 2Y: ${yc.yield2Y}% | 10Y: ${yc.yield10Y}% | ${yc.zone} ${yc.signal}`
    : `- Yield Curve (10Y-2Y): ___`;
  const vixLine = vx
    ? `- VIX${fedTag(vx)}: ${vx.value} | Δ${vx.dayChange >= 0 ? '+' : ''}${vx.dayChange} | zona: ${vx.zone} ${vx.signal}`
    : `- VIX: ___`;

  // Surface skip reasons so AI knows WHY Layer 0 is unavailable (vs silent "—")
  const fedSkipReasons = [
    w?.skipped  ? `WALCL: ${w.reason}`   : null,
    r?.skipped  ? `RRP: ${r.reason}`     : null,
    rv?.skipped ? `WRESBAL: ${rv.reason}` : null,
  ].filter(Boolean);
  const fedDiagnostic = fedSkipReasons.length
    ? `\n- ⚠️  LAYER 0 DIAGNOSTIC: Fed trifecta unavailable — ${fedSkipReasons.join('; ')}. Konsekuensi: rule "perubahan fase butuh ≥3 signal upstream konfirmasi" tidak bisa dieksekusi → downgrade confidence max ke 'sedang' atau 'rendah'.`
    : '';

  const fedBlock = `- Fed Balance Sheet (WALCL)${fedTag(w)}: $${v(w?.totalTrillions)}T
  vs minggu lalu: ${w ? (w.weekChangeBillions > 0 ? 'naik' : 'turun') + ' $' + Math.abs(w.weekChangeBillions) + 'B' : '—'}
- RRP balance (RRPONTSYD)${fedTag(r)}: $${v(r?.balanceBillions)}B
  vs minggu lalu: ${r ? (r.weekChangeBillions > 0 ? 'naik' : 'turun') + ' $' + Math.abs(r.weekChangeBillions) + 'B' : '—'}
  trend: ${v(r?.trend)}
- Reserve balances (WRESBAL)${fedTag(rv)}: $${v(rv?.totalTrillions)}T
  vs minggu lalu: ${rv ? (rv.weekChangeBillions > 0 ? 'naik' : 'turun') + ' $' + Math.abs(rv.weekChangeBillions) + 'B' : '—'}
${pmiLine}
${tgaLine}
${hyLine}
${ycLine}
${vixLine}
- Fed trifecta: ${v(fed?.trifectaScore)} hijau (${v(fed?.overallStatus)})
- Phase 0 macro stress: ${v(fed?.macroStressScore)} merah → ${v(fed?.macroStressLabel)}${fedDiagnostic}`;

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

  const deribitOiStr = skew?.deribitOiBtc != null && skew?.deribitOiUsdBillion != null
    ? `${skew.deribitOiBtc.toLocaleString()} BTC ($${skew.deribitOiUsdBillion}B)`
    : '— (Deribit blocked dari server zone ini)';
  const skewLine = skew
    ? `- Perp sentiment proxy (funding-based, NOT options skew): ${skew.skewProxy != null ? (skew.skewProxy > 0 ? '+' : '') + skew.skewProxy : '—'} | avg funding 8h: ${skew.avgFunding8h != null ? skew.avgFunding8h + '%' : '—'} | Deribit OI: ${deribitOiStr} | signal: ${skew.signal}`
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
    ? `- Active Addresses (7d avg): ${activeAddr.avg7d.toLocaleString('en-US')} | WoW: ${activeAddr.weekChange != null ? (activeAddr.weekChange > 0 ? '+' : '') + activeAddr.weekChange + '%' : '—'} | ${activeAddr.signal}`
    : `- Active Addresses: ___`;

  const minerLine = minerRev
    ? `- Miner Revenue (7d avg): $${minerRev.revMillion}M/day | WoW: ${minerRev.weekChange != null ? (minerRev.weekChange > 0 ? '+' : '') + minerRev.weekChange + '%' : '—'} | ${minerRev.signal}`
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
    ? `- Hash Rate (7d avg): ${hr.latestEH} EH/s | WoW: ${hr.weekChange != null ? (hr.weekChange > 0 ? '+' : '') + hr.weekChange + '%' : '—'} | ${hr.signal} [${hr.source}]`
    : `- Hash Rate: ___`;

  const trendsLine = gt
    ? `- Google Trends "bitcoin": ${gt.currentValue}/100${gt._fromCache ? ' 💾' : ''} | avg4w: ${gt.avg4w} | WoW: ${gt.weekChange != null ? (gt.weekChange > 0 ? '+' : '') + gt.weekChange : '—'} pts | trend: ${gt.trend} | ${gt.signal}`
    : `- Google Trends "bitcoin": ___ (SERPAPI_API_KEY tidak diset)`;

  const stableDomLine = stableDomPct != null
    ? `- Stablecoin Dominance: ${stableDomPct}% | $${stableRaw}B / $${totalMcapB}B total${fmtWow(stableWoW)}`
    : `- Stablecoin Dominance: ___`;

  const realizedMultLine = realizedMult != null
    ? `- Realized Price Multiple (MVRV proxy): ${realizedMult}x | realized proxy: $${nupl.realizedPriceProxy.toLocaleString('en-US')} | ${realizedMult > 3.5 ? 'overvalued — zona distribusi' : realizedMult > 2.0 ? 'moderat — fase expansion/late' : realizedMult > 1.0 ? 'undervalued ringan — fase akumulasi' : 'sangat undervalued — capitulation'}`
    : `- Realized Price Multiple (MVRV proxy): ___`;

  // ── ETF Flow proxy (Yahoo Finance v8 volume-price sentiment) ──────────────────
  const etf = daily?.etfFlow ?? null;
  const etfLine = etf
    ? `- BTC ETF Flow proxy (${etf.etfsUsed} ETFs): ${etf.label} | score: ${etf.score > 0 ? '+' : ''}${etf.score} | ${etf.signal} ${etf.trend} ⚠️ estimasi`
    : null;

  // ── CoinMetrics on-chain (Exchange Reserve + Flow + True MVRV + Phase 1 + Phase 3) ────
  const cm = daily?.coinMetrics ?? null;
  const exRes    = cm?.exchangeReserve ?? null;
  const exFlow   = cm?.exchangeFlow ?? null;
  const mvrvTrue = cm?.mvrv ?? null;
  const rcap     = cm?.realizedCap ?? null;

  // ── Phase 3 — Flow Acceleration + Deribit DVOL + Funding Streak ──────────
  const flAccel = cm?.flowAcceleration ?? null;
  const flAccelLine = flAccel != null
    ? `- Exchange Inflow Acceleration (WoW): ${flAccel >= 0 ? '+' : ''}${flAccel}% | ${cm?.flowAccelSignal ?? '—'}`
    : null;

  const dvol = daily?.deribitIV ?? null;
  const dvolLine = dvol
    ? `- BTC Realized Vol 30d (proxy IV): ${dvol.value}% ann | Δ7d: ${dvol.dayChange >= 0 ? '+' : ''}${dvol.dayChange} | zona: ${dvol.zone} | ${dvol.signal} [${dvol.source}]`
    : null;

  const fStreak = daily?.fundingStreak ?? null;
  const fStreakLine = fStreak
    ? `- Funding Rate Streak (>0.05%): ${fStreak.streakDays} hari berturut-turut | avg7d: ${fStreak.avgRate7d ?? '—'}% | ${fStreak.signal}`
    : null;

  // ── Phase 2 — BTC CME Premium + L2 TVL ───────────────────────────────────
  const cme          = daily?.btcCmePremium ?? null;
  const spotPxForCme = daily?.crypto?.btc?.price ?? null;
  const cmePremiumPct = (cme?.futuresPrice != null && spotPxForCme != null && spotPxForCme > 0)
    ? parseFloat(((cme.futuresPrice - spotPxForCme) / spotPxForCme * 100).toFixed(2))
    : null;
  const cmePremiumSignal = cmePremiumPct == null ? null
    : cmePremiumPct > 5  ? '⚠️ premium sangat tinggi — Phase 3 overheated'
    : cmePremiumPct > 2  ? '✅ institutional bullish — Phase 2 ekspansi'
    : cmePremiumPct > 0  ? '✅ normal contango'
    : cmePremiumPct > -1 ? '⚠️ flat/backwardation ringan'
    :                      '🔴 backwardation — institutional short, Phase 4/0';
  const cmeLine = (cme?.futuresPrice != null && cmePremiumPct != null)
    ? `- BTC CME Futures Premium (Phase 2): $${cme.futuresPrice.toLocaleString()} futures | spot $${spotPxForCme?.toLocaleString()} | premium: ${cmePremiumPct >= 0 ? '+' : ''}${cmePremiumPct}% | ${cmePremiumSignal} [${cme.source}]`
    : null;

  const l2  = daily?.l2TVL ?? null;
  const l2Line = l2
    ? `- L2 TVL (Phase 2, DefiLlama): Total $${l2.totalBillion}B | ${l2.chains.map(c => `${c.name} $${c.tvlBillion}B`).join(' | ')} | dominant: ${l2.dominantChain} | ${l2.signal}`
    : null;

  // ── Phase 4 — Realized P/L Ratio + Options Skew proxy + Stablecoin Growth ──

  // Indicator 17: Realized Cap 7d rate-of-change (P/L ratio proxy)
  const rcapPL    = rcap ?? null;
  const rcapPLLine = rcapPL?.growth7d != null
    ? `- Realized Cap Growth Rate (7d): ${rcapPL.growth7d >= 0 ? '+' : ''}${rcapPL.growth7d}% | MoM: ${rcapPL.growthMoM != null ? (rcapPL.growthMoM >= 0 ? '+' : '') + rcapPL.growthMoM + '%' : '—'} | ${rcapPL.realizedPLSignal}`
    : null;

  // Indicator 18: Phase 4 skew proxy via basis-funding divergence
  // Deribit API blocked by ISP; using basis-funding spread as institutional hedging signal
  // High basis + dropping funding = longs locked via futures, smart money distributing
  const basisAnn  = daily?.btcBasis?.annualizedPct ?? null;
  const fundBtc   = daily?.funding?.btc ?? null;
  const p4SkewSignal = (basisAnn != null && fundBtc != null)
    ? (basisAnn < 0             ? '🔴 backwardation — institutional short/hedge, exit signal'
    : basisAnn < 5 && fundBtc > 0.05 ? '🔴 basis-funding diverge — puts premium implied, Phase 4 distribusi'
    : basisAnn < 10 && fundBtc > 0.03 ? '⚠️ basis melemah — institutional hedging mulai'
    : basisAnn > 15 && fundBtc > 0.05 ? '⚠️ contango + funding tinggi — Phase 3 late'
    :                                    '✅ normal')
    : null;
  const p4SkewLine = (basisAnn != null && fundBtc != null)
    ? `- Options Skew proxy (basis-funding): basis ${basisAnn != null ? basisAnn + '% ann' : '—'} | funding ${fundBtc != null ? fundBtc + '%' : '—'}/8h | ${p4SkewSignal} ⚠️ proxy (Deribit blocked)`
    : null;

  // Indicator 20: Stablecoin supply growth rate — WoW % change
  const stableNowP4  = daily?.crypto?.stablecoinSupply?.total ?? null;
  const stablePrevP4 = daily?._prevWeek?.stablecoin_billion ?? null;
  const stableGrowth7d = (stableNowP4 != null && stablePrevP4 != null && stablePrevP4 > 0)
    ? parseFloat(((stableNowP4 - stablePrevP4) / stablePrevP4 * 100).toFixed(2))
    : null;
  const stableGrowthSignal = stableGrowth7d == null ? null
    : stableGrowth7d > 5   ? '✅ Tether printing — incoming demand, bullish Phase 1/2'
    : stableGrowth7d > 2   ? '✅ supply naik — demand building'
    : stableGrowth7d > -1  ? '⚠️ flat/stagnant'
    :                        '🔴 supply kontraksi — rotasi ke cash, Phase 4 signal';
  const stableGrowthLine = stableGrowth7d != null
    ? `- Stablecoin Supply Growth (WoW): ${stableGrowth7d >= 0 ? '+' : ''}${stableGrowth7d}% | $${stableNowP4}B | ${stableGrowthSignal}`
    : null;

  const exResLine = exRes
    ? `- BTC Exchange Reserve: ${(exRes.current / 1000).toFixed(1)}k BTC | 7d: ${exRes.change7d > 0 ? '+' : ''}${exRes.change7d.toLocaleString()} BTC (${exRes.changePct7d > 0 ? '+' : ''}${exRes.changePct7d}%) | ${exRes.signal} ${exRes.trend}`
    : `- BTC Exchange Reserve: — [CoinMetrics]`;

  const exFlowLine = exFlow
    ? `- BTC Exchange Flow (daily): inflow ${exFlow.inflow.toLocaleString()} BTC | outflow ${exFlow.outflow.toLocaleString()} BTC | net: ${exFlow.netflow > 0 ? '+' : ''}${exFlow.netflow.toLocaleString()} BTC (${exFlow.label})`
    : null;

  // True MVRV — prefer CoinMetrics; fallback to proxy (realizedMult)
  const mvrvTrueLine = mvrvTrue?.value != null
    ? `- MVRV Ratio (true, CoinMetrics): ${mvrvTrue.value} | zona: ${mvrvTrue.zone} | ${mvrvTrue.signal}`
    : null;

  // ── Phase 1 — Realized Cap + NVT + Miner Pressure + HODL Proxy ──────────────
  const rcapLine = rcap?.valueBillion != null
    ? `- Realized Cap: $${rcap.valueBillion}B | MoM growth: ${rcap.growthMoM != null ? (rcap.growthMoM >= 0 ? '+' : '') + rcap.growthMoM + '%' : '—'} | ${rcap.signal}`
    : null;

  // NVT = Market Cap (USD) / Daily TX Volume (USD)
  // mktCapBillion from CoinMetrics, txVolume (BTC/day) from Blockchain.info, priced in USD
  const btcPriceForNvt  = daily?.crypto?.btc?.price ?? null;
  const txVolBtc        = daily?.txVolume?.avg7dBtc ?? null;
  const mktCapBillionCm = cm?.mktCapBillion ?? null;
  const txVolUsdBillion = (txVolBtc != null && btcPriceForNvt != null)
    ? parseFloat((txVolBtc * btcPriceForNvt / 1e9).toFixed(1)) : null;
  const nvtRatio = (mktCapBillionCm != null && txVolUsdBillion != null && txVolUsdBillion > 0)
    ? parseFloat((mktCapBillionCm / txVolUsdBillion).toFixed(1)) : null;
  // Threshold updated for modern BTC (post-2021): off-chain trading (CEX, L2, Lightning)
  // depresses on-chain TX volume, inflating NVT vs legacy 2017-era thresholds (35/65/90).
  // Use NVT in conjunction with MVRV — divergence (NVT high, MVRV fair) suggests off-chain shift, not real distribusi.
  const nvtSignal = nvtRatio == null ? null
    : nvtRatio < 50  ? '✅ undervalued relative to network usage (Phase 1 akumulasi)'
    : nvtRatio < 150 ? '⚠️ fair value (modern range)'
    : nvtRatio < 300 ? '🔴 elevated — overvalued atau on-chain TX shifting off-chain (cross-check MVRV)'
    :                  '🔴 sangat tinggi — Phase 3/4 distribusi atau ekstrem off-chain shift';
  const nvtLine = nvtRatio != null
    ? `- NVT Signal: ${nvtRatio} | TX vol 7d avg: ${txVolBtc?.toLocaleString()} BTC/day | ${nvtSignal}`
    : null;

  // Miner pressure (Phase 1): miner revenue week-over-week signal
  const minerRevPhase1 = daily?.minerRevenue ?? null;
  const minerRevP1Line = minerRevPhase1
    ? `- Miner Revenue (Phase 1 stress): $${minerRevPhase1.revMillion}M/day avg 7d | trend: ${minerRevPhase1.trend} (WoW: ${minerRevPhase1.weekChange != null ? (minerRevPhase1.weekChange >= 0 ? '+' : '') + minerRevPhase1.weekChange + '%' : '—'}) | ${minerRevPhase1.signal}`
    : null;

  // HODL proxy: output volume trend (falling velocity = more HODLing)
  const outVol = daily?.outputVolume ?? null;
  const outVolLine = outVol
    ? `- Coin Velocity proxy (output vol): ${outVol.avg7dBtc?.toLocaleString()} BTC/day avg 7d | WoW: ${outVol.weekChange != null ? (outVol.weekChange >= 0 ? '+' : '') + outVol.weekChange + '%' : '—'} | ${outVol.hodlSignal}`
    : null;

  // Exchange netflow label: prefer daily CoinMetrics, fallback to weekly CoinMetrics
  const exchangeNetflowLabel = exFlow?.label ?? weekly?.exchangeNetflow?.label ?? '[data tidak tersedia]';

  const total2 = manualOverrides.total2
    ?? (total2Raw != null ? `$${total2Raw}T${fmtWow(total2WoW)}` : null)
    ?? '—';
  const total3 = manualOverrides.total3
    ?? (total3Raw != null ? `$${total3Raw}B${fmtWow(total3WoW)}` : null)
    ?? '—';
  const othersDom = manualOverrides.othersDManual
    ?? v(daily?.cmc?.othersDominance)
    ?? v(weekly?.othersDom?.othersDominance);

  // ── Weekly ────────────────────────────────────────────────────────────────
  const weeklySrc = srcLabel(weekly);
  const nfci      = v(weekly?.nfci?.value);
  const nfciPrev  = v(weekly?.nfci?.prevWeek);
  const yield10y  = v(weekly?.yield10y?.value);
  const yieldDir  = v(weekly?.yield10y?.direction);
  const ethBtc     = v(weekly?.ratioTrend?.ethBtc?.ratio  ?? daily?.crypto?.ethBtcRatio);
  const solBtc     = v(weekly?.ratioTrend?.solBtc?.ratio  ?? daily?.crypto?.solBtcRatio);
  const avaxBtc    = v(weekly?.ratioTrend?.avaxBtc?.ratio ?? daily?.crypto?.avaxBtcRatio);
  const xrpBtc     = v(weekly?.ratioTrend?.xrpBtc?.ratio  ?? daily?.crypto?.xrpBtcRatio);

  // Direction with 24h fallback when weekly ratioTrend unavailable.
  // Approximation: alt 24h chg − BTC 24h chg, labeled "(24h proxy)" so AI knows it's not weekly.
  const dirFromDailyDiff = (altChg, btcChg) => {
    if (altChg == null || btcChg == null) return null;
    const diff = altChg - btcChg;
    return diff > 1 ? 'naik (24h proxy)' : diff < -1 ? 'turun (24h proxy)' : 'flat (24h proxy)';
  };
  const btcChg24h = daily?.crypto?.btc?.change24h ?? null;
  const ethBtcDir  = v(weekly?.ratioTrend?.ethBtc?.direction  ?? dirFromDailyDiff(daily?.crypto?.eth?.change24h,  btcChg24h));
  const solBtcDir  = v(weekly?.ratioTrend?.solBtc?.direction  ?? dirFromDailyDiff(daily?.crypto?.sol?.change24h,  btcChg24h));
  const avaxBtcDir = v(weekly?.ratioTrend?.avaxBtc?.direction ?? dirFromDailyDiff(daily?.crypto?.avax?.change24h, btcChg24h));
  const xrpBtcDir  = v(weekly?.ratioTrend?.xrpBtc?.direction  ?? dirFromDailyDiff(daily?.crypto?.xrp?.change24h,  btcChg24h));
  const tvl       = v(weekly?.tvl?.tvl);
  const tvlChg    = v(weekly?.tvl?.changePercent);
  const msciEm    = v(weekly?.msciEm?.value);
  const msciDir   = v(weekly?.msciEm?.direction);
  const totalStable = v(daily?.crypto?.stablecoinSupply?.total);

  // BTC.D direction: prefer 7-day snapshot delta. Fallback: 24h proxy from BTC outperformance vs alts.
  const prevDom   = daily?._prevWeek?.btc_dominance ?? null;
  const currDom   = daily?.crypto?.btcDominance ?? null;
  const domDelta  = (prevDom != null && currDom != null) ? parseFloat((currDom - prevDom).toFixed(2)) : null;
  // 24h proxy: avg alt outperformance vs BTC. If BTC > alt avg, BTC.D rising.
  const btcDomDirFromDaily = (() => {
    const btcChg = daily?.crypto?.btc?.change24h;
    const alts = [
      daily?.crypto?.eth?.change24h,
      daily?.crypto?.sol?.change24h,
      daily?.crypto?.avax?.change24h,
      daily?.crypto?.xrp?.change24h,
    ].filter(x => x != null);
    if (btcChg == null || alts.length === 0) return null;
    const altAvg = alts.reduce((s, x) => s + x, 0) / alts.length;
    const diff = btcChg - altAvg;
    return diff > 0.5 ? 'naik (24h proxy)' : diff < -0.5 ? 'turun (24h proxy)' : 'flat (24h proxy)';
  })();
  const btcDomDir = manualOverrides.btcDominanceDirection
    ?? (domDelta != null
      ? (domDelta > 0.3 ? 'naik' : domDelta < -0.3 ? 'turun' : 'flat')
      : btcDomDirFromDaily ?? '—');
  const btcDomDeltaStr = domDelta != null ? ` (${domDelta > 0 ? '+' : ''}${domDelta}% WoW)` : '';

  // Two altseason measurements use different methodologies:
  // - Real (blockchaincenter.net): % of top-50 alts outperforming BTC over 90 days — historical/structural
  // - Proxy: 4-coin BTC ratio momentum (ETH/SOL/AVAX/XRP) + OTHERS.D — short-term/leading
  // Real is primary benchmark; proxy serves as faster-moving cross-check.
  const proxy = weekly?.altseasonProxy;
  const altseasonFetched = weekly?.altseason?.value != null
    ? `${weekly.altseason.value} — ${weekly.altseason.signal} [90d, blockchaincenter]${proxy ? ` | short-term proxy: ${proxy.value} (${proxy.signal}) [4-coin BTC ratio]` : ''}`
    : proxy?.value != null
      ? `${proxy.value} — ${proxy.signal} ⚠️ proxy only [4-coin BTC ratio, real index unavailable]`
      : null;
  const altseasonIdx = manualOverrides.altseasonIndex ?? altseasonFetched ?? '—';
  const exchangeNetflow = manualOverrides.exchangeNetflow ?? exchangeNetflowLabel;

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
    m2Line = `- Global M2 YoY growth: — (fallback US M2: $${m2.us}T, ${m2.usYoY}% YoY)`;
  } else {
    m2Line = `- Global M2 YoY growth: —`;
  }

  // Global M2 scorecard signal — used in Layer 1 pre-filled row
  const m2YoY    = m2?.globalYoY ?? m2?.usYoY ?? null;
  const m2Total  = m2?.globalTrillions != null ? `$${m2.globalTrillions}T` : (m2?.us ? `$${m2.us}T (US)` : '—');
  const m2Signal = m2YoY == null ? '—'
    : m2YoY > 5  ? '✅'
    : m2YoY > 0  ? '⚠️'
    : '🔴';
  const m2Trend  = m2YoY == null ? '—'
    : m2YoY > 5  ? 'ekspansif kuat'
    : m2YoY > 0  ? 'ekspansif moderat'
    : 'kontraktif';

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
- **Confidence calibration:** Jika Layer 0 (Fed trifecta WALCL/RRP/Reserves) DATA_UNAVAILABLE atau ≤1/3 hijau, downgrade max confidence ke "sedang". Jika ditambah lagi konflik antar Layer 1–3 yang tidak terselesaikan, downgrade ke "rendah". Confidence "tinggi" hanya valid jika ≥2/3 Layer 0 hijau DAN ≥70% Layer 1–3 searah.
- **Data freshness (Layer 0):** Setiap indikator Fed punya label \`(obs YYYY-MM-DD)\` = tanggal observasi FRED. FRED update Kamis, lag normal 3–7 hari. Aturan:
  - Indikator dengan marker \`⚠️ cache\` = fresh fetch gagal, pakai cache last-known-good. Treat as "asumsi belum berubah dari obs date".
  - Indikator dengan marker \`⚠️ stale Nd\` (N > 10 hari dari hari ini) = data kemungkinan tidak mencerminkan kondisi market terkini.
  - Jika ≥1 indikator Layer 0 punya \`⚠️ cache\` ATAU \`⚠️ stale\`, downgrade max confidence ke "sedang".
  - Jika ≥2 indikator Layer 0 punya marker tersebut, downgrade ke "rendah" + flag eksplisit di output: "Layer 0 partially stale, fase classification probabilistic".
  - Cek juga konsistensi tanggal — kalau semua Fed indikator > 14 hari old, bisa jadi indikasi FRED API broken / API key expired (cek operasional sebelum trust analysis).${manualOverrides.sanityAlert ? '\n\n' + manualOverrides.sanityAlert : ''}

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
| Global M2 YoY | < 0% (kontraktif) | 0–5% | > 5% (ekspansif kuat, 6–12 bln lead BTC) |
| FCI (NFCI) | > 0.3 | -0.3 s/d 0.3 | < -0.3 |
| DXY | > 104 | 100–104 | < 100 |
| US 10Y Yield | > 4.5% | 4.0–4.5% | < 4.0% |
| Fear & Greed | < 25 | 25–60 | > 60 |
| BTC Funding Rate | < -0.05% | -0.05–0.05% | > 0.05% |
| BTC Exchange Netflow | Inflow besar | Flat | Outflow besar |
| TVL DeFi WoW | < -5% | -5–+5% | > +5% |
| Oil Brent | > $100 | $80–100 | < $80 |
| BTC Exchange Reserve 7d | > +2% (whale deposit, distribusi) | -0.5–+0.5% | < -2% (whale withdrawal, akumulasi) |
| MVRV Ratio (true) | < 1.0 (capitulation) | 1.0–2.0 (fair value) | > 3.5 (distribusi zone) |
| ETF Flow proxy ⚠️ | Strong Outflow (skor < -2) | Neutral (-0.5–+0.5) | Strong Inflow (skor > +2) |
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
| Perp Sentiment Proxy (funding-based) | > +20 fear ekstrem Phase 4, > +10 fear, > +3 netral-bearish | -3 s/d +3 netral | < -3 greed, < -10 greed tinggi Phase 3 late, < -20 overleveraged Phase 3→4 |
| Google Trends "bitcoin" | > 80 (FOMO ekstrem) | 40–80 | < 20 (bear/capitulation) |
| BTC RVol 30d (proxy IV) | < 30% (complacency, Phase 3→4) | 30–60% normal | > 90% panic (Phase 0) |
| Exchange Inflow Acceleration WoW | > +30% (distribusi Phase 3→4) | -20–+10% flat | < -20% tekanan mereda |
| Funding Rate Streak (>0.05%) | ≥ 7 hari = overleveraged Phase 3 | 3–6 hari = elevated | < 3 hari = normal |
| Realized Cap Growth Rate (7d) | < 0% (distribusi aktif Phase 4) | 0–0.5% stalling | > 2% akumulasi aktif |
| Options Skew proxy (basis-funding) | basis < 5% + funding > 0.05% (diverge) | normal | basis > 15% + funding tinggi (Phase 3) |
| Stablecoin Supply Growth WoW | < -1% (rotasi ke cash, Phase 4) | -1–+2% flat | > +5% Tether printing (bullish Phase 1/2) |
| BTC CME Futures Premium | < 0% (backwardation, institutional short) | 0–+2% normal contango | > +5% (Phase 3 overheated) |
| L2 TVL Total (Base+ARB+OP+zkSync) | < $8B (Phase 0/1 risk-off) | $8–15B growing | > $15B (Phase 2/3 mature) |

---
## DATA — ${today} | FASE ESTIMASI SAYA: ${faseEstimasi}

### FED LIQUIDITY LAYER ${fedSrc}
${fedBlock}

### DATA HARIAN ✅ live
- BTC price: $${btcPrice} | 24h: ${btcChange}%${btcVol != null ? ` | vol 24h: $${btcVol}B` : ''}
${athLine}
${ma200Line}
- BTC Dominance: ${btcDom}%${btcDomDeltaStr} | arah: ${btcDomDir}
- ETH/BTC: ${ethBtc} | SOL/BTC: ${solBtc} | AVAX/BTC: ${avaxBtc} | XRP/BTC: ${xrpBtc}
- DXY: ${dxyVal} | arah: ${dxyDir}
- Gold (XAUUSD): $${goldPrice} | 24h: ${goldChange}%
- Oil Brent: $${oilPrice} | arah: ${oilDir}
- Fear & Greed: ${fgValue} (${fgLabel})
- Funding rate BTC perp: ${btcFunding}% | ETH perp: ${ethFunding}%
- Stablecoin supply: $${totalStable}B${fmtWow(stableWoW)}
${stableDomLine}
- TOTAL2: ${total2} | TOTAL3: ${total3} | OTHERS.D: ${othersDom}%

### DERIVATIF & ON-CHAIN ✅ live
${exResLine}
${exFlowLine ? exFlowLine + '\n' : ''}- BTC exchange netflow (weekly): ${exchangeNetflow}
${etfLine ? etfLine + '\n' : ''}
${mvrvTrueLine ? mvrvTrueLine + '\n' : ''}${rcapLine ? rcapLine + '\n' : ''}${nvtLine ? nvtLine + '\n' : ''}${nuplLine}
${soprLine}
${piLine}
${addrLine}
${minerLine}
${outVolLine ? outVolLine + '\n' : ''}${flAccelLine ? flAccelLine + '\n' : ''}${dvolLine ? dvolLine + '\n' : ''}${fStreakLine ? fStreakLine + '\n' : ''}${rcapPLLine ? rcapPLLine + '\n' : ''}${p4SkewLine ? p4SkewLine + '\n' : ''}${stableGrowthLine ? stableGrowthLine + '\n' : ''}${cmeLine ? cmeLine + '\n' : ''}${l2Line ? l2Line + '\n' : ''}
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
- ETH/BTC ratio: ${ethBtc} | arah minggu ini: ${ethBtcDir} ${v(weekly?.ratioTrend?.ethBtc?.weekChange, '')}%
- SOL/BTC ratio: ${solBtc} | arah: ${solBtcDir} ${v(weekly?.ratioTrend?.solBtc?.weekChange, '')}%
- AVAX/BTC ratio: ${avaxBtc} | arah: ${avaxBtcDir} ${v(weekly?.ratioTrend?.avaxBtc?.weekChange, '')}%
- XRP/BTC ratio: ${xrpBtc} | arah: ${xrpBtcDir} ${v(weekly?.ratioTrend?.xrpBtc?.weekChange, '')}%
- BTC.D arah minggu ini: ${btcDomDir}${btcDomDeltaStr}
- Altseason Index: ${altseasonIdx}
- TVL DeFi (DefiLlama): $${tvl}B | vs minggu lalu: ${tvlChg}%
- EEM ETF (MSCI EM proxy): $${msciEm} | arah: ${msciDir}

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
- SOL, AVAX, XRP

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

**Evaluasi estimasi user:** WAJIB sebelum menentukan fase final, evaluasi estimasi fase user dengan tabel pro/con eksplisit:

| Aspek | Mendukung estimasi user | Menentang estimasi user |
|-------|------------------------|------------------------|
| Layer 0 (Fed) | ... | ... |
| Layer 1 (Macro) | ... | ... |
| Layer 2 (Market struct) | ... | ... |
| Layer 3 (On-chain/deriv) | ... | ... |

Lalu putuskan: **konfirmasi**, **adjust ke fase X**, atau **inconclusive**. Jangan sekedar menerima atau menolak — tunjukkan reasoningnya dari tabel.

- Fase final: [0–4] — [label]
- Confidence: tinggi / sedang / rendah (terapkan rule kalibrasi di ATURAN PRIORITAS)
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
| Global M2 YoY | ${m2YoY != null ? m2YoY + '%' : '—'} (${m2Total}) | >5% ekspansif kuat, <0% kontraktif | ${m2Signal} | ${m2Trend} |

**Layer 2 — Market Structure**
| Indikator | Nilai | vs Threshold | Status | Arah |
|-----------|-------|--------------|--------|------|
| BTC vs 200d MA | ${ma200Gap != null ? (ma200Gap > 0 ? '+' : '') + ma200Gap + '%' : '—'} | <-10% bearish, >+20% bullish kuat | | ${ma200Sig ?? '—'} |
| BTC vs ATH | ${athChg != null ? athChg + '%' : '—'} | <-50% bear market, >-20% bull recovery | | |
| BTC vol 24h | ${btcVol != null ? '$' + btcVol + 'B' : '—'} | konteks konfirmasi trend | | |

**Layer 3 — Derivatives & On-chain**
| Indikator | Nilai | vs Threshold | Status | Arah |
|-----------|-------|--------------|--------|------|
| BTC Exchange Reserve | ${exRes ? (exRes.current / 1000).toFixed(1) + 'k BTC' : '—'} | naik = whale deposit 🔴, turun = akumulasi ✅ | ${exRes?.signal ?? '—'} | ${exRes ? (exRes.changePct7d > 0 ? '+' : '') + exRes.changePct7d + '% 7d' : '—'} |
| MVRV Ratio (true) | ${mvrvTrue?.value ?? '—'} | <1.0 capitulation, >3.5 distribusi | ${mvrvTrue?.value != null ? (mvrvTrue.value > 3.5 ? '🔴' : mvrvTrue.value > 2.0 ? '⚠️' : '✅') : '—'} | zona: ${mvrvTrue?.zone ?? '—'} |
| ETF Flow proxy ⚠️ | ${etf ? etf.label : '—'} | Strong Inflow ✅, Strong Outflow 🔴 | ${etf?.signal ?? '—'} | score: ${etf ? (etf.score > 0 ? '+' : '') + etf.score : '—'} |
| NUPL proxy | ${nupl?.nupl != null ? (nupl.nupl > 0 ? '+' : '') + nupl.nupl : '—'} | <0 capitulation, >0.75 euphoria | | zona: ${nupl?.nuplZone ?? '—'} |
| SOPR proxy (price ratio) | ${nupl?.sopr ?? '—'} | <0.85 selloff tajam, >1.20 overextended | | |
| Pi Cycle Top gap | ${piCycle ? (piCycle.gapPct > 0 ? '+' : '') + piCycle.gapPct + '%' : '—'} | >0% crossing=top, <-30% aman | | |
| Active Addresses WoW | ${activeAddr?.weekChange != null ? (activeAddr.weekChange > 0 ? '+' : '') + activeAddr.weekChange + '%' : '—'} | <-10% capitulation, >+2% adoption | | ${activeAddr?.trend ?? '—'} |
| Miner Revenue WoW | ${minerRev?.weekChange != null ? (minerRev.weekChange > 0 ? '+' : '') + minerRev.weekChange + '%' : '—'} | <-20% capitulation risk, >+2% bullish | | ${minerRev?.trend ?? '—'} |
| Long/Short Ratio | ${ls?.ratio ?? '—'} | <0.6 shorts dominan, >1.8 longs dominan | | ${ls?.signal ?? '—'} |
| Hash Rate WoW | ${hr?.weekChange != null ? (hr.weekChange > 0 ? '+' : '') + hr.weekChange + '%' : '—'} | <-5% capitulation, >+1% bullish | | ${hr?.trend ?? '—'} |
| Stablecoin Dom. (USDT+USDC) | ${stableDomPct != null ? stableDomPct + '%' : '—'} | >6% risk-off, <3% risk-on | | ${stableWoW != null ? (stableWoW > 0 ? '+' : '') + stableWoW + '% WoW' : '—'} |
| OI BTC | $${oi?.totalBillion ?? '—'}B | ekspansi >$30B, kontraksi <$15B | | ${oi?.trend ?? '—'} |
| Perp Premium (ann.) | ${basis?.annualizedPct ?? '—'}% | >15% overleveraged, <0% backwardation | | |
| Perp Sentiment Proxy | ${skew?.skewProxy != null ? (skew.skewProxy > 0 ? '+' : '') + skew.skewProxy : '—'} | range valid -30 s/d +30 · >+10 fear, <-10 greed tinggi, <-20 overleveraged | | |
| Google Trends "bitcoin" | ${gt ? gt.currentValue + '/100' + (gt._fromCache ? ' 💾' : '') : '—'} | >80 FOMO ekstrem, <20 bear | | ${gt?.trend ?? '—'} |

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
- Exchange Reserve naik 7d tapi BTC price juga naik (whale deposit ke exchange sambil harga naik → distribusi tersembunyi, waspadai dump)
- Exchange Reserve turun tajam (7d < -2%) tapi MVRV > 3.5 (akumulasi tapi valuasi sudah stretched → window distribusi dekat)
- Exchange Reserve naik tajam (7d > +2%) tapi NUPL < 0.25 (whale deposit di zona fear — bisa capitulation bottom, bukan distribusi)
- ETF Flow proxy "Strong Outflow" tapi Exchange Reserve juga turun (ETF selloff tapi whale withdrawal — konflik: retail keluar, institusi akumulasi?)
- ETF Flow proxy "Strong Inflow" tapi Fear & Greed < 30 (ETF demand tinggi di tengah fear — bisa early accumulation dari smart money)
- CME Premium positif (>0%) tapi Perp Basis negatif/backwardation (<0%) — institutional contango vs retail/leveraged backwardation: divergence positioning antara TradFi dan crypto-native; sering precede reversal ke arah CME view (institutional smart money)
- CME Premium negatif (<0%) tapi Perp Basis positif (>5%) — institutional bearish/hedging tapi perp leveraged bullish: warning institutional exit duluan, retail leverage rentan unwind

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
  const w_s  = fed?.walcl;
  const r_s  = fed?.rrp;
  const rv_s = fed?.reserves;
  const p_s  = fed?.pmi;
  const tg_s = fed?.tga;
  const hy_s = fed?.hySpread;
  const yc_s = fed?.yieldCurve;
  const vx_s = fed?.vix;

  if (w_s?.totalTrillions != null)
    lines.push(`  WALCL   : $${w_s.totalTrillions}T (${(w_s.weekChangeBillions ?? 0) >= 0 ? '+' : ''}${w_s.weekChangeBillions ?? '?'}B)`);
  else
    lines.push(`  WALCL   : ___`);

  if (r_s?.balanceBillions != null)
    lines.push(`  RRP     : $${r_s.balanceBillions}B (${r_s.trend ?? '?'})`);
  else
    lines.push(`  RRP     : ___`);

  if (rv_s?.totalTrillions != null)
    lines.push(`  WRESBAL  : $${rv_s.totalTrillions}T (${(rv_s.weekChangeBillions ?? 0) >= 0 ? '+' : ''}${rv_s.weekChangeBillions ?? '?'}B)`);
  else
    lines.push(`  WRESBAL  : ___`);

  if (p_s) {
    const mfg = p_s.manufacturing?.value ?? '—';
    const svc = p_s.services?.value ?? '—';
    const mo  = p_s.releasedMonth
      ? (() => { const [yr, mn] = p_s.releasedMonth.split('-'); return `${new Date(+yr, +mn - 1).toLocaleString('en-US', { month: 'short' })} ${yr}`; })()
      : null;
    const pSrc = p_s._fromCache ? '💾' : '✅';
    lines.push(`  PMI     : Mfg ${mfg} | Svc ${svc}${mo ? ` (${mo})` : ''} ${pSrc}`);
  } else {
    lines.push(`  PMI     : ___`);
  }

  if (tg_s?.balanceBillions != null)
    lines.push(`  TGA     : $${tg_s.balanceBillions}B (Δ${tg_s.weekChangeBillions >= 0 ? '+' : ''}${tg_s.weekChangeBillions}B | ${tg_s.trend}) ${tg_s.signal}`);
  else
    lines.push(`  TGA     : ___`);

  if (hy_s?.spreadPct != null)
    lines.push(`  HY OAS  : ${hy_s.spreadPct}% (Δ${hy_s.dayChange >= 0 ? '+' : ''}${hy_s.dayChange}% | ${hy_s.zone}) ${hy_s.signal}`);
  else
    lines.push(`  HY OAS  : ___`);

  if (yc_s?.spread != null)
    lines.push(`  Curve   : ${yc_s.spread >= 0 ? '+' : ''}${yc_s.spread}% (2Y:${yc_s.yield2Y}% 10Y:${yc_s.yield10Y}% | ${yc_s.zone}) ${yc_s.signal}`);
  else
    lines.push(`  Curve   : ___`);

  if (vx_s?.value != null)
    lines.push(`  VIX     : ${vx_s.value} (Δ${vx_s.dayChange >= 0 ? '+' : ''}${vx_s.dayChange} | ${vx_s.zone}) ${vx_s.signal}`);
  else
    lines.push(`  VIX     : ___`);

  lines.push(`  Trifecta: ${fed?.trifectaScore ?? '—'} hijau → ${fed?.overallStatus ?? '—'}`);
  lines.push(`  Stress0 : ${fed?.macroStressScore ?? '—'} merah → ${fed?.macroStressLabel ?? '—'}`);

  // ── Daily ─────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push('DAILY [✅ live]:');
  // btcDom deltas — computed locally for the summary function
  const _prevDom2 = daily?._prevWeek?.btc_dominance ?? null;
  const _currDom2 = daily?.crypto?.btcDominance ?? null;
  const _domDelta2 = (_prevDom2 != null && _currDom2 != null) ? parseFloat((_currDom2 - _prevDom2).toFixed(2)) : null;
  const btcDomDir     = _domDelta2 != null ? (_domDelta2 > 0.3 ? 'naik' : _domDelta2 < -0.3 ? 'turun' : 'flat') : '—';
  const btcDomDeltaStr = _domDelta2 != null ? ` (${_domDelta2 > 0 ? '+' : ''}${_domDelta2}% WoW)` : '';
  if (daily?.crypto) {
    const bvol = daily.crypto.btc?.volume24hBillion;
    lines.push(`  BTC    : $${daily.crypto.btc?.price?.toLocaleString() ?? '—'} (${daily.crypto.btc?.change24h >= 0 ? '+' : ''}${daily.crypto.btc?.change24h ?? '—'}%)${bvol != null ? ` | vol: $${bvol}B` : ''}`);
    if (daily.nuplProxy?.ath != null)
      lines.push(`  ATH    : $${daily.nuplProxy.ath.toLocaleString('en-US')} | dari ATH: ${daily.nuplProxy.athChangePct}%`);
    if (daily.nuplProxy?.ma200 != null)
      lines.push(`  200MA  : $${daily.nuplProxy.ma200.toLocaleString('en-US')} | gap: ${daily.nuplProxy.ma200GapPct > 0 ? '+' : ''}${daily.nuplProxy.ma200GapPct}%`);
    lines.push(`  ETH    : $${daily.crypto.eth?.price?.toLocaleString() ?? '—'} (${daily.crypto.eth?.change24h >= 0 ? '+' : ''}${daily.crypto.eth?.change24h ?? '—'}%)`);
    lines.push(`  BTC.D  : ${daily.crypto.btcDominance ?? '—'}%${btcDomDeltaStr} → ${btcDomDir}`);
    lines.push(`  ETH/BTC: ${daily.crypto.ethBtcRatio ?? '—'}  | SOL/BTC: ${daily.crypto.solBtcRatio ?? '—'}`);
    lines.push(`  F&G    : ${daily.fearGreed?.value ?? '—'} — ${daily.fearGreed?.label ?? '—'}`);
    lines.push(`  Funding: BTC ${daily.funding?.btc ?? '—'}% | ETH ${daily.funding?.eth ?? '—'}% (${daily.funding?.source ?? ''})`);
  } else {
    lines.push(`  crypto : ___`);
  }
  lines.push(`  DXY    : ${daily?.dxy?.value ?? '—'} (${daily?.dxy?.direction ?? '—'})`);
  lines.push(`  Gold   : $${daily?.gold?.price ?? '—'} (${daily?.gold?.change24h ?? '—'}%)`);
  lines.push(`  Oil    : $${daily?.brentOil?.price ?? '—'} (${daily?.brentOil?.direction ?? '—'})`);
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
  if (daily?.coinMetrics?.exchangeReserve) {
    const er = daily.coinMetrics.exchangeReserve;
    const ef = daily.coinMetrics.exchangeFlow;
    const mv = daily.coinMetrics.mvrv;
    lines.push(`  ExRes  : ${(er.current / 1000).toFixed(1)}k BTC | 7d: ${er.change7d > 0 ? '+' : ''}${er.change7d.toLocaleString()} BTC (${er.changePct7d > 0 ? '+' : ''}${er.changePct7d}%) ${er.signal}`);
    if (ef) lines.push(`  ExFlow : in ${ef.inflow.toLocaleString()} / out ${ef.outflow.toLocaleString()} BTC | net: ${ef.netflow > 0 ? '+' : ''}${ef.netflow.toLocaleString()} BTC`);
    if (mv?.value != null) lines.push(`  MVRV✓  : ${mv.value} | zona: ${mv.zone} ${mv.value > 3.5 ? '🔴' : mv.value > 2.0 ? '⚠️' : '✅'}`);
  }
  if (daily?.etfFlow) {
    const ef = daily.etfFlow;
    lines.push(`  ETF⚠️   : ${ef.label} | score: ${ef.score > 0 ? '+' : ''}${ef.score} ${ef.signal} (${ef.etfsUsed} ETFs, proxy)`);
  }
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
    lines.push(`  HashR  : ${hr.latestEH} EH/s | WoW: ${hr.weekChange != null ? (hr.weekChange > 0 ? '+' : '') + hr.weekChange + '%' : '—'} — ${hr.trend}`);
  } else {
    lines.push(`  HashR  : ___`);
  }
  if (daily?.activeAddresses) {
    const aa = daily.activeAddresses;
    lines.push(`  Addr   : ${aa.avg7d.toLocaleString('en-US')} (7d avg) | WoW: ${aa.weekChange != null ? (aa.weekChange > 0 ? '+' : '') + aa.weekChange + '%' : '—'} — ${aa.trend}`);
  } else {
    lines.push(`  Addr   : ___`);
  }
  if (daily?.minerRevenue) {
    const mr = daily.minerRevenue;
    lines.push(`  Miners : $${mr.revMillion}M/day | WoW: ${mr.weekChange != null ? (mr.weekChange > 0 ? '+' : '') + mr.weekChange + '%' : '—'} — ${mr.trend}`);
  } else {
    lines.push(`  Miners : ___`);
  }
  // Phase 1 — Realized Cap + NVT + HODL proxy
  if (daily?.coinMetrics?.realizedCap?.valueBillion != null) {
    const rc = daily.coinMetrics.realizedCap;
    lines.push(`  RealCap: $${rc.valueBillion}B | MoM: ${rc.growthMoM != null ? (rc.growthMoM >= 0 ? '+' : '') + rc.growthMoM + '%' : '—'}`);
  } else {
    lines.push(`  RealCap: ___`);
  }
  {
    const _txVolBtc2   = daily?.txVolume?.avg7dBtc ?? null;
    const _btcPx2      = daily?.crypto?.btc?.price ?? null;
    const _mktCapB2    = daily?.coinMetrics?.mktCapBillion ?? null;
    const _txUsdB2     = (_txVolBtc2 && _btcPx2) ? _txVolBtc2 * _btcPx2 / 1e9 : null;
    const _nvtRatio2   = (_mktCapB2 && _txUsdB2 > 0) ? parseFloat((_mktCapB2 / _txUsdB2).toFixed(1)) : null;
    if (_nvtRatio2 != null)
      lines.push(`  NVT    : ${_nvtRatio2} | TxVol: ${_txVolBtc2?.toLocaleString() ?? '—'} BTC/day`);
    else
      lines.push(`  NVT    : ___`);
  }
  if (daily?.outputVolume?.avg7dBtc != null) {
    const ov = daily.outputVolume;
    lines.push(`  OutVol : ${ov.avg7dBtc.toLocaleString()} BTC/day | WoW: ${ov.weekChange != null ? (ov.weekChange >= 0 ? '+' : '') + ov.weekChange + '%' : '—'}`);
  } else {
    lines.push(`  OutVol : ___`);
  }
  // Phase 2 — CME Premium + L2 TVL
  {
    const _cme  = daily?.btcCmePremium;
    const _spot = daily?.crypto?.btc?.price;
    const _pct  = (_cme?.futuresPrice != null && _spot != null && _spot > 0)
      ? parseFloat(((_cme.futuresPrice - _spot) / _spot * 100).toFixed(2)) : null;
    if (_pct != null)
      lines.push(`  CMEPrem: ${_pct >= 0 ? '+' : ''}${_pct}% | futures $${_cme.futuresPrice.toLocaleString()} vs spot $${_spot.toLocaleString()}`);
    else
      lines.push(`  CMEPrem: ___`);
    const _l2 = daily?.l2TVL;
    if (_l2?.totalBillion != null)
      lines.push(`  L2 TVL : $${_l2.totalBillion}B total | ${_l2.chains.slice(0, 3).map(c => `${c.name}: $${c.tvlBillion}B`).join(' | ')}`);
    else
      lines.push(`  L2 TVL : ___`);
  }
  // Phase 3 — Flow Acceleration + DVOL + Funding Streak
  if (daily?.coinMetrics?.flowAcceleration != null) {
    const fa = daily.coinMetrics.flowAcceleration;
    lines.push(`  FlowAcc: ${fa >= 0 ? '+' : ''}${fa}% WoW inflow | ${daily.coinMetrics.flowAccelSignal ?? '—'}`);
  } else {
    lines.push(`  FlowAcc: ___`);
  }
  if (daily?.deribitIV) {
    const d = daily.deribitIV;
    lines.push(`  RVol30d: ${d.value}% ann | Δ7d ${d.dayChange >= 0 ? '+' : ''}${d.dayChange} | ${d.zone} ${d.signal.split('—')[0].trim()}`);
  } else {
    lines.push(`  RVol30d: ___`);
  }
  if (daily?.fundingStreak) {
    const fs = daily.fundingStreak;
    lines.push(`  FundStr: ${fs.streakDays} hari | avg7d: ${fs.avgRate7d ?? '—'}% | ${fs.signal}`);
  } else {
    lines.push(`  FundStr: ___`);
  }
  // Phase 4 — Realized P/L + Skew proxy + Stablecoin Growth
  {
    const rc4 = daily?.coinMetrics?.realizedCap;
    if (rc4?.growth7d != null)
      lines.push(`  RealPL : ${rc4.growth7d >= 0 ? '+' : ''}${rc4.growth7d}% 7d | MoM: ${rc4.growthMoM != null ? (rc4.growthMoM >= 0 ? '+' : '') + rc4.growthMoM + '%' : '—'} | ${rc4.realizedPLSignal}`);
    else
      lines.push(`  RealPL : ___`);
    const ba4 = daily?.btcBasis?.annualizedPct ?? null;
    const fu4 = daily?.funding?.btc ?? null;
    const sk4 = ba4 != null && fu4 != null
      ? (ba4 < 0 ? '🔴 backwardation' : ba4 < 5 && fu4 > 0.05 ? '🔴 diverge Phase 4' : ba4 < 10 && fu4 > 0.03 ? '⚠️ hedging mulai' : '✅ normal')
      : '—';
    lines.push(`  Skew4  : basis ${ba4 != null ? ba4 + '% ann' : '—'} | funding ${fu4 ?? '—'}% | ${sk4}`);
    const sn4  = daily?.crypto?.stablecoinSupply?.total ?? null;
    const sp4  = daily?._prevWeek?.stablecoin_billion ?? null;
    const sg4  = (sn4 != null && sp4 != null && sp4 > 0)
      ? parseFloat(((sn4 - sp4) / sp4 * 100).toFixed(2)) : null;
    lines.push(`  StabGrw: ${sg4 != null ? (sg4 >= 0 ? '+' : '') + sg4 + '% WoW' : '___'} | $${sn4 ?? '—'}B`);
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
    lines.push(`  Skew   : ${daily.optionsSkew.skewProxy != null ? (daily.optionsSkew.skewProxy > 0 ? '+' : '') + daily.optionsSkew.skewProxy : '—'} | funding: ${daily.optionsSkew.avgFunding8h ?? '—'}%`);
  else
    lines.push(`  Skew   : ___`);
  if (daily?.googleTrends && !daily.googleTrends.skipped) {
    const gt = daily.googleTrends;
    lines.push(`  Trends : ${gt.currentValue}/100${gt._fromCache ? ' 💾' : ''} | avg4w: ${gt.avg4w} | WoW: ${gt.weekChange != null ? (gt.weekChange > 0 ? '+' : '') + gt.weekChange + ' pts' : '—'} — ${gt.trend}`);
  } else {
    lines.push(`  Trends : ___ (SERPAPI_API_KEY tidak diset)`);
  }

  // ── Weekly ────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(`WEEKLY [${weekly?._fromCache ? `💾 cache: ${weekly._cachedAt?.slice(0,10)}` : weekly && !weekly.skipped ? '✅ live' : '⚠️ tidak tersedia'}]:`);
  lines.push(`  10Y    : ${weekly?.yield10y?.value ?? '—'}% (${weekly?.yield10y?.direction ?? '—'})`);
  lines.push(`  NFCI   : ${weekly?.nfci?.value ?? '—'} (${weekly?.nfci?.trend ?? '—'})`);
  lines.push(`  TVL    : $${weekly?.tvl?.tvl ?? '—'}B (${weekly?.tvl?.changePercent != null ? (weekly.tvl.changePercent >= 0 ? '+' : '') + weekly.tvl.changePercent : '—'}%)`);
  lines.push(`  EEM ETF (MSCI EM proxy): $${weekly?.msciEm?.value ?? '—'} (${weekly?.msciEm?.direction ?? '—'})`);
  lines.push(`  ETH/BTC: ${weekly?.ratioTrend?.ethBtc?.ratio ?? '—'} (${weekly?.ratioTrend?.ethBtc?.direction ?? '—'})`);
  lines.push(`  SOL/BTC: ${weekly?.ratioTrend?.solBtc?.ratio ?? '—'} (${weekly?.ratioTrend?.solBtc?.direction ?? '—'})`);
  if (weekly?.altseason?.value != null)
    lines.push(`  Altszn : ${weekly.altseason.value} — ${weekly.altseason.signal} ✅${weekly.altseasonProxy ? ` | proxy: ${weekly.altseasonProxy.value}` : ''}`);
  else if (weekly?.altseasonProxy?.value != null)
    lines.push(`  Altszn : ${weekly.altseasonProxy.value} — ${weekly.altseasonProxy.signal} ⚠️ proxy`);
  else
    lines.push(`  Altszn : —`);

  // ── Monthly ───────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(`MONTHLY [${monthly?._fromCache ? `💾 cache: ${monthly._cachedAt?.slice(0,10)}` : monthly && !monthly.skipped ? '✅ live' : '⚠️ tidak tersedia'}]:`);
  lines.push(`  CPI    : ${monthly?.cpi?.yoy ?? '—'}% YoY`);
  lines.push(`  Fed    : ${monthly?.fedRate?.label ?? '—'}`);
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
