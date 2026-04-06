# CLAUDE.md — Crypto Phase Dashboard

## Project Overview
Node.js ESM app that fetches multi-timeframe crypto/macro data, builds an AI prompt, then routes it to 1–5 AI providers (Claude, Gemini, ChatGPT, Perplexity, Grok) and delivers results via Telegram/Discord.

## Key Files
- `src/index.js` — entry point, CLI flags, main orchestration
- `src/formatter.js` — builds the AI prompt from fetched data
- `src/claude-analyst.js` — routes analysis to each provider via `analyzeWith()`
- `src/analysts/{claude,gemini,openai,perplexity}.js` — per-provider API calls
- `src/fetchers/{daily,weekly,monthly,fedliquidity,warheadlines}.js` — data sources
- `src/telegram-sender.js`, `src/discord-sender.js` — delivery
- `src/scheduler.js` — cron scheduler
- `.env` — API keys (never commit)

## Run Commands
```bash
node src/index.js                          # fetch only
node src/index.js --analyze --provider claude
node src/index.js --analyze --provider all --telegram --discord
node src/index.js --print                  # print prompt to terminal
node src/scheduler.js                      # start cron scheduler
```

## Current State (known issues to fix)
- **Main analysis flow is commented out** in `src/index.js` lines 233–302. The app currently only fetches data and prints/saves prompt — it does NOT analyze or send to channels.
- `--send-prompt` block is commented out (lines 233–246)
- fetch-only flow is commented out (lines 248–257)
- analysis loop is commented out (lines 265–300)
- `ALL_PROVIDERS` hardcoded to `['claude', 'gemini']` at line 121, not all 5

## Debug Strategy
1. Read the specific file/function first, never guess
2. Check `.env` for missing keys before diagnosing API errors
3. Run `node src/index.js --print --no-save` to test fetch + prompt without side effects
4. Check `output/latest_data.json` to verify fetched data shape
5. For API errors: check provider key in `.env`, then check the analyst file

## Token-Efficient Workflow
- **Don't read all files upfront.** Start with the file the error points to.
- **Don't read `node_modules/`, `output/`, `package-lock.json`** — never relevant.
- Use `--print --no-save` flag to test without file I/O or API calls.
- To isolate a fetcher: set `--mode=daily` (or weekly/monthly/fed) instead of all.
- Check `output/latest_data.json` instead of re-running fetchers to inspect data shape.

## Environment
- Runtime: Node.js ESM (`"type": "module"`)
- All imports use `.js` extension — required for ESM
- `.env` keys: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `XAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`, `FRED_API_KEY`, `TWELVE_DATA_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `OIL_PRICE_API_KEY`, `COINMARKETCAP_API_KEY`

## Common Errors & Fixes
| Error | Cause | Fix |
|---|---|---|
| `401` from AI provider | Invalid/missing API key | Check `.env` key for that provider |
| `Cannot find module` | Wrong import path or missing `.js` | Verify filename and add `.js` |
| Data field is `___` | Fetcher returned null/undefined | Check the relevant fetcher file |
| Analysis not running | Main analysis loop is commented out | Uncomment lines 265–302 in `src/index.js` |
| `--telegram` does nothing | `--analyze` flag not passed | Always pair `--telegram` with `--analyze` |

## Manual Overrides (src/index.js ~line 96)
`manualOverrides` object sets war status and phase without API calls. Set to `'none'` to use auto-fetch.
