// ============================================
// ANALYST: GEMINI (Google)
// Docs: https://ai.google.dev/docs
// ============================================

import { GoogleGenerativeAI } from '@google/generative-ai';

export const PROVIDER_NAME  = 'Gemini (Google)';
export const PROVIDER_EMOJI = '🔵';

const SYSTEM_PROMPT = `Kamu adalah hedge fund analyst senior yang spesialis di crypto dan macro markets.
Keahlian: Fed liquidity mechanics, cross-asset correlation (DXY/yields/gold/oil → crypto), on-chain metrics, geopolitical risk.
Gaya: ringkas, direct, actionable. Gunakan angka konkret. Format tabel untuk scorecard (✅ ⚠️ 🔴).
Bahasa Indonesia, terminologi keuangan boleh Inggris.`;

// Preferred model order — used to rank results from ListModels
const PREFERRED_MODELS = [
  'gemini-pro',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
];

/**
 * Fetch available models from the API and return a ranked list
 * that supports generateContent.
 */
async function listAvailableModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`;
  const res = await fetch(url);
  if (!res.ok) return null; // if list fails, fall back to static list

  const data = await res.json();
  const models = (data.models || [])
    .filter(m => Array.isArray(m.supportedGenerationMethods) &&
                 m.supportedGenerationMethods.includes('generateContent'))
    .map(m => m.name.replace('models/', '')); // e.g. "models/gemini-2.0-flash" → "gemini-2.0-flash"

  // Sort by preference order; unknown models go to the end
  models.sort((a, b) => {
    const ai = PREFERRED_MODELS.findIndex(p => a.startsWith(p));
    const bi = PREFERRED_MODELS.findIndex(p => b.startsWith(p));
    const aRank = ai === -1 ? 999 : ai;
    const bRank = bi === -1 ? 999 : bi;
    return aRank - bRank;
  });

  return models;
}

export async function analyze(prompt, options = {}) {
  const {
    apiKey,
    model     = null,   // null = auto-select via ListModels
    maxTokens = 4096,
    onChunk   = null,
    silent    = false,
  } = options;

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY tidak diset di .env');
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // Build candidate list: explicit model first, then live list, then static fallback
  let modelsToTry;
  if (model) {
    modelsToTry = [model, ...PREFERRED_MODELS];
  } else {
    const liveModels = await listAvailableModels(apiKey);
    if (liveModels && liveModels.length > 0) {
      if (!silent) process.stderr.write(`ℹ️  Available Gemini models: ${liveModels.slice(0, 5).join(', ')}${liveModels.length > 5 ? '...' : ''}\n`);
      modelsToTry = liveModels;
    } else {
      modelsToTry = PREFERRED_MODELS;
    }
  }

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
      const msg = err?.message ?? '';
      const isUnavailable = msg.includes('404') || msg.includes('not found') ||
                            msg.includes('not supported') || msg.includes('deprecated');
      if (isUnavailable) {
        if (!silent) process.stderr.write(`⚠️  Model ${candidate} unavailable, trying next...\n`);
        lastError = err;
        continue;
      }
      // Any other error (auth, quota, network) — rethrow immediately
      throw err;
    }
  }

  throw new Error(`All Gemini models exhausted. Last error: ${lastError?.message}`);
}
