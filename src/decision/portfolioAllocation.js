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

// Returns { usd, unavailableReason } instead of a bare null — `usd: null` has
// two structurally different causes (bandPct itself not defined for this
// phase, e.g. Fase 4's high-risk band; vs portfolioSize simply not supplied
// yet) that a consumer reading only the number could never tell apart.
// unavailableReason makes the cause explicit, same discipline as DataSource's
// skipped/skipReason pair used everywhere else in this codebase.
function bandToUSD(bandPct, portfolioSize, label) {
  if (!bandPct) return { usd: null, unavailableReason: `${label} tidak didefinisikan untuk fase ini (bukan portfolioSize yang hilang)` };
  if (portfolioSize == null) return { usd: null, unavailableReason: 'portfolioSize belum diset' };
  return {
    usd: {
      min: parseFloat((portfolioSize * bandPct.min / 100).toFixed(2)),
      max: parseFloat((portfolioSize * bandPct.max / 100).toFixed(2)),
    },
    unavailableReason: null,
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

  const core = bandToUSD(riskAssessment.coreBandPct, portfolioSize, 'coreBand');
  const highRisk = bandToUSD(riskAssessment.highRiskBandPct, portfolioSize, 'highRiskBand');

  // Point 2 fix: portfolioSize >= MIN_POSITION_USD only proves a SINGLE $50
  // position fits somewhere in the total — it says nothing about whether a
  // given band's own edge clears $50. E.g. portfolioSize=$150 at Fase 3
  // (Core >=30%) gives coreBandUSD.min=$45, below MIN_POSITION_USD, with
  // portfolioSize ($150) comfortably above it — the old check never looked at
  // the band edges themselves, only the total.
  for (const [label, band] of [['coreBand', core], ['highRiskBand', highRisk]]) {
    if (band.usd != null && band.usd.min > 0 && band.usd.min < MIN_POSITION_USD) {
      reasons.push(`${label} minimum ($${band.usd.min}) di bawah minPositionUSD ($${MIN_POSITION_USD}) — band ini secara matematis tidak feasible dengan constraint minimal per posisi`);
    }
  }

  return {
    riskProfile: riskAssessment.riskProfile,
    portfolioSize,
    coreBandPct: riskAssessment.coreBandPct,
    coreBandUSD: core.usd,
    coreBandUnavailableReason: core.unavailableReason,
    highRiskBandPct: riskAssessment.highRiskBandPct,
    highRiskBandUSD: highRisk.usd,
    highRiskBandUnavailableReason: highRisk.unavailableReason,
    maxActivePositions: MAX_ACTIVE_POSITIONS,
    minPositionUSD: MIN_POSITION_USD,
    assetCatalog: ASSET_CATALOG,
    manualReviewFlag: riskAssessment.manualReviewFlag,
    reasons,
  };
}
