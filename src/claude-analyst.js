// ============================================
// MULTI-AI ANALYST (v4 - OpenRouter with Retry & Fallback)
// Claude / Gemini / Perplexity / ChatGPT / Grok / Qwen
// ============================================

import Anthropic        from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI           from 'openai';
import axios            from 'axios';
import { writeFileSync } from 'fs';

// ── System prompt — sama untuk semua AI ──────────────────────────────────────
export const SYSTEM_PROMPT = `Kamu adalah hedge fund analyst senior yang spesialis di crypto dan macro markets.
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

// ── OPENROUTER CONFIG ────────────────────────────────────────────────────────
const FREE_MODELS = [
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'qwen/qwen3-coder:free',
  // 'google/gemma-3n-e2b-it:free',
  // 'google/gemma-3n-e4b-it:free',
  // 'google/gemma-3-4b-it:free',
  // 'google/gemma-3-12b-it:free',
  // 'google/gemma-3-27b-it:free',
  // 'meta-llama/llama-3.3-70b-instruct:free',
  // 'meta-llama/llama-3.2-3b-instruct:free',
  // 'nousresearch/hermes-3-llama-3.1-405b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free', // Preferred
  'qwen/qwen-2.5-32b-instruct:free',       // Great for crypto
  // 'meta-llama/llama-3.1-8b-instruct:free', // Generous quota
  // 'google/gemma-2-9b-it:free'              // Reliable fallback
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',  
];

// ── HELPER: OpenRouter Fetch with Retry & Fallback ──────────────────────────
async function fetchOpenRouterWithRetry(prompt, apiKey, options = {}) {
  const { 
    maxRetries = 3, 
    onChunk, 
    silent = false,
    forcedModel = null // allow forcing a specific model (e.g. for ChatGPT/Grok)
  } = options;

  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    throw new Error('OPENROUTER_API_KEY tidak diset di .env');
  }

  // If a model is forced, we only try that model. If not, we use the fallback list.
  const modelsToTry = forcedModel ? [forcedModel] : FREE_MODELS;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (const model of modelsToTry) {
      try {
        if (!silent) console.log(`🔄 Trying OpenRouter: ${model} (attempt ${attempt + 1})...`);
        
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost',
            'X-Title': 'CryptoAnalyzer'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'user', content: `${SYSTEM_PROMPT}\n\n---\n\n${prompt}` }
            ],
            temperature: 0.3,
            max_tokens: 5000,
            stream: !!onChunk && attempt === 0 // only stream on first attempt for simplicity
          })
        });

        // Handle rate limit (429)
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After') || Math.pow(2, attempt) * 15;
          if (!silent) console.log(`⏳ Rate limited on ${model}. Waiting ${retryAfter}s...`);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue; // Retry same model after wait
        }

        // Model unavailable or rotated (404/503)
        if (res.status === 404 || res.status === 503) {
          if (!silent) console.log(`⚠️ ${model} unavailable. Switching...`);
          continue; // Try next model in list
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

        // Handle streaming response if applicable
        if (onChunk && !!onChunk && attempt === 0) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') break;
                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content || '';
                  fullText += content;
                  onChunk(content);
                  if (!silent) process.stdout.write(content);
                } catch (e) { /* skip */ }
              }
            }
          }
          if (!silent) process.stdout.write('\n');
          return fullText;
        } else {
          // Standard JSON response
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || '';
          if (!silent) {
            console.log(`✅ Success via: ${model}`);
            process.stdout.write(content + '\n');
          }
          return content;
        }

      } catch (err) {
        if (err.message.includes('429') || err.message.includes('404')) continue;
        throw err;
      }
    }
    // If all models failed in this attempt, wait before next round
    if (attempt < maxRetries - 1) {
      if (!silent) console.log(`⚠️ All models in current round failed. Waiting 30s before retry...`);
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  throw new Error('❌ All free models rate-limited or unavailable. Try again in 1-2 hours.');
}

// ── 1. CLAUDE (Anthropic) ─────────────────────────────────────────────────────
export async function analyzeWithClaude(prompt, options = {}) {
  const { apiKey, model = 'claude-sonnet-4-6', maxTokens = 5000, onChunk, silent = false } = options;
  if (!apiKey || apiKey === 'your_anthropic_api_key_here')
    throw new Error('ANTHROPIC_API_KEY tidak diset');

  const client = new Anthropic({ apiKey });
  if (!silent) process.stdout.write('\n🤖 Claude (Anthropic) menganalisis...\n\n');

  let full = '';
  const stream = client.messages.stream({
    model, max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      const t = chunk.delta.text;
      full += t;
      if (onChunk) onChunk(t); else if (!silent) process.stdout.write(t);
    }
  }
  await stream.finalMessage();
  if (!silent) process.stdout.write('\n');
  return full;
}

// ── 2. CHATGPT (OpenRouter Edition) ───────────────────────────────────────────
export async function analyzeWithChatGPT(prompt, options = {}) {
  const { model = 'openai/gpt-4o-mini', onChunk, silent = false, apiKey } = options;
  if (!silent) process.stdout.write('\n🟢 ChatGPT (via OpenRouter) menganalisis...\n\n');
  return fetchOpenRouterWithRetry(prompt, apiKey, { onChunk, silent, forcedModel: model });
}

// ── 3. GEMINI (Google) ────────────────────────────────────────────────────────
const GEMINI_PREFERRED_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-pro',
];

async function listGeminiModels(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`);
    if (!res.ok) return null;
    const data = await res.json();
    const models = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    models.sort((a, b) => {
      const ai = GEMINI_PREFERRED_MODELS.findIndex(p => a.startsWith(p));
      const bi = GEMINI_PREFERRED_MODELS.findIndex(p => b.startsWith(p));
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return models;
  } catch { return null; }
}

