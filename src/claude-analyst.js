// ============================================
// MULTI-AI ANALYST
// Claude / Gemini / Perplexity / ChatGPT (OpenAI)
// ============================================

import Anthropic        from '@anthropic-ai/sdk';
import { GoogleGenAI }  from '@google/genai';
import OpenAI           from 'openai';
import axios            from 'axios';
import { writeFileSync } from 'fs';
import { puter }        from '@heyputer/puter.js';

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

// ── 1. CLAUDE (Anthropic) ─────────────────────────────────────────────────────
export async function analyzeWithClaude(prompt, options = {}) {
  const { apiKey, model = 'claude-sonnet-4-5', maxTokens = 4096, onChunk, silent = false } = options;
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

// ── 2. CHATGPT (OpenAI via Puter AI) ──────────────────────────────────────────
// OpenAI via Puter — Model: openai/gpt-4o
// Daftar: developer.puter.com
export async function analyzeWithChatGPT(prompt, options = {}) {
  const {
    model = 'openai/gpt-4o',
    onChunk,
    silent = false,
    apiKey // puterAuthToken
  } = options;

  if (apiKey && apiKey !== 'your_puter_auth_token_here' && apiKey !== 'your_openai_api_key_here') {
    puter.auth.setToken(apiKey);
  }

  if (!silent) process.stdout.write('\n🟢 ChatGPT (OpenAI via Puter) menganalisis...\n\n');

  let full = '';
  const combinedPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${prompt}`;

  try {
    const response = await puter.ai.chat(combinedPrompt, {
      model,
      stream: true
    });

    for await (const part of response) {
      const t = part?.text || '';
      if (t) {
        full += t;
        if (onChunk) onChunk(t); else if (!silent) process.stdout.write(t);
      }
    }
    if (!silent) process.stdout.write('\n');
    return full;
  } catch (err) {
    throw new Error(`ChatGPT (Puter) error: ${err.message}`);
  }
}

// ── 3. GEMINI (Google) ────────────────────────────────────────────────────────
export async function analyzeWithGemini(prompt, options = {}) {
  const { apiKey, model = 'gemini-2.5-flash', onChunk, silent = false } = options;
  if (!apiKey || apiKey === 'your_gemini_api_key_here')
    throw new Error('GEMINI_API_KEY tidak diset — dapatkan di aistudio.google.com');

  const ai = new GoogleGenAI({ apiKey });
  if (!silent) process.stdout.write('\n✨ Gemini (Google) menganalisis...\n\n');

  let full = '';
  const result = await ai.models.generateContentStream({
    model,
    contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n---\n\n${prompt}` }] }],
    generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
  });

  for await (const chunk of result) {
    const t = chunk.text ?? '';
    if (t) {
      full += t;
      if (onChunk) onChunk(t); else if (!silent) process.stdout.write(t);
    }
  }
  if (!silent) process.stdout.write('\n');
  return full;
}

