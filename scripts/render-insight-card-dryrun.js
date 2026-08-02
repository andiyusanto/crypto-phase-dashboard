// ============================================
// DRY-RUN — Step 10 Insight Card rendering (NO actual send)
//
// Live AI keys aren't available in this sandbox (see Step 9's smoke test),
// so this exercises formatInsightForTelegram()/buildInsightEmbed() with a
// hand-crafted Insight object matching the JSON schema promptBuilder.js asks
// for, on top of REAL live Decision Engine output — verifies the rendering
// logic itself (both the "valid" and "parseFailed" paths) without needing a
// live LLM call or sending anything to a real channel.
// Run: node scripts/render-insight-card-dryrun.js
// ============================================

import 'dotenv/config';
import { fetchAllProviders } from '../src/providers/index.js';
import { computeAllScores } from '../src/scoring/index.js';
import { evaluateDivergences } from '../src/decision/divergenceEngine.js';
import { computeConfidenceScore } from '../src/decision/confidenceScore.js';
import { determineState } from '../src/decision/stateMachine.js';
import { assessRisk } from '../src/decision/riskAssessment.js';
import { computeAllocation } from '../src/decision/portfolioAllocation.js';
import { formatInsightForTelegram } from '../src/telegram-sender.js';
import { buildInsightEmbed } from '../src/discord-sender.js';

const config = {
  fredApiKey: process.env.FRED_API_KEY, twelveDataKey: process.env.TWELVE_DATA_API_KEY,
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY, oilPriceApiKey: process.env.OIL_PRICE_API_KEY,
  coinMarketCapApiKey: process.env.COINMARKETCAP_API_KEY, serpApiKey: process.env.SERPAPI_API_KEY,
};

function fakeValidInsight(provider = 'claude-dryrun') {
  return {
    provider, parseFailed: false, parseError: null, valid: true, validationIssues: [],
    rawText: '(fake — dry-run)',
    parsed: {
      warPremium: [
        { conflict: 'Rusia-Ukraine', riskLevel: 'tinggi', update: 'Eskalasi serangan drone di area residensial.', marketImpact: 'Gold naik, risk-off jangka pendek pada risk asset.' },
        { conflict: 'Timteng', riskLevel: 'sedang', update: 'Gencatan senjata rapuh, kondisi belum stabil.', marketImpact: 'Oil premium moderat.' },
      ],
      allocation: [
        { asset: 'BTC', layer: 'Layer 0-1 (Core / Safe Haven)', weightPct: 35, nominalUSD: 350, reason: 'Core holding, state BTC Leadership mendukung.' },
        { asset: 'ETH', layer: 'Layer 0-1 (Core / Safe Haven)', weightPct: 15, nominalUSD: 150, reason: 'Core diversifikasi.' },
        { asset: 'SOL', layer: 'Layer 2 (L1 / High-Beta)', weightPct: 20, nominalUSD: 200, reason: 'Momentum L1 masih kuat minggu ini.' },
      ],
      cashPct: 30, cashUSD: 300,
      hype: { included: false, ranking: null, category: null, reason: null },
      narrative: 'BTC Leadership dengan confidence rendah — Layer 0 data tidak tersedia dan coverage tipis di beberapa kategori. Alokasi dijaga konservatif dengan cash buffer 30% mengingat manual review flag aktif dari eskalasi Rusia-Ukraine.',
      actionItems: [
        { action: 'HOLD', asset: 'BTC', reason: 'Core position, tidak ada sinyal exit', trigger: 'MVRV > 3.5 atau reserve naik tajam' },
        { action: 'WAIT', asset: 'SOL', reason: 'Tunggu konfirmasi lebih lanjut sebelum nambah', trigger: 'SOL/BTC breakout > 3% WoW' },
      ],
      aiCaveat: 'Data Fed Trifecta tidak tersedia run ini — confidence classification kurang solid dari biasanya.',
    },
  };
}

function fakeParseFailedInsight(provider = 'claude-dryrun') {
  return {
    provider, parseFailed: true, parseError: 'tidak ada JSON valid ditemukan di response', valid: false, validationIssues: [],
    rawText: 'Maaf, saya tidak bisa memproses permintaan ini dalam format JSON yang diminta. Berikut analisis saya dalam bentuk teks: BTC menunjukkan kekuatan relatif...',
    parsed: null,
  };
}

async function main() {
  console.log('Fetching all providers (live) + computing Decision Engine output...');
  const providersOutput = await fetchAllProviders(config);
  const allScores = computeAllScores(providersOutput);
  const divergences = evaluateDivergences(providersOutput);
  const confidence = computeConfidenceScore(providersOutput, allScores, divergences);
  const decision = determineState(providersOutput, divergences, confidence, null);
  const risk = assessRisk(decision);
  const allocation = computeAllocation(risk, 1000);

  console.log(`\nState: ${decision.state} (legacyPhase ${decision.legacyPhase}) | riskProfile: ${risk.riskProfile}`);

  console.log(`\n${'='.repeat(60)}\nTELEGRAM CARD — valid insight\n${'='.repeat(60)}`);
  console.log(formatInsightForTelegram(decision, confidence, risk, allocation, fakeValidInsight()));

  console.log(`\n${'='.repeat(60)}\nTELEGRAM CARD — parseFailed fallback\n${'='.repeat(60)}`);
  console.log(formatInsightForTelegram(decision, confidence, risk, allocation, fakeParseFailedInsight()));

  console.log(`\n${'='.repeat(60)}\nDISCORD EMBED PAYLOAD — valid insight\n${'='.repeat(60)}`);
  console.log(JSON.stringify(buildInsightEmbed(decision, confidence, risk, allocation, fakeValidInsight()), null, 2));

  console.log(`\n${'='.repeat(60)}\nDISCORD EMBED PAYLOAD — parseFailed fallback\n${'='.repeat(60)}`);
  console.log(JSON.stringify(buildInsightEmbed(decision, confidence, risk, allocation, fakeParseFailedInsight()), null, 2));

  console.log('\n=== SANITY CHECK ===');
  console.log('Telegram text length within TELEGRAM_MAX_CHARS(4000)/chunk? (auto-split handles overflow, but eyeball for reasonable single-chunk size)');
  console.log('Discord embed field count/char length within Discord limits (25 fields, 1024/field, 6000 total)? (eyeball)');
}

main().catch(err => {
  console.error('DRY-RUN FAILED:', err);
  process.exit(1);
});
