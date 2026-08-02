// ============================================
// RISK ASSESSMENT — Step 8 Phase 3
//
// Implements Step 4's RiskAssessment entity. Grounded 1:1 in formatter.js's own
// existing "ATURAN RISK PROFILE" table (formatter.js:700-706), which up to now
// was pure prose the AI applied itself each run — never code. riskProfile and
// its core/high-risk bands are a direct function of `legacyPhase` (0-4), which
// determineState() (Step 8 Phase 2) already computes — no new thresholds
// invented, just the existing table made executable.
//
// Phase 4's band ("Core >= 70%, sisa cash/stablecoin") has no explicit
// high-risk ceiling in the source table — read literally as "no high-risk
// allocation guidance given", not as an invented 0%. Modeled as `highRisk: null`
// rather than fabricating a number the original rule never stated.
//
// SCOPE BOUNDARY (confirmed with user before implementing): isManualReview
// (geopolitical severity-5 or divergence-blocked, from Step 8 Phase 2) does NOT
// change riskProfile or the bands below — it is surfaced only as a flag/reason,
// same discipline stateMachine.js already applies to severity-5 (it flags, it
// never silently overrides a value the data doesn't support). Auto-downgrading
// bands on manual-review would be a brand-new rule with no source grounding.
// ============================================

const RISK_PROFILE_BY_PHASE = {
  0: { riskProfile: 'defensif', core: { min: 60, max: 100 }, highRisk: { min: 0, max: 10 } },
  1: { riskProfile: 'defensif', core: { min: 60, max: 100 }, highRisk: { min: 0, max: 10 } },
  2: { riskProfile: 'moderat',  core: { min: 40, max: 60 },  highRisk: { min: 0, max: 20 } },
  3: { riskProfile: 'agresif',  core: { min: 30, max: 100 }, highRisk: { min: 0, max: 35 } },
  4: { riskProfile: 'defensif', core: { min: 70, max: 100 }, highRisk: null }, // "sisa cash/stablecoin" — no high-risk band stated
};

// `decision` = determineState()'s output (Step 8 Phase 2).
export function assessRisk(decision) {
  const phase = decision.legacyPhase;
  const table = phase != null ? RISK_PROFILE_BY_PHASE[phase] : null;

  const reasons = [];
  if (!table) {
    reasons.push(`legacyPhase tidak diketahui (state="${decision.state}") — riskProfile tidak bisa ditentukan`);
  }
  if (decision.isManualReview) {
    reasons.push('isManualReview aktif (geopolitical severity-5 atau divergence blocking) — ' +
      'riskProfile & bands di bawah TIDAK di-downgrade otomatis, tapi hasil ini butuh review manual sebelum dieksekusi');
  }
  if (decision.resolution === 'inconclusive' || decision.resolution === 'no-match-insufficient-data') {
    reasons.push(`resolution="${decision.resolution}" — state tidak solid, riskProfile ini mengikuti legacyPhase dari state terakhir yang diketahui, bukan kondisi market yang baru dikonfirmasi`);
  }

  return {
    riskProfile: table?.riskProfile ?? null,
    coreBandPct: table?.core ?? null,
    highRiskBandPct: table?.highRisk ?? null,
    basedOnPhase: phase,
    basedOnState: decision.state,
    manualReviewFlag: !!decision.isManualReview,
    reasons,
  };
}
