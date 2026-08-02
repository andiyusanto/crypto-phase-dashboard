// ============================================
// PORTFOLIO ALLOCATION — Step 8 Phase 3
//
// Implements Step 4's PortfolioAllocation entity. Converts RiskAssessment's %
// bands into concrete USD bands + position constraints, both grounded 1:1 in
// formatter.js's existing "INSTRUKSI ALOKASI" / "KANDIDAT ASET" sections
// (formatter.js:672-698) — nothing here invents a new number.
//
// DELIBERATE SCOPE BOUNDARY: this does NOT pick which specific assets to buy,
// individual per-asset weights, or $HYPE's hypeRanking/hypeCategory judgment
// call. formatter.js:674 states allocation is "DINAMIS...berdasarkan kondisi
// market minggu ini" — that's a qualitative read of live momentum/news the
// original system always delegated to the AI's own reasoning, with no formula
// anywhere in this codebase to ground a code-based picker against. Building one
// here would mean inventing decision logic from scratch, breaking this
// project's whole "ground in existing source, never guess" discipline. That
// judgment call stays Step 9's job (AI Insight Engine) — this module hands it
// the computed USD bands + this static asset catalog, not a final answer.
// ============================================

const MAX_ACTIVE_POSITIONS = 4;   // formatter.js:676
const MIN_POSITION_USD     = 50;  // formatter.js:677

// formatter.js:684-698, verbatim.
export const ASSET_CATALOG = [
  { layer: 'Layer 0-1 (Core / Safe Haven)', assets: ['BTC', 'ETH', 'Gold (XAU)'] },
  { layer: 'Layer 2 (L1 / High-Beta)',      assets: ['SOL', 'AVAX', 'XRP'] },
  { layer: 'Layer 3 (DeFi Core)',           assets: ['LDO', 'AAVE', 'UNI', 'LINK'] },
  {
    layer: 'Layer 4 (Alts / High-Risk)',
    assets: ['MATIC', 'ARB', 'OP', 'DOT'],
    speculative: [{ asset: '$HYPE', note: 'hypeRanking/hypeCategory/hypeReason — ditentukan AI tiap run, tidak dihitung di sini' }],
  },
];

function bandToUSD(bandPct, portfolioSize) {
  if (!bandPct || portfolioSize == null) return null;
  return {
    min: parseFloat((portfolioSize * bandPct.min / 100).toFixed(2)),
    max: parseFloat((portfolioSize * bandPct.max / 100).toFixed(2)),
  };
}

// `riskAssessment` = assessRisk()'s output. `portfolioSize` = plain number
// (USD) — NOT formatter.js's manualOverrides.portfolioSize, which is a display
// string like "$1,000" with no code consumer until now. Pass null if unknown;
// every output field degrades to null rather than guessing a default size.
export function computeAllocation(riskAssessment, portfolioSize = null) {
  const reasons = [...riskAssessment.reasons];
  if (portfolioSize == null) {
    reasons.push('portfolioSize tidak diset — band USD tidak bisa dihitung, hanya band % yang tersedia');
  } else if (portfolioSize < MIN_POSITION_USD) {
    reasons.push(`portfolioSize ($${portfolioSize}) di bawah MIN_POSITION_USD ($${MIN_POSITION_USD}) — bahkan 1 posisi pun tidak feasible`);
  }

  return {
    riskProfile: riskAssessment.riskProfile,
    portfolioSize,
    coreBandPct: riskAssessment.coreBandPct,
    coreBandUSD: bandToUSD(riskAssessment.coreBandPct, portfolioSize),
    highRiskBandPct: riskAssessment.highRiskBandPct,
    highRiskBandUSD: bandToUSD(riskAssessment.highRiskBandPct, portfolioSize),
    maxActivePositions: MAX_ACTIVE_POSITIONS,
    minPositionUSD: MIN_POSITION_USD,
    assetCatalog: ASSET_CATALOG,
    manualReviewFlag: riskAssessment.manualReviewFlag,
    reasons,
  };
}
