// ============================================
// AI INSIGHT ENGINE — Step 9, response parser
//
// Never throws. The prompt asks for pure JSON, but 6 different models (some
// free-tier, none of them reliably instruction-following) are in play — a
// parse failure here must degrade to a flagged, inspectable result, not crash
// the pipeline. Same discipline as this project's DataSource.skipped pattern:
// a failure is data, not an exception.
// ============================================

// Strips a ```json ... ``` or ``` ... ``` fence if the model wrapped the JSON
// in one despite being told not to — the single most common instruction-
// following failure observed across free-tier models in this project's other
// AI calls (see claude-analyst.js's Gemini stream-parse-failure handling for
// a similar "models don't always behave" precedent).
function stripCodeFence(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : text.trim();
}

// Fallback if there's stray prose around the JSON despite instructions: take
// the substring between the first `{` and the last `}`.
function extractBraces(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export function parseInsightResponse(rawText) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return { parsed: null, parseFailed: true, parseError: 'response kosong', rawText };
  }

  const candidates = [stripCodeFence(rawText), extractBraces(rawText)].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return { parsed, parseFailed: false, parseError: null, rawText };
    } catch (err) {
      // try next candidate
    }
  }

  return { parsed: null, parseFailed: true, parseError: 'tidak ada JSON valid ditemukan di response', rawText };
}
