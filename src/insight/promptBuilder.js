// ============================================
// AI INSIGHT ENGINE — Step 9, prompt builder
//
// Prior to this step, formatter.js asked the AI to do EVERYTHING: classify the
// phase, build the scorecard, detect divergences, compute a risk profile, AND
// pick a portfolio allocation — all from raw numbers, in one giant prompt
// (formatter.js:1-887), with zero structured parsing of the response
// (claude-analyst.js just saves whatever text comes back to a .txt file).
//
// Steps 6-8 made the phase/state, confidence, divergences, and risk/allocation
// bands deterministic, code-computed facts — this prompt hands the AI those
// facts as GIVEN, and narrows its job to the parts that are still genuinely
// qualitative judgment with no formula anywhere in this codebase:
//   1. Pick specific assets + weights from ASSET_CATALOG, inside the computed
//      USD bands (formatter.js:674 "DINAMIS...berdasarkan kondisi market
//      minggu ini" — exactly the scope portfolioAllocation.js deferred here).
//   2. War Premium narrative per conflict, from the headlines already fetched
//      (formatter.js:815-825).
//   3. $HYPE's hypeRanking/hypeCategory/hypeReason (formatter.js:834-837).
//   4. A short narrative + up to 3 action items (formatter.js:866-869).
//
// The AI is explicitly told NOT to re-derive state/confidence/divergences —
// those are presented as ground truth, not something to re-litigate. It CAN
// flag a qualitative caveat (aiCaveat) if live context it knows about
// contradicts the computed read, but that's advisory only — same discipline
// stateMachine.js already applies to geopolitical severity-5 (flag, never
// silently override a value the data doesn't support).
// ============================================

const CONFLICT_LABELS = { 'Middle East': 'Timteng', 'Russia-Ukraine': 'Rusia-Ukraine', 'Taiwan': 'Taiwan' };

function fmtUSD(n) { return n == null ? '—' : `$${n.toLocaleString('en-US')}`; }

function formatDivergences(divergenceResult) {
  if (!divergenceResult.fired.length) {
    return `Tidak ada divergence yang fired (${divergenceResult.evaluated}/${divergenceResult.total} rule bisa dievaluasi run ini, ${divergenceResult.notEvaluable} tidak — data tidak cukup, BUKAN berarti semuanya aman).`;
  }
  return divergenceResult.fired.map(d =>
    `- [${d.severity}] ${d.description}${d.approximate ? ' (approximate)' : ''}`
  ).join('\n');
}

function formatAssetCatalog(assetCatalog) {
  return assetCatalog.map(l => {
    const spec = l.speculative ? ` | speculative: ${l.speculative.map(s => s.asset).join(', ')}` : '';
    return `- ${l.layer}: ${l.assets.join(', ')}${spec}`;
  }).join('\n');
}

function formatGeopolitical(geopolitical) {
  return (geopolitical ?? []).map(g =>
    `- ${CONFLICT_LABELS[g.region] ?? g.region}: severity ${g.severity ?? '—'}/5 (${g.severityLabel}) — "${g.headline}"${g.isManualOverride ? ' [manual override]' : ''}`
  ).join('\n');
}

export const INSIGHT_JSON_SCHEMA_DESCRIPTION = `{
  "warPremium": [ { "conflict": "Timteng"|"Rusia-Ukraine"|"Taiwan", "riskLevel": "rendah"|"sedang"|"tinggi", "update": string, "marketImpact": string } ],
  "allocation": [ { "asset": string, "layer": string, "weightPct": number, "nominalUSD": number|null, "reason": string } ],
  "cashPct": number,
  "cashUSD": number|null,
  "hype": { "included": boolean, "ranking": string|null, "category": "DeFi core"|"High-risk"|"Meme"|null, "reason": string|null },
  "narrative": string,
  "actionItems": [ { "action": "HOLD"|"ADD"|"TRIM"|"WAIT"|"HEDGE", "asset": string, "reason": string, "trigger": string } ],
  "aiCaveat": string|null
}`;

