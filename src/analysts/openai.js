// ============================================
// ANALYST: OPENAI (ChatGPT)
// Model default: gpt-4o
// Docs: https://platform.openai.com/docs/
// ============================================

import OpenAI from 'openai';

export const PROVIDER_NAME  = 'ChatGPT (OpenAI)';
export const PROVIDER_EMOJI = '🟢';

const SYSTEM_PROMPT = `Kamu adalah hedge fund analyst senior yang spesialis di crypto dan macro markets.
Keahlian: Fed liquidity mechanics, cross-asset correlation (DXY/yields/gold/oil → crypto), on-chain metrics, geopolitical risk.
Gaya: ringkas, direct, actionable. Gunakan angka konkret. Format tabel untuk scorecard (✅ ⚠️ 🔴).
Bahasa Indonesia, terminologi keuangan boleh Inggris.`;

export async function analyze(prompt, options = {}) {
  const {
    apiKey,
    model     = 'gpt-4o',
    maxTokens = 4096,
    onChunk   = null,
    silent    = false,
  } = options;

  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error('OPENAI_API_KEY tidak diset di .env');
  }

  const client = new OpenAI({ apiKey });
  if (!silent) process.stdout.write(`\n${PROVIDER_EMOJI} ${PROVIDER_NAME} menganalisis...\n\n`);

  let fullResponse = '';

  // OpenAI streaming
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
