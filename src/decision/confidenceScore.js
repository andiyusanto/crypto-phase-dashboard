// ============================================
// CONFIDENCE SCORE — Step 8 Phase 1 (revised)
//
// Implements Step 4's ConfidenceScore entity, absorbing formatter.js:546-552's
// original calibration rule — not just its two magic numbers (1/3, 2/3), but its
// actual STRUCTURE:
//   "tinggi" hanya valid jika ≥2/3 Layer 0 hijau DAN ≥70% Layer 1-3 searah.
//   Layer 0 DATA_UNAVAILABLE atau ≤1/3 hijau → downgrade max ke "sedang".
//   Jika ditambah lagi konflik Layer 1-3 yang tidak terselesaikan → "rendah".
// "tinggi" is something that must be EARNED (all conditions met), not just the
// default state when nothing bad happened — the previous version of this file
// got that backwards.
//
// Two extensions beyond the original prose rule, both explicit and documented
// rather than silently added:
// 1. Coverage ratio (indicatorsScored/indicatorsExcluded per category, from
//    Step 7) — the original rule predates having a real Scoring Engine, so it
//    had no way to reference this. Established as a hard requirement before
//    Step 8 began, per this session's review.
// 2. DivergenceEngine's severity-tagged output (Step 8 Phase 1) operationalizes
//    "konflik Layer 1-3 yang tidak terselesaikan" as specific, named rules
//    instead of an undefined "conflict" concept.
//
// THRESHOLD PROVENANCE — every number here is either (a) quoted directly from
// the existing formatter.js rule (1/3, 2/3, 70%), or (b) a general, widely-used
// statistical minimum-sample-size convention (n≥3 — a common informal floor for
// treating an average as more than anecdotal), never a felt-right percentage
// invented fresh for this file. Real validation of even (a) and (b) requires
// backtesting against historical outcomes, which db/postgres's
// market_state_history table cannot yet support (too little history
// accumulated) — flagged as a future revisit, same limitation Step 4B already
// documented for indicator-level thresholds.
// ============================================

import { classifySignal } from '../scoring/signalClassifier.js';
import { LIQUIDITY_INDICATOR_NAMES } from '../scoring/index.js';

const LAYER0_HIGH_RATIO   = 2 / 3;  // formatter.js's existing "tinggi" requirement
const LAYER0_WEAK_RATIO   = 1 / 3;  // formatter.js's existing "downgrade" trigger
const AGREEMENT_HIGH_RATIO = 0.7;   // formatter.js's existing "≥70% Layer 1-3 searah"
const MIN_AGREEMENT_SAMPLE = 3;     // can't meaningfully compute "searah" from fewer than this
const COVERAGE_MIN_RATIO  = 1 / 3;  // aligned to the same 1/3 Layer 0 already uses in this project, not a separate invented number
const COVERAGE_MIN_COUNT  = 3;      // general minimum-sample-size convention, not project-specific

function parseTrifecta(trifectaScore) {
  if (!trifectaScore || typeof trifectaScore !== 'string') return { green: 0, total: 0 };
  const [green, total] = trifectaScore.split('/').map(Number);
  return { green: green || 0, total: total || 0 };
}

// "Layer 1-3 searah" (aligned): among every scored, non-Liquidity indicator's
// classified signal, what fraction share the majority direction? Deliberately
// measures agreement among the indicators themselves, not agreement with the
// Overall Cycle Score (which is downstream of these same indicators — comparing
// against it would be circular).
function computeLayer1to3Agreement(providersOutput) {
  const nonLiquidityMacro = providersOutput.macro.indicators.filter(i => !LIQUIDITY_INDICATOR_NAMES.has(i.name));
  const all = [
    ...nonLiquidityMacro,
    ...providersOutput.crypto.indicators,
    ...providersOutput.derivatives.indicators,
    ...providersOutput.onchain.indicators,
  ];
  const signals = all.map(classifySignal).filter(s => s != null && s !== 0);
  if (signals.length < MIN_AGREEMENT_SAMPLE) return { ratio: null, sampleSize: signals.length };

  const positive = signals.filter(s => s > 0).length;
  const negative = signals.filter(s => s < 0).length;
  return { ratio: Math.max(positive, negative) / signals.length, sampleSize: signals.length };
}