// `decision`=determineState() output, `confidence`=computeConfidenceScore(),
// `divergenceResult`=evaluateDivergences(), `riskAssessment`=assessRisk(),
// `allocation`=computeAllocation(), `providersOutput`=fetchAllProviders().
export function buildInsightPrompt(decision, confidence, divergenceResult, riskAssessment, allocation, providersOutput) {
  return `## KONTEKS — SUDAH DIHITUNG SISTEM, JANGAN DIHITUNG ULANG

State: **${decision.state}** (legacy phase ${decision.legacyPhase}, resolution: ${decision.resolution})
Confidence: **${confidence.level}** — ${confidence.reasons.join('; ')}
${decision.isManualReview ? `⚠️ MANUAL REVIEW FLAG AKTIF (geopolitical severity-5 dan/atau divergence blocking) — ${decision.geopoliticalFlag.length ? `region: ${decision.geopoliticalFlag.join(', ')}` : ''}${decision.blockedByDivergence.length ? ` divergence: ${decision.blockedByDivergence.join(', ')}` : ''}\n` : ''}
Divergensi aktif (${divergenceResult.fired.length}/${divergenceResult.total}):
${formatDivergences(divergenceResult)}

Risk Profile: **${riskAssessment.riskProfile ?? 'tidak diketahui'}**
- Core band: ${riskAssessment.coreBandPct ? `${riskAssessment.coreBandPct.min}-${riskAssessment.coreBandPct.max}%` : '(tidak didefinisikan)'} (${fmtUSD(allocation.coreBandUSD?.min)}-${fmtUSD(allocation.coreBandUSD?.max)})
- High-risk band: ${riskAssessment.highRiskBandPct ? `${riskAssessment.highRiskBandPct.min}-${riskAssessment.highRiskBandPct.max}%` : '(tidak didefinisikan untuk fase ini — sisa ke cash/stablecoin)'} (${fmtUSD(allocation.highRiskBandUSD?.min)}-${fmtUSD(allocation.highRiskBandUSD?.max)})
- Portfolio size: ${fmtUSD(allocation.portfolioSize)}
- Maks posisi aktif: ${allocation.maxActivePositions} | Min per posisi: ${fmtUSD(allocation.minPositionUSD)}

Katalog aset (HANYA pilih dari sini):
${formatAssetCatalog(allocation.assetCatalog)}

War headlines (severity 1-5, sumber Google News RSS):
${formatGeopolitical(providersOutput.geopolitical)}

---
## TUGAS KAMU

State, confidence, dan divergensi di atas adalah GROUND TRUTH dari sistem —
JANGAN hitung ulang atau bantah fase/confidence-nya. Tugas kamu HANYA 4 hal:

1. **War Premium** — untuk tiap konflik di atas, tentukan riskLevel dan dampak market singkat.
2. **Allocation** — pilih aset spesifik dari katalog (maks ${allocation.maxActivePositions} posisi, tiap posisi ≥ ${fmtUSD(allocation.minPositionUSD)} kalau portfolio size diketahui), alokasikan sesuai kondisi market minggu ini dalam batas band Core/High-risk di atas. Sisa yang tidak dialokasikan → cashPct/cashUSD.
3. **$HYPE** — apakah masuk allocation minggu ini? Kalau ya isi ranking/category/reason, kalau tidak set included:false.
4. **Narrative + action items** — ringkas (3-5 kalimat) + maks 3 action item format [HOLD/ADD/TRIM/WAIT/HEDGE].

Kalau ada konteks kualitatif yang kamu tahu (breaking news, dll) yang bikin kamu ragu sama state/confidence di atas, tulis di "aiCaveat" — JANGAN diam-diam mengabaikannya, tapi JANGAN juga mengubah angka yang sudah dihitung sistem.

## FORMAT RESPONSE — WAJIB

Balas HANYA dengan JSON valid, TANPA markdown code fence, TANPA teks lain di luar JSON. Schema:

${INSIGHT_JSON_SCHEMA_DESCRIPTION}`;
}
