// ============================================
// MULTI-PROVIDER ANALYST ROUTER
// Pilih provider via --provider flag atau config
//
// Usage:
//   node src/index.js --analyze --provider claude
//   node src/index.js --analyze --provider openai
//   node src/index.js --analyze --provider gemini
//   node src/index.js --analyze --provider perplexity
//   node src/index.js --analyze --provider all    ← kirim ke semua sekaligus
// ============================================

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Import semua analyst
import * as ClaudeAnalyst      from './analysts/claude.js';
import * as OpenAIAnalyst      from './analysts/openai.js';
import * as GeminiAnalyst      from './analysts/gemini.js';
import * as PerplexityAnalyst  from './analysts/perplexity.js';

// Registry semua provider
export const PROVIDERS = {
  claude:     { module: ClaudeAnalyst,     envKey: 'anthropicApiKey',  label: 'Claude (Anthropic)' },
  openai:     { module: OpenAIAnalyst,     envKey: 'openaiApiKey',     label: 'ChatGPT (OpenAI)'   },
  gemini:     { module: GeminiAnalyst,     envKey: 'geminiApiKey',     label: 'Gemini (Google)'    },
  perplexity: { module: PerplexityAnalyst, envKey: 'perplexityApiKey', label: 'Perplexity AI'      },
};

// ── Kirim ke satu provider ────────────────────────────────────────────────────
export async function analyzeWith(providerKey, prompt, config, options = {}) {
  const provider = PROVIDERS[providerKey];
  if (!provider) throw new Error(`Provider tidak dikenal: ${providerKey}. Pilihan: ${Object.keys(PROVIDERS).join(', ')}`);

  const apiKey = config[provider.envKey];
  if (!apiKey || apiKey.startsWith('your_')) {
    console.warn(`  ⚠️  ${provider.label}: API key tidak diset, skip`);
    return null;
  }

  try {
    const result = await provider.module.analyze(prompt, {
      apiKey,
      onChunk: options.onChunk,
      silent:  options.silent ?? false,
    });
    return { provider: providerKey, label: provider.label, result };
  } catch (err) {
    console.error(`  ❌ ${provider.label} error: ${err.message}`);
    return { provider: providerKey, label: provider.label, result: null, error: err.message };
  }
}

// ── Kirim ke semua provider secara paralel ────────────────────────────────────
export async function analyzeWithAll(prompt, config) {
  console.log('\n🚀 Mengirim ke semua provider secara paralel...\n');

  const results = await Promise.allSettled(
    Object.keys(PROVIDERS).map(key =>
      analyzeWith(key, prompt, config, { silent: true })
    )
  );

  return results.map((r, i) => {
    const key = Object.keys(PROVIDERS)[i];
    if (r.status === 'fulfilled') return r.value;
    return { provider: key, label: PROVIDERS[key].label, result: null, error: r.reason?.message };
  }).filter(r => r !== null);
}

// ── Simpan analisis ke file ───────────────────────────────────────────────────
export function saveAnalysis(providerKey, content, outputDir, ts) {
  mkdirSync(outputDir, { recursive: true });

  const label = PROVIDERS[providerKey]?.label || providerKey;
  const header = [
    '═'.repeat(60),
    `  ${label.toUpperCase()} — ${new Date().toLocaleString('id-ID')}`,
    '═'.repeat(60),
    '',
  ].join('\n');

  const full = header + content;

  const file = join(outputDir, `analysis_${providerKey}_${ts}.txt`);
  writeFileSync(file, full, 'utf-8');
  writeFileSync(join(outputDir, `latest_analysis_${providerKey}.txt`), full, 'utf-8');

  return file;
}

// ── Simpan semua provider dalam satu file gabungan ───────────────────────────
export function saveAllAnalyses(analyses, outputDir, ts) {
  mkdirSync(outputDir, { recursive: true });

  const sections = analyses.map(a => {
    const label = PROVIDERS[a.provider]?.label || a.provider;
    const divider = '═'.repeat(60);
    const header = `${divider}\n  ${label.toUpperCase()}\n  ${new Date().toLocaleString('id-ID')}\n${divider}\n\n`;
    const body = a.result || `[ERROR: ${a.error || 'tidak ada respons'}]`;
    return header + body;
  });

  const combined = sections.join('\n\n' + '─'.repeat(60) + '\n\n');
  const file = join(outputDir, `analysis_all_${ts}.txt`);
  writeFileSync(file, combined, 'utf-8');
  writeFileSync(join(outputDir, 'latest_analysis_all.txt'), combined, 'utf-8');

  return file;
}
