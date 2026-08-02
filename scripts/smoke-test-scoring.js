// ============================================
// SMOKE TEST — Step 7 (Scoring Engine)
// Runs the scoring engine against a real fetchAllProviders() call and checks the
// resulting scores are directionally reasonable given the actual indicator values
// — not just that the code runs without crashing.
// Run: node scripts/smoke-test-scoring.js
// ============================================

import 'dotenv/config';
import { fetchAllProviders } from '../src/providers/index.js';
import { computeAllScores } from '../src/scoring/index.js';

const config = {
  fredApiKey:          process.env.FRED_API_KEY,
  twelveDataKey:       process.env.TWELVE_DATA_API_KEY,
  alphaVantageApiKey:  process.env.ALPHA_VANTAGE_API_KEY,
  oilPriceApiKey:      process.env.OIL_PRICE_API_KEY,
  coinMarketCapApiKey: process.env.COINMARKETCAP_API_KEY,
  serpApiKey:          process.env.SERPAPI_API_KEY,
};

function printScore(s) {
  console.log(`\n=== ${s.label}: ${s.score ?? 'NULL (nothing scorable)'} ===`);
  console.log(`  scored: ${s.indicatorsScored} | excluded: ${s.indicatorsExcluded}`);
  if (s.contributions.length) {
    console.log('  contributions:');
    for (const c of s.contributions) {
      console.log(`    ${c.name.padEnd(38)} signal=${c.signal >= 0 ? '+' : ''}${c.signal} × weight=${c.weight} = ${c.contribution.toFixed(2)} (${c.trustTier})`);
    }
  }
  if (s.excluded.length) {
    console.log('  excluded:');
    for (const e of s.excluded) console.log(`    ${e.name.padEnd(38)} — ${e.reason}`);
  }
}

async function main() {
  console.log('Fetching all providers (live)...');
  const all = await fetchAllProviders(config);

  console.log('Computing scores...');
  const scores = computeAllScores(all);

  printScore(scores.liquidity);
  printScore(scores.macro);
  printScore(scores.crypto);
  printScore(scores.derivatives);
  printScore(scores.onchain);
  printScore(scores.war);

  console.log(`\n=== OVERALL CYCLE SCORE: ${scores.overall.score ?? 'NULL'} ===`);
  console.log('  basis:');
  for (const b of scores.overall.basis) {
    console.log(`    ${b.category.padEnd(14)} score=${b.score} weight=${b.weight}`);
  }

  // Sanity cross-check: does the overall score direction roughly match what a
  // human reading the raw data would conclude? Not a formal assertion — this
  // engine has no ground truth to assert against yet — just a printed check.
  console.log('\n=== SANITY CROSS-CHECK (manual eyeball, not an assertion) ===');
  const fg = all.crypto.indicators.find(i => i.name === 'Fear & Greed Index');
  const mvrv = all.onchain.indicators.find(i => i.name === 'MVRV Ratio (true)');
  console.log(`  Fear & Greed raw: ${fg?.rawValue} (${fg?.rawValue < 25 ? 'extreme fear' : fg?.rawValue > 60 ? 'greed' : 'neutral'})`);
  console.log(`  MVRV true raw: ${mvrv?.rawValue} (${mvrv?.signal})`);
  console.log(`  Overall score sign: ${scores.overall.score > 0 ? 'bullish-leaning' : scores.overall.score < 0 ? 'bearish-leaning' : 'neutral/unavailable'}`);
}

main().catch(err => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
