// ============================================
// ANALYST: GEMINI (Google)
// Model default: gemini-1.5-pro
// Docs: https://ai.google.dev/docs
// ============================================

import { GoogleGenerativeAI } from '@google/generative-ai';

export const PROVIDER_NAME  = 'Gemini (Google)';
export const PROVIDER_EMOJI = '🔵';

const SYSTEM_PROMPT = `Kamu adalah hedge fund analyst senior yang spesialis di crypto dan macro markets.
Keahlian: Fed liquidity mechanics, cross-asset correlation (DXY/yields/gold/oil → crypto), on-chain metrics, geopolitical risk.
Gaya: ringkas, direct, actionable. Gunakan angka konkret. Format tabel untuk scorecard (✅ ⚠️ 🔴).
Bahasa Indonesia, terminologi keuangan boleh Inggris.`;

export async function analyze(prompt, options = {}) {
  const {
    apiKey,
    // model     = 'gemini-1.5-pro',
    model     = 'gemini-1.5-flash',
    maxTokens = 4096,
    onChunk   = null,
    silent    = false,
  } = options;

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY tidak diset di .env');
  }

  const genAI  = new GoogleGenerativeAI(apiKey);
  const gemini = genAI.getGenerativeModel({
    model,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { maxOutputTokens: maxTokens },
  });

  if (!silent) process.stdout.write(`\n${PROVIDER_EMOJI} ${PROVIDER_NAME} menganalisis...\n\n`);

  let fullResponse = '';

  // Gemini streaming
  const result = await gemini.generateContentStream(prompt);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      fullResponse += text;
      if (onChunk) onChunk(text);
      else if (!silent) process.stdout.write(text);
    }
  }

  if (!silent) process.stdout.write('\n');
  return fullResponse;
}
