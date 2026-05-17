## src/_unused — dead code (not in runtime path)

These modules are NOT imported anywhere in production. The actual AI dispatcher
is `src/claude-analyst.js` (despite the misleading filename — it routes ALL
providers, not just Claude). Audited 2026-05-17.

Kept for reference / potential future migration to a cleaner per-provider
architecture. If you edit these files expecting runtime effect, you'll waste
time — production reads only `src/claude-analyst.js`.

- `analyst-router.js` — alternative router design, never imported
- `analysts/{claude,gemini,openai,perplexity}.js` — per-provider native SDK
  implementations, never imported

To re-activate: switch `src/index.js:65` from `./claude-analyst.js` to a new
router that imports these files, then delete the embedded implementations in
`claude-analyst.js`.
