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

// Models to try in order — update this list as Google releases new ones
const FALLBACK_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-pro',
];

export async function analyze(prompt, options = {}) {
  const {
    apiKey,
    model     = null,   // null = auto-select from FALLBACK_MODELS
    maxTokens = 4096,
    onChunk   = null,
    silent    = false,
  } = options;

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY tidak diset di .env');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = model ? [model, ...FALLBACK_MODELS] : FALLBACK_MODELS;

  let lastError;

  for (const candidate of modelsToTry) {
    try {
      const gemini = genAI.getGenerativeModel({
        model: candidate,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: { maxOutputTokens: maxTokens },
      });

      if (!silent) process.stdout.write(`\n${PROVIDER_EMOJI} ${PROVIDER_NAME} menganalisis (model: ${candidate})...\n\n`);

      let fullResponse = '';
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

    } catch (err) {
      const is404 = err?.message?.includes('404') || err?.message?.includes('not found');
      if (is404) {
        if (!silent) process.stderr.write(`⚠️  Model ${candidate} not available, trying next...\n`);
        lastError = err;
        continue;
      }
      // Non-404 error — rethrow immediately
      throw err;
    }
  }

  throw new Error(`All Gemini models failed. Last error: ${lastError?.message}`);
}
