// ============================================
// SMOKE TEST — Step 8 Phase 2 (State Machine)
// Run: node scripts/smoke-test-decision-phase2.js
// ============================================

import 'dotenv/config';
import { fetchAllProviders } from '../src/providers/index.js';
import { computeAllScores } from '../src/scoring/index.js';
import { evaluateDivergences } from '../src/decision/divergenceEngine.js';
import { computeConfidenceScore } from '../src/decision/confidenceScore.js';
import { determineState, projectTimeline, STATES } from '../src/decision/stateMachine.js';

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

  console.log('Computing scores, divergences, confidence...');
  const allScores = computeAllScores(providersOutput);
  const divergences = evaluateDivergences(providersOutput);
  const confidence = computeConfidenceScore(providersOutput, allScores, divergences);

  console.log('\n=== EVERY STATE\'S CHECK BREAKDOWN ===');
  const decision = determineState(providersOutput, divergences, confidence, null);
  for (const e of decision.allEvaluations) {
    const flag = e.stateId === decision.state ? ' <== RESOLVED' : '';
    console.log(`  ${e.matched ? '✓' : ' '} ${e.stateId.padEnd(24)} ${e.satisfiedCount}/${e.availableCount} available (${e.unavailable.length} unavailable)${flag}`);
    for (const d of e.details) {
      console.log(`      ${d.result === true ? '✓' : d.result === false ? '✗' : '?'} ${d.name}`);
    }
  }

  console.log(`\n=== RESOLVED STATE: ${decision.state} (legacy phase ${decision.legacyPhase}) ===`);
  console.log(`  resolution: ${decision.resolution}`);
  console.log(`  confidence: ${decision.confidence}`);
  console.log(`  isManualReview: ${decision.isManualReview}`);
  console.log(`  expectedNext: ${decision.expectedNext.join(', ') || '(none)'}`);
  console.log(`  failBackTo: ${decision.failBackTo ?? '(none)'}`);
  console.log(`  blockedByDivergence: ${decision.blockedByDivergence.join(', ') || '(none)'}`);
  console.log(`  geopoliticalFlag: ${decision.geopoliticalFlag.join(', ') || '(none)'}`);

  console.log('\n=== TIMELINE PROJECTION ===');
  const timeline = projectTimeline(decision);
  console.log(timeline);

  console.log('\n=== SANITY CHECK ===');
  console.log(`Total states: ${STATES.length} | Resolved: ${decision.state} | Overall Cycle Score: ${allScores.overall.score} | Confidence: ${confidence.level}`);
  console.log('Does the resolved state make directional sense given Overall Cycle Score\'s sign? (manual eyeball)');
}

main().catch(err => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