export async function analyzeWithGemini(prompt, options = {}) {
  const { apiKey, model = null, onChunk, silent = false } = options;
  if (!apiKey || apiKey === 'your_gemini_api_key_here')
    throw new Error('GEMINI_API_KEY tidak diset');

  const genAI = new GoogleGenerativeAI(apiKey);

  let modelsToTry;
  if (model) {
    modelsToTry = [model, ...GEMINI_PREFERRED_MODELS];
  } else {
    const live = await listGeminiModels(apiKey);
    modelsToTry = (live && live.length > 0) ? live : GEMINI_PREFERRED_MODELS;
    if (!silent && live) process.stderr.write(`ℹ️  Gemini models available: ${live.slice(0, 5).join(', ')}\n`);
  }

  let lastError;
  for (const candidate of modelsToTry) {
    try {
      const gemini = genAI.getGenerativeModel({
        model: candidate,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
      });

      if (!silent) process.stdout.write(`\n✨ Gemini (Google) menganalisis (model: ${candidate})...\n\n`);

      let full = '';
      const result = await gemini.generateContentStream(prompt);
      for await (const chunk of result.stream) {
        const t = chunk.text();
        if (t) {
          full += t;
          if (onChunk) onChunk(t); else if (!silent) process.stdout.write(t);
        }
      }
      if (!silent) process.stdout.write('\n');
      return full;

    } catch (err) {
      const msg = err?.message ?? '';
      const isUnavailable = msg.includes('404') || msg.includes('not found') ||
                            msg.includes('not supported') || msg.includes('deprecated');
      const isQuotaExceeded = msg.includes('429') || msg.includes('quota') ||
                              msg.includes('Too Many Requests');
      if (isUnavailable || isQuotaExceeded) {
        const reason = isQuotaExceeded ? 'quota exceeded' : 'unavailable';
        if (!silent) process.stderr.write(`⚠️  Gemini model ${candidate} ${reason}, trying next...\n`);
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw new Error(`All Gemini models exhausted. Last error: ${lastError?.message}`);
}

// ── 4. PERPLEXITY (Sonar) ─────────────────────────────────────────────────────
export async function analyzeWithPerplexity(prompt, options = {}) {
  const { apiKey, model = 'sonar-pro', onChunk, silent = false } = options;
  if (!apiKey || apiKey === 'your_perplexity_api_key_here')
    throw new Error('PERPLEXITY_API_KEY tidak diset');

  if (!silent) process.stdout.write('\n🔍 Perplexity Sonar menganalisis...\n\n');

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, stream: true, max_tokens: 5000, temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: prompt },
      ],
      return_citations: true,
    }),
  });

  if (!response.ok) throw new Error(`Perplexity ${response.status}: ${await response.text()}`);

  let full = '';
  const citations = [];
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') break;
      try {
        const parsed = JSON.parse(raw);
        const t = parsed.choices?.[0]?.delta?.content ?? '';
        if (t) {
          full += t;
          if (onChunk) onChunk(t); else if (!silent) process.stdout.write(t);
        }
        if (parsed.citations) citations.push(...parsed.citations);
      } catch { /* skip malformed */ }
    }
  }

  if (citations.length > 0) {
    const block = '\n\n---\n**Sumber:**\n' +
      [...new Set(citations)].slice(0, 5).map((c, i) => `[${i+1}] ${c}`).join('\n');
    full += block;
    if (!silent) process.stdout.write(block + '\n');
  }
  if (!silent) process.stdout.write('\n');
  return full;
}

