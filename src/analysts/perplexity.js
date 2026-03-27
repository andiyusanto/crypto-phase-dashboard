// ============================================
// ANALYST: PERPLEXITY AI
// Model default: llama-3.1-sonar-large-128k-online
// API: OpenAI-compatible (baseURL berbeda)
// Docs: https://docs.perplexity.ai/
//
// Kelebihan Perplexity: model "sonar" punya akses
// real-time web search — cocok untuk war headlines
// dan data yang mungkin lebih baru dari training data
// ============================================

import OpenAI from 'openai';

export const PROVIDER_NAME  = 'Perplexity AI';
export const PROVIDER_EMOJI = '🟡';

const SYSTEM_PROMPT = `Kamu adalah hedge fund analyst senior yang spesialis di crypto dan macro markets.
Keahlian: Fed liquidity mechanics, cross-asset correlation (DXY/yields/gold/oil → crypto), on-chain metrics, geopolitical risk.
Gaya: ringkas, direct, actionable. Gunakan angka konkret. Format tabel untuk scorecard (✅ ⚠️ 🔴).
Bahasa Indonesia, terminologi keuangan boleh Inggris.
Jika kamu memiliki akses ke informasi terkini dari web, gunakan untuk memperkuat analisis.`;

export async function analyze(prompt, options = {}) {
  const {
    apiKey,
    // Model Perplexity yang tersedia:
    // - llama-3.1-sonar-small-128k-online  (cepat, hemat, ada web search)
    // - llama-3.1-sonar-large-128k-online  (lebih cerdas, ada web search) ← default
    // - llama-3.1-sonar-huge-128k-online   (paling cerdas, mahal)
    model     = 'llama-3.1-sonar-large-128k-online',
    maxTokens = 4096,
    onChunk   = null,
    silent    = false,
  } = options;

  if (!apiKey || apiKey === 'your_perplexity_api_key_here') {
    throw new Error('PERPLEXITY_API_KEY tidak diset di .env');
  }

  // Perplexity pakai OpenAI SDK dengan baseURL custom
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.perplexity.ai',
  });

  if (!silent) process.stdout.write(`\n${PROVIDER_EMOJI} ${PROVIDER_NAME} menganalisis...\n\n`);

  let fullResponse = '';

  const stream = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    stream: true,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || '';
    if (text) {
      fullResponse += text;
      if (onChunk) onChunk(text);
      else if (!silent) process.stdout.write(text);
    }
  }

  if (!silent) process.stdout.write('\n');
  return fullResponse;
}
