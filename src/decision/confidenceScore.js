// ============================================
// CONFIDENCE SCORE — Step 8 Phase 1
//
// Implements Step 4's ConfidenceScore entity. Absorbs formatter.js:546-552's
// original calibration rule (Layer 0 Fed Trifecta health), but that alone is NOT
// sufficient — Step 7's live testing found categories scoring from a small
// fraction of their indicators (Liquidity fully null in one run; Crypto on
// 6/27). This function explicitly factors in each category's
// indicatorsScored/indicatorsExcluded ratio from Step 7's output, so a category
// scored from 3/27 indicators cannot produce the same confidence ceiling as one
// scored from 20/27 — this is the specific requirement this session's review
// established before Step 8 began; it is not optional here.
//
// Also factors in Step 8 Phase 1's DivergenceEngine output: unresolved
// high-severity divergences downgrade confidence.
// ============================================

const COVERAGE_THIN_THRESHOLD = 0.3; // a category scored from <30% of its indicators is "thin"

function parseTrifecta(trifectaScore) {
  if (!trifectaScore || typeof trifectaScore !== 'string') return { green: 0, total: 0 };
  const [green, total] = trifectaScore.split('/').map(Number);
  return { green: green || 0, total: total || 0 };
}

export function computeConfidenceScore(providersOutput, allScores, divergenceResult) {
  const reasons = [];
  let level = 'tinggi';

  // 1. Layer 0 (Fed Trifecta) health — formatter.js's original rule.
  const { green, total: trifectaTotal } = parseTrifecta(providersOutput.macro.liquidity.trifectaScore);
  const layer0Unavailable = providersOutput.macro.liquidity.overallStatus === 'DATA_UNAVAILABLE';
  const layer0Weak = trifectaTotal > 0 && (green / trifectaTotal) <= 1 / 3;
  if (layer0Unavailable || layer0Weak) {
    level = 'sedang';
    reasons.push(layer0Unavailable
      ? 'Layer 0 (Fed Trifecta) tidak tersedia'
      : `Layer 0 (Fed Trifecta) lemah: ${green}/${trifectaTotal} hijau`);
  }

  // 2. Coverage ratio per category (NEW — the requirement established this session).
  const categories = ['liquidity', 'macro', 'crypto', 'derivatives', 'onchain', 'war'];
  const coverageByCategory = categories.map((cat) => {
    const s = allScores[cat];
    const totalInd = s.indicatorsScored + s.indicatorsExcluded;
    const ratio = totalInd > 0 ? s.indicatorsScored / totalInd : null;
    return { category: s.label, scored: s.indicatorsScored, total: totalInd, ratio };
  });
  const thinCategories = coverageByCategory.filter(c => c.total > 0 && c.ratio < COVERAGE_THIN_THRESHOLD);

  if (thinCategories.length >= 3) {
    level = 'rendah';
    reasons.push(`Coverage sangat tipis di ${thinCategories.length} kategori: ` +
      thinCategories.map(c => `${c.category} (${c.scored}/${c.total})`).join('; '));
  } else if (thinCategories.length >= 1) {
    if (level === 'tinggi') level = 'sedang';
    reasons.push(`Coverage tipis di: ` + thinCategories.map(c => `${c.category} (${c.scored}/${c.total})`).join('; '));
  }

  // 3. Unresolved divergences.
  const highSeverityFired = divergenceResult.fired.filter(d => d.severity === 'high');
  if (highSeverityFired.length >= 2) {
    level = 'rendah';
    reasons.push(`${highSeverityFired.length} divergence severity tinggi belum terselesaikan (${highSeverityFired.map(d => d.id).join(', ')})`);
  } else if (highSeverityFired.length === 1) {
    if (level === 'tinggi') level = 'sedang';
    reasons.push(`1 divergence severity tinggi terdeteksi (${highSeverityFired[0].id})`);
  }

  if (reasons.length === 0) {
    reasons.push('Layer 0 sehat, coverage memadai di semua kategori, tidak ada divergence signifikan');
  }

  return {
    level, // 'tinggi' | 'sedang' | 'rendah'
    reasons,
    layer0Health: providersOutput.macro.liquidity.trifectaScore,
    coverageByCategory,
    divergencesEvaluated: divergenceResult.evaluated,
    divergencesNotEvaluable: divergenceResult.notEvaluable,
    divergencesFired: divergenceResult.fired.length,
    divergencesHighSeverity: highSeverityFired.length,
  };
}
