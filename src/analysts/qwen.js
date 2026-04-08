// ============================================
// ANALYST: QWEN (Puter.js)
// Model: qwen/qwen3.6-plus:free (atau qwen/qwen-max)
// Docs: https://developer.puter.com/tutorials/free-unlimited-qwen-api/
// ============================================

import { puter } from '@heyputer/puter.js';

export const PROVIDER_NAME  = 'Qwen (Puter)';
export const PROVIDER_EMOJI = '🤖';

const SYSTEM_PROMPT = `Kamu adalah hedge fund analyst senior yang spesialis di crypto dan macro markets.
Keahlian utama:
- Fed liquidity mechanics (balance sheet, RRP, reserves)
- Cross-asset correlation: DXY, yields, gold, oil → crypto
- On-chain metrics dan market structure crypto
- Geopolitical risk premium analysis

Gaya respons:
- Ringkas, direct, actionable — tanpa preamble
- Gunakan angka dan level konkret
- Format tabel untuk scorecard, gunakan emoji status (✅ ⚠️ 🔴)
- Bahasa Indonesia, terminologi keuangan boleh Inggris
- Prioritaskan kejelasan di atas kelengkapan`;

export async function analyze(prompt, options = {}) {
  const {
    apiKey,
    model     = 'qwen/qwen3.6-plus:free',
    maxTokens = 4096,
    onChunk   = null,
    silent    = false,
  } = options;

  if (apiKey && apiKey !== 'your_puter_auth_token_here') {
    puter.setAuthToken(apiKey);
  }

  if (!silent) process.stdout.write(`\n${PROVIDER_EMOJI} ${PROVIDER_NAME} menganalisis...\n\n`);

  const combinedPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${prompt}`;

  try {
    const response = await puter.ai.chat(combinedPrompt, { model });
    const fullResponse = response?.message?.content || (typeof response === 'string' ? response : JSON.stringify(response));
    
    if (onChunk) onChunk(fullResponse);
    else if (!silent) process.stdout.write(fullResponse);

    if (!silent) process.stdout.write('\n');
    return fullResponse;
  } catch (err) {
    if (!silent) console.error(`\n❌ Error Qwen (Puter): ${err.message}`);
    throw err;
  }
}