// ── 4. PERPLEXITY (Sonar) ─────────────────────────────────────────────────────
export async function analyzeWithPerplexity(prompt, options = {}) {
  const { apiKey, model = 'sonar-pro', onChunk, silent = false } = options;
  if (!apiKey || apiKey === 'your_perplexity_api_key_here')
    throw new Error('PERPLEXITY_API_KEY tidak diset — perplexity.ai/settings/api');

  if (!silent) process.stdout.write('\n🔍 Perplexity Sonar menganalisis...\n\n');

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, stream: true, max_tokens: 4096, temperature: 0.2,
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

// ── 5. xAI GROK (via Puter AI) ────────────────────────────────────────────────
// xAI API via Puter — Model: x-ai/grok-4-1-fast atau x-ai/grok-4
// Daftar: developer.puter.com
export async function analyzeWithGrok(prompt, options = {}) {
  const {
    model = 'x-ai/grok-4-1-fast',
    onChunk,
    silent = false,
    apiKey // puterAuthToken
  } = options;

  if (apiKey && apiKey !== 'your_puter_auth_token_here' && apiKey !== 'your_xai_api_key_here') {
    puter.auth.setToken(apiKey);
  }

  if (!silent) process.stdout.write('\n⚡ Grok (xAI via Puter) menganalisis...\n\n');

  let full = '';
  const combinedPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${prompt}`;

  try {
    const response = await puter.ai.chat(combinedPrompt, {
      model,
      stream: true
    });

    for await (const part of response) {
      const t = part?.text || '';
      if (t) {
        full += t;
        if (onChunk) onChunk(t); else if (!silent) process.stdout.write(t);
      }
    }
    if (!silent) process.stdout.write('\n');
    return full;
  } catch (err) {
    throw new Error(`Grok (Puter) error: ${err.message}`);
  }
}

// ── 6. QWEN (Puter.js) ────────────────────────────────────────────────────────
export async function analyzeWithQwen(prompt, options = {}) {
  const {
    model = 'qwen/qwen3.6-plus:free',
    onChunk,
    silent = false,
    apiKey // though Puter says no API key required for free tier
  } = options;

  if (apiKey && apiKey !== 'your_puter_auth_token_here') {
    puter.auth.setToken(apiKey);
  }

  if (!silent) process.stdout.write('\n🤖 Qwen (Puter AI) menganalisis...\n\n');

  let full = '';
  const combinedPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${prompt}`;

  try {
    const response = await puter.ai.chat(combinedPrompt, {
      model,
      stream: true
    });

    for await (const part of response) {
      const t = part?.text || '';
      if (t) {
        full += t;
        if (onChunk) onChunk(t); else if (!silent) process.stdout.write(t);
      }
    }
    if (!silent) process.stdout.write('\n');
    return full;
  } catch (err) {
    throw new Error(`Qwen (Puter) error: ${err.message}`);
  }
}

// ── GENERIC ANALYZE (for router compatibility) ───────────────────────────────
export async function analyze(prompt, options = {}) {
  // Try to determine provider from options or default to claude
  // This is for files that import * as ClaudeAnalyst and call .analyze()
  const provider = options.provider || 'claude'; 
  return analyzeWith(provider, prompt, options.config || {}, options);
}

// ── DISPATCHER ────────────────────────────────────────────────────────────────
export async function analyzeWith(provider, prompt, config, options = {}) {
  switch (provider) {
    case 'claude':
      return analyzeWithClaude(prompt,      { apiKey: config.anthropicApiKey,  ...options });
    case 'chatgpt':
      return analyzeWithChatGPT(prompt,     { apiKey: config.puterAuthToken,    ...options });
    case 'gemini':
      return analyzeWithGemini(prompt,      { apiKey: config.geminiApiKey,     ...options });
    case 'perplexity':
      return analyzeWithPerplexity(prompt,  { apiKey: config.perplexityApiKey, ...options });
    case 'grok':
      return analyzeWithGrok(prompt,        { apiKey: config.puterAuthToken,    ...options });
    case 'qwen':
      return analyzeWithQwen(prompt,        { apiKey: config.puterAuthToken,    ...options });
    default:
      throw new Error(`Provider tidak dikenal: "${provider}". Pilih: claude, chatgpt, gemini, perplexity, grok, qwen`);
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

  const content = typeof analysis === 'string'
    ? header + analysis
    : Object.entries(analysis)
        .filter(([, v]) => v)
        .map(([p, t]) => `\n${'═'.repeat(60)}\n  ANALISIS ${p.toUpperCase()}\n${'═'.repeat(60)}\n\n${t}`)
        .join('\n\n');

  const fname = provider === 'all'
    ? `analysis_all_${ts}.txt`
    : `analysis_${provider}_${ts}.txt`;

  writeFileSync(`${outputDir}/${fname}`, content, 'utf-8');
  writeFileSync(`${outputDir}/latest_analysis_${provider}.txt`, content, 'utf-8');
  if (provider !== 'all') writeFileSync(`${outputDir}/latest_analysis.txt`, content, 'utf-8');
  return `${outputDir}/${fname}`;
}
