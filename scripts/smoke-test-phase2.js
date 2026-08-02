// ============================================
// SMOKE TEST — Step 6 Phase 2 (Crypto + Derivatives + On-chain providers)
// Not part of the runtime path. Run: node scripts/smoke-test-phase2.js
// ============================================

import 'dotenv/config';
import { fetchAllProviders } from '../src/providers/index.js';

const config = {
  fredApiKey:          process.env.FRED_API_KEY,
  twelveDataKey:       process.env.TWELVE_DATA_API_KEY,
  alphaVantageApiKey:  process.env.ALPHA_VANTAGE_API_KEY,
  oilPriceApiKey:      process.env.OIL_PRICE_API_KEY,
  coinMarketCapApiKey: process.env.COINMARKETCAP_API_KEY,
  serpApiKey:          process.env.SERPAPI_API_KEY,
};

function printSection(title, snapshot) {
  console.log(`\n=== ${title} (${snapshot.indicators.length} indicators) ===`);
  for (const ind of snapshot.indicators) {
    const violation = ind.boundsViolation ? ' ⚠️ BOUNDS VIOLATION' : '';
    const skip = ind.source.skipped ? ` [skipped: ${ind.source.skipReason}]` : '';
    console.log(
      `  ${ind.name.padEnd(38)} | ${String(ind.rawValue).padEnd(12)} | ${String(ind.signal ?? '—').slice(0, 30).padEnd(30)} | ` +
      `${ind.trustTier.padEnd(4)} ${ind.measurementType.padEnd(8)} | ${ind.source.provider}${skip}${violation}`
    );
  }
}

async function main() {
  const t0 = Date.now();
  const all = await fetchAllProviders(config);
  console.log(`\nTotal fetch time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  printSection('CRYPTO', all.crypto);
  printSection('DERIVATIVES', all.derivatives);
  printSection('ON-CHAIN', all.onchain);

  const btc = all.crypto.indicators.find(i => i.name === 'BTC Price');
  console.log(`\nBTC spot price used for downstream calcs (CME premium, NVT): $${btc?.rawValue ?? 'N/A'}`);

  const nvt = all.onchain.indicators.find(i => i.name === 'NVT Signal');
  console.log(`NVT Signal (N-C fix check): rawValue=${nvt?.rawValue ?? 'N/A'} signal="${nvt?.signal ?? 'N/A'}"`);

  const skew = all.derivatives.indicators.find(i => i.name === 'Phase 4 Skew (basis-funding divergence)');
  console.log(`Phase 4 Skew (N-D fix check): signal="${skew?.signal ?? 'N/A'}"`);

  const cme = all.derivatives.indicators.find(i => i.name === 'BTC CME Futures Premium (%)');
  console.log(`CME Premium (N-A/N-E fix check): rawValue=${cme?.rawValue ?? 'N/A'}`);

  const infraAssetNames = ['ARB (Arbitrum)', 'OP (Optimism)', 'POL (Polygon)', 'LDO (Lido DAO)', 'AAVE', 'UNI (Uniswap)', 'LINK (Chainlink)'];
  const infraAssets = all.crypto.indicators.filter(i => infraAssetNames.includes(i.name));
  const infraAssetsWithData = infraAssets.filter(i => i.rawValue != null);
  console.log(`\nNew Infra/DeFi assets: ${infraAssetsWithData.length}/7 returned real data (${infraAssets.length}/7 indicator objects present regardless)`);
  infraAssets.forEach(i => console.log(`  ${i.name.padEnd(20)} $${i.rawValue ?? '—'} ${i.signal ?? (i.source.skipped ? `[skipped: ${i.source.skipReason}]` : '')}`));

  console.log('\n=== SHAPE CHECK (all 3 providers) ===');
  const allInd = [...all.crypto.indicators, ...all.derivatives.indicators, ...all.onchain.indicators];
  const requiredFields = ['name', 'category', 'measurementType', 'trustTier', 'rawValue', 'signal', 'bounds', 'boundsViolation', 'source', 'computedAt'];
  let shapeOk = true;
  for (const ind of allInd) {
    for (const f of requiredFields) {
      if (!(f in ind)) { console.error(`  ✗ ${ind.name} missing '${f}'`); shapeOk = false; }
    }
  }
  console.log(shapeOk ? `  ✓ all ${allInd.length} indicators have the full expected shape` : '  ✗ shape check failed');

  const violations = allInd.filter(i => i.boundsViolation);
  console.log(`\nBounds violations: ${violations.length}`);
  violations.forEach(v => console.log(`  ⚠️ ${v.name}: ${v.rawValue} outside [${v.bounds.min}, ${v.bounds.max}] — ${v.bounds.hint}`));
}

main().catch(err => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
