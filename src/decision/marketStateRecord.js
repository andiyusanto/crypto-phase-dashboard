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
    // Review point 3 fix: previously stripped to {id, severity} only, and
    // dropped divergenceResult.evaluated/notEvaluable entirely. That made "0
    // divergence fired" ambiguous in hindsight — could mean the market was
    // genuinely calm, OR that most of the 23 rules were notEvaluable this run
    // (data gaps) and never got a chance to fire. description/indicatorsInvolved
    // kept too — a bare rule id is meaningless months later without re-reading
    // divergenceEngine.js's source to know what it checked. No schema migration
    // needed: active_divergences is already JSONB, this just uses more of it.
    activeDivergences: {
      total: divergenceResult.total,
      evaluated: divergenceResult.evaluated,
      notEvaluable: divergenceResult.notEvaluable,
      fired: divergenceResult.fired.map(d => ({
        id: d.id, description: d.description, severity: d.severity,
        approximate: d.approximate, indicatorsInvolved: d.indicatorsInvolved,
      })),
    },
    isManualReview: decision.isManualReview,
    computedAt: new Date().toISOString(),
  };
}
