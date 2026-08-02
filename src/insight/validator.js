// ============================================
// AI INSIGHT ENGINE — Step 9, validator
//
// The AI is TOLD the constraints (max positions, min position size, band %),
// but instruction-following isn't guaranteed — this cross-checks its parsed
// allocation against the SAME numbers portfolioAllocation.js already computed,
// the same "don't trust the AI blindly, verify against ground truth" discipline
// this whole project applies to itself (CLAUDE.md's own Post-Fix Verification
// section). Violations are reported, never silently corrected — correcting the
// AI's numbers ourselves would just be a different kind of unverified guess.
//
// Layer 0-1 and Layer 4 are the only layers checked against Core/High-risk
// bands — Layer 2/3 were never assigned to either bucket in formatter.js's own
// source (the original prompt left this ambiguous, always the AI's own call).
// Asserting a mapping for them here would be inventing a rule the source
// material never stated, the same trap this project has caught itself in
// before (see portfolioAllocation.js's own scope-boundary comment).
// ============================================

const WEIGHT_SUM_TOLERANCE_PCT = 2; // allocation% + cash% should sum to ~100, small rounding slack
const BAND_TOLERANCE_PCT = 2;       // same slack applied to core/high-risk band adherence

function flattenCatalogAssets(assetCatalog) {
  const known = new Set();
  for (const layer of assetCatalog) {
    for (const a of layer.assets) known.add(a);
    for (const s of layer.speculative ?? []) known.add(s.asset);
  }
  return known;
}

function layerFor(assetCatalog, assetName) {
  for (const layer of assetCatalog) {
    if (layer.assets.includes(assetName)) return layer.layer;
    if ((layer.speculative ?? []).some(s => s.asset === assetName)) return layer.layer;
  }
  return null;
}

export function validateInsight(parsed, allocation) {
  const issues = [];
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, issues: ['parsed insight kosong/bukan object — tidak bisa divalidasi'] };
  }

  const alloc = Array.isArray(parsed.allocation) ? parsed.allocation : [];
  const knownAssets = flattenCatalogAssets(allocation.assetCatalog);

  if (alloc.length > allocation.maxActivePositions) {
    issues.push(`AI mengembalikan ${alloc.length} posisi, melebihi maxActivePositions (${allocation.maxActivePositions})`);
  }

  for (const a of alloc) {
    if (!a.asset || !knownAssets.has(a.asset)) {
      issues.push(`Aset "${a.asset ?? '?'}" tidak ada di ASSET_CATALOG — AI kemungkinan mengarang aset di luar katalog`);
    }
    if (typeof a.weightPct !== 'number' || a.weightPct <= 0) {
      issues.push(`Aset "${a.asset ?? '?'}" punya weightPct tidak valid (${a.weightPct})`);
    }
    if (allocation.portfolioSize != null && a.nominalUSD != null && a.nominalUSD < allocation.minPositionUSD) {
      issues.push(`Aset "${a.asset}" nominalUSD ($${a.nominalUSD}) di bawah minPositionUSD ($${allocation.minPositionUSD})`);
    }
  }

  const weightSum = alloc.reduce((s, a) => s + (typeof a.weightPct === 'number' ? a.weightPct : 0), 0) + (parsed.cashPct ?? 0);
  if (Math.abs(weightSum - 100) > WEIGHT_SUM_TOLERANCE_PCT) {
    issues.push(`Total allocation% + cashPct = ${weightSum.toFixed(1)}%, seharusnya ~100% (toleransi ±${WEIGHT_SUM_TOLERANCE_PCT}%)`);
  }

  // Core band check (Layer 0-1 only — the one layer formatter.js unambiguously labels "Core").
  if (allocation.coreBandPct) {
    const coreLayerName = allocation.assetCatalog.find(l => l.layer.includes('Core / Safe Haven'))?.layer;
    const coreWeight = alloc.filter(a => layerFor(allocation.assetCatalog, a.asset) === coreLayerName)
      .reduce((s, a) => s + (typeof a.weightPct === 'number' ? a.weightPct : 0), 0);
    if (coreWeight < allocation.coreBandPct.min - BAND_TOLERANCE_PCT || coreWeight > allocation.coreBandPct.max + BAND_TOLERANCE_PCT) {
      issues.push(`Core (Layer 0-1) allocation ${coreWeight.toFixed(1)}% di luar band ${allocation.coreBandPct.min}-${allocation.coreBandPct.max}%`);
    }
  }

  // High-risk band check (Layer 4 only — the one layer formatter.js unambiguously labels "High-risk").
  if (allocation.highRiskBandPct) {
    const highRiskLayerName = allocation.assetCatalog.find(l => l.layer.includes('High-Risk'))?.layer;
    const highRiskWeight = alloc.filter(a => layerFor(allocation.assetCatalog, a.asset) === highRiskLayerName)
      .reduce((s, a) => s + (typeof a.weightPct === 'number' ? a.weightPct : 0), 0);
    if (highRiskWeight > allocation.highRiskBandPct.max + BAND_TOLERANCE_PCT) {
      issues.push(`High-risk (Layer 4) allocation ${highRiskWeight.toFixed(1)}% melebihi batas ${allocation.highRiskBandPct.max}%`);
    }
  } else {
    // highRiskBandPct is null — either this phase has no stated high-risk band
    // (Fase 4: "sisa cash/stablecoin") or legacyPhase itself is unknown. Either
    // way there's no computed ceiling to check against, so ANY Layer 4
    // allocation here is unsupported by the numbers this system produced.
    const highRiskLayerName = allocation.assetCatalog.find(l => l.layer.includes('High-Risk'))?.layer;
    if (alloc.some(a => layerFor(allocation.assetCatalog, a.asset) === highRiskLayerName)) {
      issues.push('highRiskBandPct tidak didefinisikan (band kosong untuk fase/state ini), tapi AI tetap mengalokasikan ke Layer 4 (High-Risk) — tidak ada ceiling yang bisa diverifikasi');
    }
  }

  if (!Array.isArray(parsed.actionItems) || parsed.actionItems.length > 3) {
    issues.push(`actionItems seharusnya array maks 3 item, dapat: ${Array.isArray(parsed.actionItems) ? parsed.actionItems.length : typeof parsed.actionItems}`);
  }

  return { valid: issues.length === 0, issues };
}
