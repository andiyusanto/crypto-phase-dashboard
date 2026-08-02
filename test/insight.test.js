// ============================================
// UNIT TESTS — Step 9, migrated to node:test (Step 11)
//
// Migrated from scripts/test-insight-parser-validator.js (same cases,
// node:test/assert instead of a hand-rolled counter). Exercises
// responseParser.js and validator.js against hand-crafted AI responses —
// cheap to run, catches parser/validator bugs without needing a live provider
// call (Step 9's own smoke test found none of the 6 providers' API keys are
// configured in this sandbox, so this synthetic layer is the only coverage
// that currently runs at all here).
// Run: node --test test/insight.test.js
// ============================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseInsightResponse } from '../src/insight/responseParser.js';
import { validateInsight } from '../src/insight/validator.js';
import { ASSET_CATALOG } from '../src/decision/portfolioAllocation.js';

const fakeAllocation = {
  riskProfile: 'moderat', portfolioSize: 1000,
  coreBandPct: { min: 40, max: 60 }, coreBandUSD: { min: 400, max: 600 },
  highRiskBandPct: { min: 0, max: 20 }, highRiskBandUSD: { min: 0, max: 200 },
  maxActivePositions: 4, minPositionUSD: 50,
  assetCatalog: ASSET_CATALOG,
};

describe('parseInsightResponse', () => {
  test('clean JSON (no fence) parses and validates', () => {
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
    assert.equal(parseFailed, false);
    const v = validateInsight(parsed, fakeAllocation);
    assert.equal(v.valid, true, `expected valid, got issues: ${v.issues.join('; ')}`);
  });

  test('JSON wrapped in ```json fence (common model behavior despite instructions) still parses', () => {
    const raw = '```json\n' + JSON.stringify({
      warPremium: [], allocation: [{ asset: 'ETH', layer: 'Layer 0-1 (Core / Safe Haven)', weightPct: 100, nominalUSD: 1000, reason: 'x' }],
      cashPct: 0, cashUSD: 0, hype: { included: false }, narrative: 'x', actionItems: [], aiCaveat: null,
    }) + '\n```';
    const { parsed, parseFailed } = parseInsightResponse(raw);
    assert.equal(parseFailed, false);
    assert.equal(parsed.allocation[0].asset, 'ETH');
  });

  test('garbage/non-JSON response degrades to parseFailed, never throws', () => {
    const raw = 'Maaf, saya tidak bisa membantu dengan permintaan ini.';
    const { parsed, parseFailed, parseError } = parseInsightResponse(raw);
    assert.equal(parseFailed, true);
    assert.equal(parsed, null);
    assert.equal(typeof parseError, 'string');
  });
});

describe('validateInsight', () => {
  test('flags an asset outside ASSET_CATALOG (AI hallucinated)', () => {
    const parsed = { allocation: [{ asset: 'DOGE', layer: '?', weightPct: 50, nominalUSD: 500, reason: 'x' }], cashPct: 50, actionItems: [] };
    const v = validateInsight(parsed, fakeAllocation);
    assert.equal(v.valid, false);
    assert.ok(v.issues.some(i => i.includes('DOGE')));
  });

  test('flags exceeding maxActivePositions', () => {
    const parsed = {
      allocation: ['BTC', 'ETH', 'SOL', 'AVAX', 'XRP'].map(asset => ({ asset, weightPct: 20, nominalUSD: 200 })),
      cashPct: 0, actionItems: [],
    };
    const v = validateInsight(parsed, fakeAllocation);
    assert.equal(v.valid, false);
    assert.ok(v.issues.some(i => i.includes('5 posisi')));
  });

  test('flags Layer 4 allocation exceeding a defined highRiskBandPct ceiling', () => {
    const parsed = { allocation: [{ asset: 'BTC', weightPct: 40, nominalUSD: 400 }, { asset: 'ARB', weightPct: 40, nominalUSD: 400 }], cashPct: 20, actionItems: [] };
    const v = validateInsight(parsed, fakeAllocation);
    assert.equal(v.valid, false);
    assert.ok(v.issues.some(i => i.includes('High-risk')));
  });

  test('flags Layer 4 allocation when highRiskBandPct is null (Fase 4 case — no defined ceiling to check against)', () => {
    const fase4Allocation = { ...fakeAllocation, highRiskBandPct: null, highRiskBandUSD: null };
    const parsed = { allocation: [{ asset: 'BTC', weightPct: 70, nominalUSD: 700 }, { asset: 'OP', weightPct: 10, nominalUSD: 100 }], cashPct: 20, actionItems: [] };
    const v = validateInsight(parsed, fase4Allocation);
    assert.equal(v.valid, false);
    assert.ok(v.issues.some(i => i.includes('tidak didefinisikan')));
  });

  test('Fase-4-style Core-only allocation (no Layer 4) is valid', () => {
    const fase4Allocation = { ...fakeAllocation, coreBandPct: { min: 70, max: 100 }, coreBandUSD: { min: 700, max: 1000 }, highRiskBandPct: null, highRiskBandUSD: null };
    const parsed = { allocation: [{ asset: 'BTC', weightPct: 80, nominalUSD: 800 }], cashPct: 20, actionItems: [] };
    const v = validateInsight(parsed, fase4Allocation);
    assert.equal(v.valid, true, `expected valid, got issues: ${v.issues.join('; ')}`);
  });
});
