// ============================================
// SMOKE TEST — Step 8 Phase 3 (RiskAssessment + PortfolioAllocation + persistence)
// Run: node scripts/smoke-test-decision-phase3.js
// Optional: set DATABASE_URL to also live-test saveMarketState() against a real
// Postgres/Supabase instance; without it, the record is built and printed but
// not persisted (same skip-with-reason discipline as everywhere else).
// ============================================

import 'dotenv/config';
import { fetchAllProviders } from '../src/providers/index.js';
import { computeAllScores } from '../src/scoring/index.js';
import { evaluateDivergences } from '../src/decision/divergenceEngine.js';
import { computeConfidenceScore } from '../src/decision/confidenceScore.js';
import { determineState } from '../src/decision/stateMachine.js';
import { assessRisk } from '../src/decision/riskAssessment.js';
import { computeAllocation } from '../src/decision/portfolioAllocation.js';
import { buildMarketStateRecord } from '../src/decision/marketStateRecord.js';

const SAMPLE_PORTFOLIO_SIZE = 1000; // arbitrary sample number, only to exercise bandToUSD()

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

  console.log('Computing scores, divergences, confidence, state...');
  const allScores = computeAllScores(providersOutput);
  const divergences = evaluateDivergences(providersOutput);
  const confidence = computeConfidenceScore(providersOutput, allScores, divergences);
  const decision = determineState(providersOutput, divergences, confidence, null);

  console.log(`\n=== STATE: ${decision.state} (legacyPhase ${decision.legacyPhase}) | resolution: ${decision.resolution} ===`);

  console.log('\n=== RISK ASSESSMENT ===');
  const risk = assessRisk(decision);
  console.log(`  riskProfile: ${risk.riskProfile}`);
  console.log(`  coreBandPct: ${risk.coreBandPct ? `${risk.coreBandPct.min}-${risk.coreBandPct.max}%` : '(none)'}`);
  console.log(`  highRiskBandPct: ${risk.highRiskBandPct ? `${risk.highRiskBandPct.min}-${risk.highRiskBandPct.max}%` : '(none — see phase 4 note)'}`);
  console.log(`  manualReviewFlag: ${risk.manualReviewFlag}`);
  if (risk.reasons.length) console.log(`  reasons: ${risk.reasons.join(' | ')}`);

  console.log(`\n=== PORTFOLIO ALLOCATION (sample portfolioSize=$${SAMPLE_PORTFOLIO_SIZE}) ===`);
  const allocation = computeAllocation(risk, SAMPLE_PORTFOLIO_SIZE);
  console.log(`  coreBandUSD: ${allocation.coreBandUSD ? `$${allocation.coreBandUSD.min}-$${allocation.coreBandUSD.max}` : '(none)'}`);
  console.log(`  highRiskBandUSD: ${allocation.highRiskBandUSD ? `$${allocation.highRiskBandUSD.min}-$${allocation.highRiskBandUSD.max}` : '(none)'}`);
  console.log(`  maxActivePositions: ${allocation.maxActivePositions} | minPositionUSD: $${allocation.minPositionUSD}`);
  console.log(`  assetCatalog layers: ${allocation.assetCatalog.map(l => l.layer).join(' | ')}`);

  console.log('\n=== PORTFOLIO ALLOCATION (portfolioSize unset — sanity check nulls degrade cleanly) ===');
  const allocationNoSize = computeAllocation(risk, null);
  console.log(`  coreBandUSD: ${allocationNoSize.coreBandUSD} | highRiskBandUSD: ${allocationNoSize.highRiskBandUSD}`);
  console.log(`  reasons: ${allocationNoSize.reasons.join(' | ')}`);

  console.log('\n=== MARKET STATE RECORD (for pgStore.js saveMarketState()) ===');
  const record = buildMarketStateRecord(decision, confidence, divergences, providersOutput);
  console.log(JSON.stringify(record, null, 2));

  if (process.env.DATABASE_URL) {
    console.log('\nDATABASE_URL is set — live-testing saveMarketState()...');
    const { saveMarketState, closePool } = await import('../src/providers/shared/pgStore.js');
    await saveMarketState(record);
    console.log('  saved OK.');
    await closePool();
  } else {
    console.log('\nDATABASE_URL not set — skipping live persistence test (record built and printed above only).');
  }

  console.log('\n=== SANITY CHECK ===');
  console.log('Does riskProfile match the resolved state\'s legacyPhase per formatter.js\'s own table? (manual eyeball: 0-1=defensif, 2=moderat, 3=agresif, 4=defensif)');
}

main().catch(err => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
