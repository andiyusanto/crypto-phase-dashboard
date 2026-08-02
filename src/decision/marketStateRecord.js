// ============================================
// MARKET STATE RECORD — Step 8 Phase 3
//
// pgStore.js's saveMarketState() (Step 6 Phase 3) was written speculatively
// before determineState() existed — its comment says so explicitly ("once it
// computes real MarketState objects — not called by anything yet"). Its
// expected shape ({state, legacyPhase, confidenceLevel, confidenceReasons,
// liquidityTrifectaScore, liquidityStatus, macroStressLabel, activeDivergences,
// isManualReview, computedAt}) does NOT match determineState()'s actual output
// (Step 8 Phase 2) — the confidence/liquidity/divergence fields it expects live
// in three separate objects (ConfidenceScore, providersOutput.macro.liquidity,
// DivergenceEngine), none of which determineState() folds in itself. This
// assembler is the missing piece that builds the exact shape saveMarketState()
// already expects, from the pieces that actually exist — found and fixed here
// rather than discovering it as a runtime bug the first time persistence is
// wired in.
//
// NOTE ON SCOPE: RiskAssessment/PortfolioAllocation (this same phase) are
// deliberately NOT included in this record. Both are pure, deterministic
// functions of `legacyPhase` (RiskAssessment) or of RiskAssessment + a
// caller-supplied portfolioSize (PortfolioAllocation) — recomputing them from
// a persisted `legacy_phase` loses nothing, and portfolioSize is a per-caller
// input with no home in a system-wide market state history table. Persisting
// them would mean extending 001_initial_schema.sql for no retrievable benefit;
// left out until a real reason to backtest riskProfile decisions emerges.
// ============================================

export function buildMarketStateRecord(decision, confidence, divergenceResult, providersOutput) {
  return {
    state: decision.state,
    legacyPhase: decision.legacyPhase,
    confidenceLevel: confidence.level,
    confidenceReasons: confidence.reasons,
    liquidityTrifectaScore: providersOutput.macro.liquidity.trifectaScore,
    liquidityStatus: providersOutput.macro.liquidity.overallStatus,
    macroStressLabel: providersOutput.macro.liquidity.macroStressLabel,
    activeDivergences: divergenceResult.fired.map(d => ({ id: d.id, severity: d.severity })),
    isManualReview: decision.isManualReview,
    computedAt: new Date().toISOString(),
  };
}
