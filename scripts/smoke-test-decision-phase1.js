// ============================================
// SMOKE TEST — Step 8 Phase 1 (DivergenceEngine + ConfidenceScore)
// Run: node scripts/smoke-test-decision-phase1.js
// ============================================

import 'dotenv/config';
import { fetchAllProviders } from '../src/providers/index.js';
import { computeAllScores } from '../src/scoring/index.js';
import { evaluateDivergences } from '../src/decision/divergenceEngine.js';
import { computeConfidenceScore } from '../src/decision/confidenceScore.js';

const config = {
  fredApiKey:          process.env.FRED_API_KEY,
  twelveDataKey:       process.env.TWELVE_DATA_API_KEY,
  alphaVantageApiKey:  process.env.ALPHA_VANTAGE_API_KEY,
  oilPriceApiKey:      process.env.OIL_PRICE_API_KEY,
  coinMarketCapApiKey: process.env.COINMARKETCAP_API_KEY,
  serpApiKey:          process.env.SERPAPI_API_KEY,
};

async function main() {
  console.log('Fetching all providers (live)...');
  const providersOutput = await fetchAllProviders(config);

  console.log('Computing scores...');
  const allScores = computeAllScores(providersOutput);

  console.log('Evaluating divergences...');
  const divergences = evaluateDivergences(providersOutput);

  console.log('Computing confidence...');
  const confidence = computeConfidenceScore(providersOutput, allScores, divergences);

  console.log(`\n=== DIVERGENCE ENGINE: ${divergences.total} rules total ===`);
  console.log(`  evaluated: ${divergences.evaluated} | not evaluable: ${divergences.notEvaluable} | fired: ${divergences.fired.length}`);
  console.log('\n  --- FIRED ---');
  if (!divergences.fired.length) console.log('  (none fired this run)');
  for (const d of divergences.fired) {
    console.log(`  [${d.severity}${d.approximate ? ', approximate' : ''}] ${d.id}`);
    console.log(`    ${d.description}`);
  }
  console.log('\n  --- NOT EVALUABLE (data gap, not a failure) ---');
  for (const d of divergences.all.filter(x => !x.evaluable)) {
    console.log(`  ${d.id.padEnd(35)} — ${d.reason}`);
  }
  console.log('\n  --- EVALUATED, DID NOT FIRE ---');
  for (const d of divergences.all.filter(x => x.evaluable && !x.fired)) {
    console.log(`  ${d.id}`);
  }

  console.log(`\n=== CONFIDENCE SCORE: ${confidence.level.toUpperCase()} ===`);
  console.log('  reasons:');
  confidence.reasons.forEach(r => console.log(`    - ${r}`));
  console.log(`  layer0: ${confidence.layer0.trifectaScore ?? '—'} (ratio=${confidence.layer0.ratio ?? 'n/a'}, high=${confidence.layer0.high}, weak=${confidence.layer0.weak})`);
  console.log(`  layer1-3 agreement: ${confidence.layer1to3Agreement.ratio != null ? (confidence.layer1to3Agreement.ratio * 100).toFixed(0) + '%' : 'n/a'} (sample=${confidence.layer1to3Agreement.sampleSize})`);
  console.log('  coverage by category (thin flagged with *):');
  confidence.coverageByCategory.forEach(c =>
    console.log(`    ${c.thin ? '*' : ' '} ${c.category.padEnd(20)} ${c.scored}/${c.total}${c.ratio != null ? ` (${(c.ratio * 100).toFixed(0)}%)` : ' (no data)'}`)
  );
  console.log(`  divergences: ${confidence.divergencesFired} fired (${confidence.divergencesHighSeverity} high severity), ${confidence.divergencesNotEvaluable} not evaluable`);

  console.log(`\n=== SANITY CHECK ===`);
  console.log(`Overall Cycle Score: ${allScores.overall.score} | Confidence: ${confidence.level}`);
  console.log('A human reading this should be able to tell: is this conclusion well-supported, or thin?');
}

main().catch(err => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
