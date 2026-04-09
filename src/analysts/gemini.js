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

// Sort priority — higher index = lower priority. Models not in this list go last.
const MODEL_PRIORITY = [
  'gemini-pro',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
];

async function fetchAvailableModels(apiKey) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`);
  if (!res.ok) throw new Error(`ListModels failed: ${res.status}`);
  const { models = [] } = await res.json();

  return models
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => m.name.replace('models/', ''))
    .sort((a, b) => {
      const rank = name => MODEL_PRIORITY.findIndex(p => name.startsWith(p));
      const ra = rank(a), rb = rank(b);
      return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb);
    });
}

export async function analyze(prompt, options = {}) {
  const { apiKey, model = null, maxTokens = 4096, onChunk = null, silent = false } = options;

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY tidak diset di .env');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const candidates = model ? [model] : await fetchAvailableModels(apiKey);

  if (!silent) process.stderr.write(`ℹ️  Gemini candidates: ${candidates.slice(0, 5).join(', ')}\n`);

  let lastError;
  for (const candidate of candidates) {
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
      const skip = msg.includes('404') || msg.includes('not found') ||
                   msg.includes('not supported') || msg.includes('deprecated') ||
                   msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests');
      if (skip) {
        if (!silent) process.stderr.write(`⚠️  ${candidate}: ${msg.includes('429') ? 'quota exceeded' : 'unavailable'}, trying next...\n`);
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw new Error(`All Gemini models exhausted. Last error: ${lastError?.message}`);
}
