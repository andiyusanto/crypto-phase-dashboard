// ============================================
// SMOKE TEST — Step 6 Phase 1 (Macro + Geopolitical providers)
//
// Not part of the runtime path (not imported by src/index.js). Dev-only
// verification that the new provider layer actually runs against live data and
// produces the expected shape — per this project's own "code compiles != data
// benar" rule, this actually executes the fetchers rather than just asserting the
// code should work.
//
// Run: node scripts/smoke-test-phase1.js
// ============================================

import 'dotenv/config';
import { fetchMacroSnapshot } from '../src/providers/macro/index.js';
import { fetchGeopoliticalRisks } from '../src/providers/geopolitical/index.js';

const config = {
  fredApiKey:      process.env.FRED_API_KEY,
  twelveDataKey:   process.env.TWELVE_DATA_API_KEY,
  oilPriceApiKey:  process.env.OIL_PRICE_API_KEY,
};

function printIndicator(ind) {
  const violation = ind.boundsViolation ? ' ⚠️ BOUNDS VIOLATION' : '';
  const skip = ind.source.skipped ? ` [skipped: ${ind.source.skipReason}]` : '';
  console.log(
    `  ${ind.name.padEnd(28)} | ${String(ind.rawValue).padEnd(10)} | ` +
    `${ind.trustTier.padEnd(4)} | ${ind.measurementType.padEnd(8)} | ${ind.source.provider}${skip}${violation}`
  );
}

async function main() {
  console.log('=== MACRO PROVIDER ===');
  const macro = await fetchMacroSnapshot(config);
  console.log(`fetched ${macro.indicators.length} indicators, ${macro.fetchedAt}`);
  console.log(`liquidity: trifecta=${macro.liquidity.trifectaScore} status=${macro.liquidity.overallStatus} stress=${macro.liquidity.macroStressLabel}`);
  macro.indicators.forEach(printIndicator);

  const skippedCount = macro.indicators.filter(i => i.source.skipped).length;
  const violationCount = macro.indicators.filter(i => i.boundsViolation).length;
  console.log(`\nsummary: ${macro.indicators.length} total, ${skippedCount} skipped (no key / fetch fail), ${violationCount} bounds violations`);

  console.log('\n=== GEOPOLITICAL PROVIDER ===');
  const geo = await fetchGeopoliticalRisks();
  for (const risk of geo) {
    const skip = risk.source.skipped ? ` [skipped: ${risk.source.skipReason}]` : '';
    console.log(`  ${risk.region.padEnd(16)} | severity=${risk.severity ?? '—'} (${risk.severityLabel}) | ${risk.headline.slice(0, 70)}${skip}`);
  }

  console.log('\n=== SHAPE CHECK ===');
  const allIndicators = [...macro.indicators];
  const requiredFields = ['name', 'category', 'measurementType', 'trustTier', 'rawValue', 'signal', 'bounds', 'boundsViolation', 'source', 'computedAt'];
  let shapeOk = true;
  for (const ind of allIndicators) {
    for (const f of requiredFields) {
      if (!(f in ind)) { console.error(`  ✗ ${ind.name} missing field '${f}'`); shapeOk = false; }
    }
  }
  console.log(shapeOk ? '  ✓ all indicators have the full expected shape' : '  ✗ shape check failed — see above');
}

main().catch(err => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