// ── 5. xAI GROK (OpenRouter Edition) ──────────────────────────────────────────
export async function analyzeWithGrok(prompt, options = {}) {
  const { model = 'x-ai/grok-beta', onChunk, silent = false, apiKey } = options;
  if (!silent) process.stdout.write('\n⚡ Grok (via OpenRouter) menganalisis...\n\n');
  return fetchOpenRouterWithRetry(prompt, apiKey, { onChunk, silent, forcedModel: model });
}

// ── 6. QWEN (OpenRouter Edition) ──────────────────────────────────────────────
export async function analyzeWithQwen(prompt, options = {}) {
  const { onChunk, silent = false, apiKey } = options;
  if (!silent) process.stdout.write('\n🤖 Qwen (via OpenRouter dengan Retry & Fallback) menganalisis...\n\n');
  // Qwen uses the fallback list of free models
  return fetchOpenRouterWithRetry(prompt, apiKey, { onChunk, silent });
}

// ── GENERIC ANALYZE (for router compatibility) ───────────────────────────────
export async function analyze(prompt, options = {}) {
  const provider = options.provider || 'claude'; 
  return analyzeWith(provider, prompt, options.config || {}, options);
}

// ── DISPATCHER ────────────────────────────────────────────────────────────────
export async function analyzeWith(provider, prompt, config, options = {}) {
  const openRouterKey = config.openRouterApiKey;

  switch (provider) {
    case 'claude':
      return analyzeWithClaude(prompt,      { apiKey: config.anthropicApiKey,  ...options });
    case 'chatgpt':
      return analyzeWithChatGPT(prompt,     { apiKey: openRouterKey,    ...options });
    case 'gemini':
      return analyzeWithGemini(prompt,      { apiKey: config.geminiApiKey,     ...options });
    case 'perplexity':
      return analyzeWithPerplexity(prompt,  { apiKey: config.perplexityApiKey, ...options });
    case 'grok':
      return analyzeWithGrok(prompt,        { apiKey: openRouterKey,    ...options });
    case 'qwen':
      return analyzeWithQwen(prompt,        { apiKey: openRouterKey,    ...options });
    default:
      throw new Error(`Provider tidak dikenal: "${provider}"`);
  }
}

// ── SIMPAN ANALISIS ───────────────────────────────────────────────────────────
export function saveAnalysis(analysis, outputDir, timestamp, provider = 'claude') {
  const ts = timestamp || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const header = [
    '═'.repeat(60),
    `  ANALISIS ${provider.toUpperCase()} — ${new Date().toLocaleString('id-ID')}`,
    '═'.repeat(60), '',
  ].join('\n');

  const content = typeof analysis === 'string' ? header + analysis : '';
  const fname = `analysis_${provider}_${ts}.txt`;

  writeFileSync(`${outputDir}/${fname}`, content, 'utf-8');
  writeFileSync(`${outputDir}/latest_analysis_${provider}.txt`, content, 'utf-8');
  if (provider !== 'all') writeFileSync(`${outputDir}/latest_analysis.txt`, content, 'utf-8');
  return `${outputDir}/${fname}`;
}
