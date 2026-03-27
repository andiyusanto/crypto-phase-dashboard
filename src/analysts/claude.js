// ============================================
// ANALYST: CLAUDE (Anthropic)
// Model default: claude-sonnet-4-5
// Docs: https://docs.anthropic.com/
// ============================================

import Anthropic from '@anthropic-ai/sdk';

export const PROVIDER_NAME  = 'Claude';
export const PROVIDER_EMOJI = '🟣';

const SYSTEM_PROMPT = `Kamu adalah hedge fund analyst senior yang spesialis di crypto dan macro markets.
Keahlian: Fed liquidity mechanics, cross-asset correlation (DXY/yields/gold/oil → crypto), on-chain metrics, geopolitical risk.
Gaya: ringkas, direct, actionable. Gunakan angka konkret. Format tabel untuk scorecard (✅ ⚠️ 🔴).
Bahasa Indonesia, terminologi keuangan boleh Inggris.`;

export async function analyze(prompt, options = {}) {
  const {
    apiKey,
    model     = 'claude-sonnet-4-5',
    maxTokens = 4096,
    onChunk   = null,
    silent    = false,
  } = options;

  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    throw new Error('ANTHROPIC_API_KEY tidak diset di .env');
  }

  const client = new Anthropic({ apiKey });
  if (!silent) process.stdout.write(`\n${PROVIDER_EMOJI} ${PROVIDER_NAME} menganalisis...\n\n`);

  let fullResponse = '';

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      const text = chunk.delta.text;
      fullResponse += text;
      if (onChunk) onChunk(text);
      else if (!silent) process.stdout.write(text);
    }
  }

  await stream.finalMessage();
  if (!silent) process.stdout.write('\n');
  return fullResponse;
}
