// ============================================
// SCORING ENGINE — Step 7
//
// Pure computation over Step 6's provider layer output (src/providers/index.js's
// fetchAllProviders()). Does not fetch anything itself.
//
// Category mapping reconciliation (per Step 7's brief): the provider layer
// established 5 categories (macro, crypto, derivatives, onchain, geopolitical),
// not the roadmap's original 4-way wording (Macro/Liquidity/Crypto/War). Liquidity
// is implemented as an explicit SUB-score of Macro — matching how fedliquidity.js's
// output is already nested under `macro.liquidity` in src/providers/macro/index.js
// — rather than silently merged into one undifferentiated Macro number. Derivatives
// and On-chain each get their own score rather than being folded into Crypto,
// since Step 4B found they lean much more heavily on PROXY/INVENTED indicators
// than Crypto's price/market-structure data does — collapsing them would hide
// that trust-tier difference from Step 8's Decision Engine.
//
// Overall Cycle Score combines all of the above using category-level weights
// that translate this project's own already-stated liquidity hierarchy
// ("Upstream selalu lebih dipercaya dari downstream": Fed Balance Sheet → RRP →
// Global M2 → FCI → DXY/10Y → BTC → ETH/Alts — formatter.js's own prompt text)
// into code, rather than inventing a fresh prioritization from nothing. War score
// is deliberately low-authority — Step 4B tagged every geopolitical indicator LOW
// trust/INVENTED, and it must not swing Overall Cycle Score as much as Macro or
// Liquidity.
// ============================================

import { computeCategoryScore } from './categoryScore.js';
import { classifySignal } from './signalClassifier.js';

// Fed Liquidity Trifecta + Macro Stress indicators — matches fedliquidity.js's own
// grouping. Everything else emitted by the Macro provider is general Macro.
const LIQUIDITY_INDICATOR_NAMES = new Set([
  'Fed Balance Sheet (WALCL)', 'Reverse Repo (RRP)', 'Reserve Balances (WRESBAL)',
  'Treasury General Account (TGA)', 'HY Credit Spread', 'Yield Curve (10Y-2Y)', 'VIX',
]);

// GeopoliticalRisk objects (src/providers/geopolitical/index.js) aren't
// Indicator-shaped — no emoji `.signal`, just a 1-5 severity. Adapt them into the
// same shape categoryScore/weights already know how to handle, so War Score goes
// through the identical, already-verified pipeline as every other category
// instead of a bespoke one-off calculation.
//
// Directionality is an explicit, documented judgment call, not hidden: low
// severity (1-2) is scored mildly supportive/bullish (de-risked), severity 3 is
// neutral, severity 4-5 (elevated/critical conflict) is bearish — geopolitical
// escalation being risk-off for crypto is the same assumption formatter.js's
// existing prompt already makes ("Oil sebagai real-time proxy... threshold alert").
function geoRiskToScorable(risk) {
  const signal = risk.severity == null ? null
    : risk.severity <= 2 ? '✅' : risk.severity === 3 ? '⚠️' : '🔴';
  return {
    name: risk.region, category: 'geopolitical',
    trustTier: risk.trustTier, boundsViolation: false,
    signal, source: risk.source,
  };
}

// Category-level weights for Overall Cycle Score — translates this project's own
// stated liquidity hierarchy into numbers, not a fresh invention.
const OVERALL_CATEGORY_WEIGHT = Object.freeze({
  liquidity:   3,
  macro:       2,
  crypto:      2,
  onchain:     1.5,
  derivatives: 1,
  war:         0.5, // deliberately low-authority per Step 4B's trust-tier findings
});

function combineScores(namedScores) {
  const usable = namedScores.filter(s => s.score.score != null);
  if (!usable.length) return { score: null, basis: [] };

  const totalWeight = usable.reduce((s, x) => s + x.weight, 0);
  const weightedSum  = usable.reduce((s, x) => s + x.score.score * x.weight, 0);
  return {
    score: parseFloat((weightedSum / totalWeight).toFixed(3)),
    basis: usable.map(x => ({ category: x.name, score: x.score.score, weight: x.weight })),
  };
}

export function computeAllScores(providersOutput) {
  const { macro, crypto, derivatives, onchain, geopolitical } = providersOutput;

  const liquidityIndicators = macro.indicators.filter(i => LIQUIDITY_INDICATOR_NAMES.has(i.name));
  const generalMacroIndicators = macro.indicators.filter(i => !LIQUIDITY_INDICATOR_NAMES.has(i.name));

  const liquidityScore   = computeCategoryScore(liquidityIndicators, 'Liquidity Score');
  const macroScore       = computeCategoryScore(generalMacroIndicators, 'Macro Score');
  const cryptoScore      = computeCategoryScore(crypto.indicators, 'Crypto Score');
  const derivativesScore = computeCategoryScore(derivatives.indicators, 'Derivatives Score');
  const onchainScore     = computeCategoryScore(onchain.indicators, 'On-chain Score');
  const warScore         = computeCategoryScore(geopolitical.map(geoRiskToScorable), 'War/Geopolitical Score');

  const overall = combineScores([
    { name: 'liquidity',   score: liquidityScore,   weight: OVERALL_CATEGORY_WEIGHT.liquidity },
    { name: 'macro',       score: macroScore,       weight: OVERALL_CATEGORY_WEIGHT.macro },
    { name: 'crypto',      score: cryptoScore,      weight: OVERALL_CATEGORY_WEIGHT.crypto },
    { name: 'derivatives', score: derivativesScore, weight: OVERALL_CATEGORY_WEIGHT.derivatives },
    { name: 'onchain',     score: onchainScore,     weight: OVERALL_CATEGORY_WEIGHT.onchain },
    { name: 'war',         score: warScore,         weight: OVERALL_CATEGORY_WEIGHT.war },
  ]);

  return {
    liquidity: liquidityScore,
    macro: macroScore,
    crypto: cryptoScore,
    derivatives: derivativesScore,
    onchain: onchainScore,
    war: warScore,
    overall: { label: 'Overall Cycle Score', score: overall.score, basis: overall.basis },
    computedAt: new Date().toISOString(),
  };
}

export { classifySignal };