// Cara 2's fix: percentage alone treats a 2/7 Liquidity score and an 8/27 Crypto
// score as equally "thin" or "not thin" depending only on the ratio, ignoring
// that 2 data points is a much less stable average than 8 regardless of what
// percentage either represents. A category is thin if EITHER the percentage
// falls below the (already-precedented) 1/3 mark, OR the absolute scored count
// falls below a general minimum-sample-size floor — whichever is more
// conservative for that category's size.
function computeCoverage(allScores) {
  const categories = ['liquidity', 'macro', 'crypto', 'derivatives', 'onchain', 'war'];
  return categories.map((cat) => {
    const s = allScores[cat];
    const total = s.indicatorsScored + s.indicatorsExcluded;
    const ratio = total > 0 ? s.indicatorsScored / total : null;
    const thin = total > 0 && (ratio < COVERAGE_MIN_RATIO || s.indicatorsScored < COVERAGE_MIN_COUNT);
    return { category: s.label, scored: s.indicatorsScored, total, ratio, thin };
  });
}

export function computeConfidenceScore(providersOutput, allScores, divergenceResult) {
  const reasons = [];

  const { green, total: trifectaTotal } = parseTrifecta(providersOutput.macro.liquidity.trifectaScore);
  const layer0Unavailable = providersOutput.macro.liquidity.overallStatus === 'DATA_UNAVAILABLE';
  const layer0Ratio = trifectaTotal > 0 ? green / trifectaTotal : null;
  const layer0High = layer0Ratio != null && layer0Ratio >= LAYER0_HIGH_RATIO;
  const layer0Weak = layer0Unavailable || (layer0Ratio != null && layer0Ratio <= LAYER0_WEAK_RATIO);

  const agreement = computeLayer1to3Agreement(providersOutput);
  const agreementHigh = agreement.ratio != null && agreement.ratio >= AGREEMENT_HIGH_RATIO;

  const coverageByCategory = computeCoverage(allScores);
  const thinCategories = coverageByCategory.filter(c => c.thin);

  const highSeverityFired = divergenceResult.fired.filter(d => d.severity === 'high');

  // "tinggi" must be earned — every condition below has to hold, not just
  // "nothing bad triggered a downgrade" (the previous version's bug).
  let level = (layer0High && agreementHigh && thinCategories.length === 0 && highSeverityFired.length === 0)
    ? 'tinggi' : 'sedang';

  if (!layer0High) reasons.push(layer0Ratio == null
    ? 'Layer 0 (Fed Trifecta) tidak tersedia'
    : `Layer 0 hanya ${green}/${trifectaTotal} hijau (butuh ≥2/3 untuk "tinggi")`);
  if (!agreementHigh) reasons.push(agreement.ratio == null
    ? `Layer 1-3 agreement tidak bisa dihitung (sample cuma ${agreement.sampleSize}, butuh ≥${MIN_AGREEMENT_SAMPLE})`
    : `Layer 1-3 cuma ${(agreement.ratio * 100).toFixed(0)}% searah (butuh ≥70%)`);
  if (thinCategories.length) reasons.push(`Coverage tipis di: ` +
    thinCategories.map(c => `${c.category} (${c.scored}/${c.total})`).join('; '));
  if (highSeverityFired.length) reasons.push(`${highSeverityFired.length} divergence severity tinggi: ` +
    highSeverityFired.map(d => d.id).join(', '));

  // Downgrade to "rendah" — mirrors the original rule's compounding structure
  // ("Layer 0 lemah DAN ada konflik tidak terselesaikan → rendah") plus two
  // explicit extensions beyond it, each justified on its own rather than
  // silently folded in: (a) divergence severity is now a real, countable signal
  // that didn't exist when the original rule was written, so ≥2 unresolved
  // high-severity divergences can independently justify "rendah" even with
  // healthy Layer 0 — two HIGH-trust indicators actively contradicting each
  // other is new information the original rule had no way to see; (b) coverage
  // this thin across most of the system (≥3 categories) means most of the
  // analysis has no real data behind it regardless of Layer 0.
  if ((layer0Weak && (highSeverityFired.length >= 1 || thinCategories.length >= 1)) ||
      highSeverityFired.length >= 2 ||
      thinCategories.length >= 3) {
    level = 'rendah';
  }

  return {
    level, // 'tinggi' | 'sedang' | 'rendah'
    reasons: reasons.length ? reasons : ['Semua syarat "tinggi" terpenuhi: Layer 0 sehat, Layer 1-3 searah, coverage memadai, tidak ada divergence signifikan'],
    layer0: { trifectaScore: providersOutput.macro.liquidity.trifectaScore, ratio: layer0Ratio, high: layer0High, weak: layer0Weak },
    layer1to3Agreement: agreement,
    coverageByCategory,
    divergencesEvaluated: divergenceResult.evaluated,
    divergencesNotEvaluable: divergenceResult.notEvaluable,
    divergencesFired: divergenceResult.fired.length,
    divergencesHighSeverity: highSeverityFired.length,
  };
}
