// ============================================
// MACRO PROVIDER — aggregator
//
// Combines Fed Liquidity + Monthly (CPI/FedRate/M2/PMI) + Weekly-macro
// (US10Y/NFCI/Oil/EEM) sub-sources into one normalized Indicator[] + confidence
// summary, per Step 4's MacroSnapshot / LiquiditySnapshot design.
//
// Note: this is additive. formatter.js / telegram-sender.js / discord-sender.js /
// claude-analyst.js are untouched and keep reading the legacy fetcher output as
// before — nothing here is wired into the live prompt/send pipeline yet.
// ============================================

import { fetchFedLiquidityIndicators } from './fedLiquidity.js';
import { fetchMonthlyMacroIndicators } from './monthly.js';
import { fetchWeeklyMacroIndicators } from './weeklyMacro.js';
import { fetchDailyMacroIndicators } from './dailyMacro.js';

export async function fetchMacroSnapshot(config = {}) {
  const [fedLiquidity, monthly, weeklyMacro, dailyMacro] = await Promise.all([
    fetchFedLiquidityIndicators(config.fredApiKey),
    fetchMonthlyMacroIndicators(config.fredApiKey),
    fetchWeeklyMacroIndicators(config),
    fetchDailyMacroIndicators(config),
  ]);

  const indicators = [
    ...fedLiquidity.indicators,
    ...monthly.indicators,
    ...weeklyMacro.indicators,
    ...dailyMacro.indicators,
  ];

  return {
    category: 'macro',
    indicators,
    // Liquidity-specific aggregates — this subset is effectively Step 4's
    // LiquiditySnapshot, kept alongside the broader Macro category rather than as
    // a fully separate provider module, since it's produced by the same fetch call.
    liquidity: {
      trifectaScore: fedLiquidity.trifectaScore,
      overallStatus: fedLiquidity.overallStatus,
      macroStressScore: fedLiquidity.macroStressScore,
      macroStressLabel: fedLiquidity.macroStressLabel,
    },
    fetchedAt: new Date().toISOString(),
  };
}
