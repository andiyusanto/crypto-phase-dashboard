// ============================================
// SMOKE TEST — Step 9 (AI Insight Engine), live provider call
// Run: node scripts/smoke-test-insight.js [provider1,provider2,...]
// Default providers: claude,gemini
// ============================================

import 'dotenv/config';
import { fetchAllProviders } from '../src/providers/index.js';
import { computeAllScores } from '../src/scoring/index.js';
import { evaluateDivergences } from '../src/decision/divergenceEngine.js';
import { computeConfidenceScore } from '../src/decision/confidenceScore.js';
import { determineState } from '../src/decision/stateMachine.js';
import { assessRisk } from '../src/decision/riskAssessment.js';
import { computeAllocation } from '../src/decision/portfolioAllocation.js';
import { generateInsight } from '../src/insight/index.js';

const SAMPLE_PORTFOLIO_SIZE = 1000;
const providers = (process.argv[2] || 'claude,gemini').split(',');

const config = {
  fredApiKey:          process.env.FRED_API_KEY,
  twelveDataKey:       process.env.TWELVE_DATA_API_KEY,
  alphaVantageApiKey:  process.env.ALPHA_VANTAGE_API_KEY,
  oilPriceApiKey:      process.env.OIL_PRICE_API_KEY,
  coinMarketCapApiKey: process.env.COINMARKETCAP_API_KEY,
  serpApiKey:          process.env.SERPAPI_API_KEY,
  anthropicApiKey:     process.env.ANTHROPIC_API_KEY,
  geminiApiKey:        process.env.GEMINI_API_KEY,
  perplexityApiKey:    process.env.PERPLEXITY_API_KEY,
  openRouterApiKey:    process.env.OPENROUTER_API_KEY,
};

async function main() {
  console.log('Fetching all providers (live)...');
  const providersOutput = await fetchAllProviders(config);

  console.log('Computing scores, divergences, confidence, state, risk, allocation...');
  const allScores = computeAllScores(providersOutput);
  const divergences = evaluateDivergences(providersOutput);
  const confidence = computeConfidenceScore(providersOutput, allScores, divergences);
  const decision = determineState(providersOutput, divergences, confidence, null);
  const risk = assessRisk(decision);
  const allocation = computeAllocation(risk, SAMPLE_PORTFOLIO_SIZE);

  console.log(`\nState: ${decision.state} (legacyPhase ${decision.legacyPhase}) | riskProfile: ${risk.riskProfile}`);

  for (const provider of providers) {
    console.log(`\n${'='.repeat(60)}\nCalling ${provider}...\n${'='.repeat(60)}`);
    try {
      const insight = await generateInsight(provider, config, decision, confidence, divergences, risk, allocation, providersOutput);
      console.log(`parseFailed: ${insight.parseFailed}`);
      if (insight.parseFailed) {
        console.log(`parseError: ${insight.parseError}`);
        console.log(`rawText (first 1000 chars):\n${insight.rawText.slice(0, 1000)}`);
      } else {
        console.log(`valid: ${insight.valid}`);
        if (!insight.valid) console.log(`validationIssues:\n${insight.validationIssues.map(i => '  - ' + i).join('\n')}`);
        console.log('\nparsed:');
        console.log(JSON.stringify(insight.parsed, null, 2));
      }
    } catch (err) {
      console.log(`ERROR calling ${provider}: ${err.message}`);
    }
  }
}

main().catch(err => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
