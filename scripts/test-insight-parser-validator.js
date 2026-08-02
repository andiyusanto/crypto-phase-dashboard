// ============================================
// SYNTHETIC TEST — Step 9, parser + validator (no live API call)
//
// Exercises responseParser.js and validator.js against hand-crafted AI
// responses BEFORE spending real API quota on a live smoke test — cheap to
// run, catches parser/validator bugs without burning provider calls.
// Run: node scripts/test-insight-parser-validator.js
// ============================================

import { parseInsightResponse } from '../src/insight/responseParser.js';
import { validateInsight } from '../src/insight/validator.js';
import { ASSET_CATALOG } from '../src/decision/portfolioAllocation.js';

let pass = 0, fail = 0;
function check(label, condition) {
  console.log(`  ${condition ? '✓ PASS' : '✗ FAIL'} — ${label}`);
  if (condition) pass++; else fail++;
}

const fakeAllocation = {
  riskProfile: 'moderat', portfolioSize: 1000,
  coreBandPct: { min: 40, max: 60 }, coreBandUSD: { min: 400, max: 600 },
  highRiskBandPct: { min: 0, max: 20 }, highRiskBandUSD: { min: 0, max: 200 },
  maxActivePositions: 4, minPositionUSD: 50,
  assetCatalog: ASSET_CATALOG,
};

// ── Test 1: clean JSON, no fence ──────────────────────────────────────────
console.log('=== Test 1: clean JSON (no fence) ===');
{
  const raw = JSON.stringify({
    warPremium: [{ conflict: 'Rusia-Ukraine', riskLevel: 'tinggi', update: 'eskalasi', marketImpact: 'gold naik' }],
    allocation: [
      { asset: 'BTC', layer: 'Layer 0-1 (Core / Safe Haven)', weightPct: 50, nominalUSD: 500, reason: 'core' },
      { asset: 'SOL', layer: 'Layer 2 (L1 / High-Beta)', weightPct: 30, nominalUSD: 300, reason: 'momentum' },
    ],
    cashPct: 20, cashUSD: 200,
    hype: { included: false, ranking: null, category: null, reason: null },
    narrative: 'ringkas',
    actionItems: [{ action: 'ADD', asset: 'BTC', reason: 'trend up', trigger: 'break resistance' }],
    aiCaveat: null,
  });
  const { parsed, parseFailed } = parseInsightResponse(raw);
  check('parses cleanly', parseFailed === false);
  const v = validateInsight(parsed, fakeAllocation);
  check('valid: weight sum 50+30+20=100', v.valid === true);
}

// ── Test 2: JSON wrapped in ```json fence (common model behavior despite instructions) ──
console.log('\n=== Test 2: JSON wrapped in ```json fence ===');
{
  const raw = '```json\n' + JSON.stringify({
    warPremium: [], allocation: [{ asset: 'ETH', layer: 'Layer 0-1 (Core / Safe Haven)', weightPct: 100, nominalUSD: 1000, reason: 'x' }],
    cashPct: 0, cashUSD: 0, hype: { included: false }, narrative: 'x', actionItems: [], aiCaveat: null,
  }) + '\n```';
  const { parsed, parseFailed } = parseInsightResponse(raw);
  check('strips fence and parses', parseFailed === false && parsed?.allocation?.[0]?.asset === 'ETH');
}

// ── Test 3: garbage response — parser must degrade, not throw ────────────
console.log('\n=== Test 3: garbage/non-JSON response ===');
{
  const raw = 'Maaf, saya tidak bisa membantu dengan permintaan ini.';
  const { parsed, parseFailed, parseError } = parseInsightResponse(raw);
  check('parseFailed true, no throw', parseFailed === true && parsed === null);
  check('parseError is a string', typeof parseError === 'string');
}

// ── Test 4: validator catches unknown asset (AI hallucinated outside catalog) ──
console.log('\n=== Test 4: unknown asset outside ASSET_CATALOG ===');
{
  const parsed = {
    allocation: [{ asset: 'DOGE', layer: '?', weightPct: 50, nominalUSD: 500, reason: 'x' }],
    cashPct: 50, actionItems: [],
  };
  const v = validateInsight(parsed, fakeAllocation);
  check('invalid, flags unknown asset', v.valid === false && v.issues.some(i => i.includes('DOGE')));
}

// ── Test 5: validator catches too many positions ─────────────────────────
console.log('\n=== Test 5: exceeds maxActivePositions ===');
{
  const parsed = {
    allocation: [
      { asset: 'BTC', weightPct: 20, nominalUSD: 200 }, { asset: 'ETH', weightPct: 20, nominalUSD: 200 },
      { asset: 'SOL', weightPct: 20, nominalUSD: 200 }, { asset: 'AVAX', weightPct: 20, nominalUSD: 200 },
      { asset: 'XRP', weightPct: 20, nominalUSD: 200 },
    ],
    cashPct: 0, actionItems: [],
  };
  const v = validateInsight(parsed, fakeAllocation);
  check('invalid, flags 5 > maxActivePositions(4)', v.valid === false && v.issues.some(i => i.includes('5 posisi')));
}

// ── Test 6: validator catches high-risk band violation ───────────────────
console.log('\n=== Test 6: Layer 4 allocation exceeds highRiskBandPct ceiling ===');
{
  const parsed = {
    allocation: [
      { asset: 'BTC', weightPct: 40, nominalUSD: 400 },
      { asset: 'ARB', weightPct: 40, nominalUSD: 400 }, // Layer 4 — ceiling is 20%
    ],
    cashPct: 20, actionItems: [],
  };
  const v = validateInsight(parsed, fakeAllocation);
  check('invalid, flags high-risk band exceeded', v.valid === false && v.issues.some(i => i.includes('High-risk')));
}

// ── Test 7: validator catches Layer 4 allocation when highRiskBandPct is null (Fase 4 case) ──
console.log('\n=== Test 7: highRiskBandPct null (Fase 4) but AI allocates to Layer 4 anyway ===');
{
  const fase4Allocation = { ...fakeAllocation, highRiskBandPct: null, highRiskBandUSD: null };
  const parsed = {
    allocation: [
      { asset: 'BTC', weightPct: 70, nominalUSD: 700 },
      { asset: 'OP', weightPct: 10, nominalUSD: 100 }, // Layer 4, unsupported when band is null
    ],
    cashPct: 20, actionItems: [],
  };
  const v = validateInsight(parsed, fase4Allocation);
  check('invalid, flags Layer 4 alloc with no defined ceiling', v.valid === false && v.issues.some(i => i.includes('tidak didefinisikan')));
}

// ── Test 8: clean Fase-4-style allocation (Core only, no Layer 4) passes ──
console.log('\n=== Test 8: Fase 4, Core-only allocation — should be valid ===');
{
  // Fase 4's real bands per riskAssessment.js (Core >=70%, highRisk undefined)
  // — Test 7 only needed highRiskBandPct overridden, but this test's 80% core
  // weight needs the matching coreBandPct too, not Test 1-6's leftover 40-60%.
  const fase4Allocation = { ...fakeAllocation, coreBandPct: { min: 70, max: 100 }, coreBandUSD: { min: 700, max: 1000 }, highRiskBandPct: null, highRiskBandUSD: null };
  const parsed = {
    allocation: [{ asset: 'BTC', weightPct: 80, nominalUSD: 800 }],
    cashPct: 20, actionItems: [],
  };
  const v = validateInsight(parsed, fase4Allocation);
  check('valid — Core-only respects Fase 4 pattern', v.valid === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
