// ============================================
// AI INSIGHT ENGINE — Step 9, orchestrator
//
// Ties promptBuilder -> claude-analyst.js's existing dispatcher (analyzeWith,
// Step 6-and-earlier's 6-provider router, untouched) -> responseParser ->
// validator into one call. Additive: does not touch formatter.js, index.js,
// or the senders — same rule every step since Step 6 has followed.
// ============================================

import { analyzeWith } from '../claude-analyst.js';
import { buildInsightPrompt } from './promptBuilder.js';
import { parseInsightResponse } from './responseParser.js';
import { validateInsight } from './validator.js';

export { buildInsightPrompt } from './promptBuilder.js';
export { parseInsightResponse } from './responseParser.js';
export { validateInsight } from './validator.js';

// `provider` — one of claude-analyst.js's 6 providers ('claude', 'chatgpt',
// 'gemini', 'perplexity', 'grok', 'qwen'). `config` — same shape src/index.js
// already builds (apiKeys). Rest are Decision Engine outputs (Step 8).
export async function generateInsight(provider, config, decision, confidence, divergenceResult, riskAssessment, allocation, providersOutput, options = {}) {
  const prompt = buildInsightPrompt(decision, confidence, divergenceResult, riskAssessment, allocation, providersOutput);

  const rawText = await analyzeWith(provider, prompt, config, { silent: true, ...options });

  const { parsed, parseFailed, parseError } = parseInsightResponse(rawText);
  const validation = parseFailed ? { valid: false, issues: ['response tidak bisa di-parse jadi JSON, lihat parseError'] }
    : validateInsight(parsed, allocation);

  return {
    provider,
    prompt,
    rawText,
    parsed,
    parseFailed,
    parseError,
    valid: validation.valid,
    validationIssues: validation.issues,
    generatedAt: new Date().toISOString(),
  };
}
