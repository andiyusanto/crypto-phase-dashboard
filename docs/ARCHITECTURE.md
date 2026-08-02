# ACCIS Architecture — Adaptive Crypto Cycle Intelligence System

This document covers the domain-modeled system built across Steps 6-10 of a
12-step architectural transformation (see "Roadmap status" below). It exists
**alongside** the original AI-prompt-driven pipeline (`src/index.js` →
`formatter.js` → `claude-analyst.js` → `telegram-sender.js`/`discord-sender.js`'s
original functions), which is still what actually runs in production. Nothing
described here is wired into that production path yet — see "Integration
status" at the end.

## Why this exists

The original system asked an AI to do everything from one giant markdown
prompt (`formatter.js`, ~900 lines): classify the market phase, build a
scorecard, detect cross-indicator divergences, compute a risk profile, and
pick a portfolio allocation — all in free-form prose, with no structured
output and no way to unit-test any of that reasoning. ACCIS moves everything
that has an actual, groundable formula into deterministic code, and narrows
the AI's job to what's genuinely still qualitative judgment (see the AI
Insight Engine section).

## Data flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ src/fetchers/*.js  (legacy — same fetch functions the old pipeline   │
│ uses; ACCIS wraps them, does not duplicate or replace their network  │
│ calls)                                                                │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PROVIDERS (src/providers/)  — Step 6                                 │
│ Normalizes raw fetcher output into typed Indicator/DataSource shapes │
│ macro · crypto · derivatives · onchain · geopolitical                │
│ fetchAllProviders(config, geoOverrides) → one combined snapshot      │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │
                 ┌───────────────┼────────────────┐
                 ▼                                 ▼
┌───────────────────────────┐   ┌─────────────────────────────────────┐
│ SCORING (src/scoring/)     │   │ (providersOutput passed through      │
│ Step 7 — per-category      │   │  directly to Decision Engine too —   │
│ weighted score [-1,+1],    │   │  category scores AND raw indicators  │
│ full contribution/         │   │  are both needed downstream)         │
│ exclusion trace            │   │                                       │
└───────────────┬─────────────┘   └──────────────────┬────────────────┘
                │                                     │
                └───────────────────┬─────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DECISION ENGINE (src/decision/)  — Step 8, 3 phases                  │
│                                                                        │
│  Phase 1: DivergenceEngine + ConfidenceScore                         │
│    23 cross-indicator contradiction rules → fired[]/severity          │
│    Confidence tier (tinggi/sedang/rendah) — "tinggi" must be earned  │
│                                                                        │
│  Phase 2: StateMachine                                                │
│    10-state taxonomy, entry-condition checks against named            │
│    indicators (not category scores) → resolved state + candidates    │
│                                                                        │
│  Phase 3: RiskAssessment + PortfolioAllocation + persistence          │
│    riskProfile + Core/High-risk % and USD bands, 1:1 from legacyPhase │
│    buildMarketStateRecord() → db/postgres's market_state_history      │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ AI INSIGHT ENGINE (src/insight/)  — Step 9                           │
│ Sends the Decision Engine's output to an AI (via the EXISTING        │
│ claude-analyst.js dispatcher, unmodified) as ground truth — the AI   │
│ is told NOT to re-derive state/confidence/divergences. Its narrowed  │
│ job: pick specific assets+weights inside the computed bands, write   │
│ War Premium narrative, $HYPE judgment, action items. Response        │
│ requested as JSON, parsed + cross-validated against the same         │
│ constraints portfolioAllocation.js computed (never trusted blindly). │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DASHBOARD (telegram-sender.js / discord-sender.js — new functions)   │
│ Step 10 — rich cards from the Insight object, reusing the existing   │
│ send/retry/chunking transport layer. Degrades gracefully to a raw-   │
│ text fallback card if the AI's JSON failed to parse.                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Domain shapes (`src/providers/shared/`)

- **Indicator** (`indicator.js`) — `{name, category, measurementType, trustTier, rawValue, normalizedValue, signal, bounds, boundsViolation, source, weight, computedAt}`. `measurementType` is one of `direct`/`proxy`/`invented`; `trustTier` is `high`/`low` (`confidenceTiers.js`) and is what the Scoring Engine's weight derives from — not a separate hardcoded per-indicator table.
- **DataSource** (`dataSource.js`) — `{provider, fetchedAt, observedAt, ageDays, isFromCache, cachedAt, isStale, skipped, skipReason}`. A missing/failed fetch is `skipped:true` with a reason, never a silently-zeroed value.
- **GeopoliticalRisk** (`geopolitical/index.js`) — 3 fixed regions (Middle East, Russia-Ukraine, Taiwan), `severity` 1-5 from a keyword-counting heuristic over scraped headlines, tagged LOW trust / `invented` measurement type.

## Providers (`src/providers/`) — 74 Indicators total

| Category | File(s) | Count |
|---|---|---|
| Macro | `macro/{dailyMacro,fedLiquidity,monthly,weeklyMacro}.js` | 18 |
| Crypto | `crypto/{marketStructure,price,rotation}.js` | 28 |
| Derivatives | `derivatives/index.js` | 9 |
| OnChain | `onchain/index.js` | 19 |
| Geopolitical | `geopolitical/index.js` | 3 (GeopoliticalRisk, not Indicator) |

Counts verified by direct grep of `makeIndicator({` call sites (including
loop-generated ones — `rotation.js`'s 7 Infra/DeFi assets come from one call
site inside a `for` loop, not 7 separate literal calls) — re-checked before
writing this doc, not quoted from memory. This project has twice previously
stated a wrong count from memory (an "18 rules" that was actually 23, a "53
indicators" that was actually 74) and corrected both after re-grepping; this
number carries the same verification, not a repeat of that mistake.

`fetchAllProviders(config, geoOverrides)` (`providers/index.js`) is the entry
point — fetches Crypto first, extracts BTC price, passes it to
Derivatives/OnChain for CME premium/NVT calculations that need it.

## Scoring Engine (`src/scoring/`) — Step 7

- `signalClassifier.js` — `classifySignal(indicator)`: parses `✅`/`⚠️`/`🔴` out of `.signal` text → `+1`/`0`/`-1`. Plain trend words ("naik"/"turun") return `null` — never guessed, since the same word means opposite things for different indicators (Hash Rate vs DXY).
- `weights.js` — weight = `BASE_WEIGHT[trustTier]` (`{high: 2, low: 1}`), halved if `source.isStale`, zeroed if suppressed/bounds-violated/skipped/unclassifiable. `SUPPRESSED` holds only the 2 known redundancy cases (Realized Price Multiple vs NUPL, Altseason Proxy vs its own inputs).
- `categoryScore.js` — weighted average in `[-1, +1]`, `score: null` (never `0`) when nothing was scoreable — "neutral" is a real claim, "we don't know" is a different one. Every result carries `contributions[]` and `excluded[]` with reasons, for Step 8's explainability requirement.

## Decision Engine (`src/decision/`) — Step 8

### Phase 1 — DivergenceEngine + ConfidenceScore

`divergenceEngine.js`'s 23 rules are ported verbatim from `formatter.js`'s
own divergence-alert prose (previously something the AI was asked to apply
itself). Each rule: `evaluable: false` with a reason if its data isn't
available this run (never silently skipped or guessed), `approximate: true`
if it uses a documented proxy instead of an exact match. Severity derives
from indicator trust tier (`both HIGH → 'high'`, else `'medium'`) rather than
23 separate subjective calls.

`confidenceScore.js` mirrors `formatter.js`'s original calibration rule
exactly: `"tinggi"` requires ALL of — Layer 0 (Fed Trifecta) ≥2/3 green,
Layer 1-3 ≥70% directionally agreeing (`computeLayer1to3Agreement()`,
excluding neutral/`0` signals from the ratio), no thin-coverage category,
zero high-severity divergences. `"rendah"` fires from the original compound
rule (weak Layer 0 + any conflict) OR either of two extensions added and
reviewed this session: ≥2 high-severity divergences alone, or ≥3 thin
categories alone.

### Phase 2 — StateMachine

10 states (`STATES` in `stateMachine.js`), each with named-indicator entry
checks (not category scores — a -0.18 category score can't tell you whether
BTC Dominance is specifically rising), a `heuristicDurationDays` range
sourced from public bear-market/altseason research (not invented), and an
`allowOneMiss` tolerance rule for states with ≥3 checks. `determineState()`
resolves ties by: previousState's `expectedNext` first, then highest
`matchStrength`, then `availableCount`. Geopolitical severity-5 and ≥2
high-severity divergences both only **flag** (`isManualReview`,
`geopoliticalFlag`, `blockedByDivergence`) — neither silently overrides which
state gets reported, a bug this session found and fixed live (a severity-5
event was forcing "Distribution" even when its own checks were 0/3).

### Phase 3 — RiskAssessment + PortfolioAllocation + persistence

`riskAssessment.js` maps `legacyPhase` (0-4) to `riskProfile` + Core/High-risk
% bands 1:1 from `formatter.js`'s own "ATURAN RISK PROFILE" table — Fase 4's
"sisa cash/stablecoin" is modeled as `highRisk: null` (genuinely undefined),
not an invented 0%. `portfolioAllocation.js` converts those bands to USD
(needs a real numeric `portfolioSize`, distinct from `formatter.js`'s display
string default) and exposes the static asset catalog — it deliberately does
**not** pick specific assets/weights, since `formatter.js` itself never had a
formula for that (see the AI Insight Engine section for where that judgment
call lives now).

`marketStateRecord.js` assembles `determineState()` + `ConfidenceScore` +
`DivergenceEngine` + `providersOutput.macro.liquidity` into the exact shape
`db/postgres`'s `saveMarketState()` expects (found and fixed a structural
mismatch here — `saveMarketState()` was written speculatively before
`determineState()` existed, and its expected fields were scattered across 3
different objects with nothing assembling them until this file).

## AI Insight Engine (`src/insight/`) — Step 9

`promptBuilder.js` builds a prompt presenting the Decision Engine's output as
ground truth, explicitly instructing the AI not to re-derive it, and asking
only for: War Premium per conflict, a concrete allocation inside the computed
bands, `$HYPE`'s ranking judgment, and a narrative + up to 3 action items —
as JSON matching a documented schema. `responseParser.js` never throws
(strips code fences, falls back to brace-extraction, degrades to
`parseFailed: true` on failure — 6 different models, inconsistent
instruction-following). `validator.js` cross-checks the AI's parsed
allocation against the exact same numeric constraints
`portfolioAllocation.js` computed (position count, min size, band ceilings)
— violations are reported, never silently corrected.

`generateInsight()` (`insight/index.js`) orchestrates prompt → the **existing,
unmodified** `claude-analyst.js` dispatcher → parse → validate.

## Dashboard cards — Step 10

New functions added to the existing sender files (not new files, per the
user's explicit direction — see the project's own recorded decision to defer
a Next.js web dashboard and scope Step 10 to rich chat cards instead):
`formatInsightForTelegram()`/`sendInsightToTelegram()` in
`telegram-sender.js`, `buildInsightEmbed()`/`sendInsightToDiscord()` in
`discord-sender.js`. Both render the full Decision + Insight output as a
structured card, reusing the existing `sendToTelegram()`/`sendPayload()`
transport (retry, rate-limiting, chunking — none of that duplicated), and
both fall back to a raw-text-plus-computed-facts card if the AI's JSON failed
to parse rather than sending nothing.

## Testing — Step 11

`test/*.test.js`, run via `npm test` (`node:test`, no new dependency). Covers
every pure/deterministic piece above with synthetic fixtures — including
branches that had never been exercised by live data even once in this
project's own sandbox (e.g. `confidenceScore.js`'s `"tinggi"` tier, since Fed
Trifecta has been `DATA_UNAVAILABLE` on every live smoke-test run so far).
`scripts/smoke-test-*.js` and `scripts/render-insight-card-dryrun.js` are a
separate category — live-data/API-dependent manual verification tools, not
part of the automated suite. See README's "Testing" section for the split.

## Integration status — what is and isn't live

**Nothing in `src/providers/`, `src/scoring/`, `src/decision/`, or
`src/insight/` is called by `src/index.js`.** The production pipeline
(`npm run fetch` / `npm run analyze:*` / the scheduler) still runs entirely
on the original `formatter.js` → `claude-analyst.js` → sender-functions path.
Every ACCIS piece was built additively and verified via its own
`scripts/smoke-test-*.js` script against live data, but the two systems run
in parallel — ACCIS does not currently affect what gets sent to Telegram/
Discord in production.

Also not yet live-verified in this sandbox specifically (verified only that
the *code* is correct — the actual external call was never exercised here):

- **AI Insight Engine's live provider call** — none of `ANTHROPIC_API_KEY`,
  `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `PERPLEXITY_API_KEY` are configured
  in this sandbox. `scripts/smoke-test-insight.js` is ready to run wherever
  those keys exist.
- **Dashboard card sending** — `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`/
  `DISCORD_WEBHOOK_URL` are also unconfigured here. Rendering was verified via
  `scripts/render-insight-card-dryrun.js` (live Decision Engine data + a
  synthetic Insight object) — the actual `sendInsightToTelegram()`/
  `sendInsightToDiscord()` network calls were never exercised.
- **Postgres persistence** — `db/postgres/001_initial_schema.sql` and
  `saveMarketState()`'s query were verified against `pg-mem` (in-memory
  Postgres-compatible engine), never against a real Supabase instance. No
  `DATABASE_URL` configured anywhere seen in this project so far.

### To actually wire ACCIS into production, in order

1. Call `fetchAllProviders()` + the Decision Engine chain from `src/index.js`
   alongside (not instead of, until confidence is high) the existing fetch.
2. Persist each run's `market_state_history` row via `pgStore.js` — this is
   also the prerequisite for `previousState` ever being non-null, which is
   what `determineState()`'s multi-match disambiguation and `projectTimeline()`'s
   elapsed-time calculation both need to do anything beyond their current
   "always cold start" behavior.
3. Call `generateInsight()` and send via the Step 10 card functions,
   independently of (or as a replacement for) the existing
   `formatDashboardPrompt()` → 6-AI-provider → text-dump flow.
4. Only after the above has run for real for a while: consider retiring
   `formatter.js`'s prompt sections that ACCIS has made redundant (phase
   classification, scorecard, divergence alerts) — not before, since
   `market_state_history` needs real accumulated data before
   `heuristicDurationDays` and the confidence/threshold numbers throughout
   this system can be backtested against this project's own outcomes rather
   than external public research.

## Roadmap status

This is Steps 6-10 of a 12-step transformation: Repo Audit → Architecture
Audit → Tech Debt Analysis → Domain Model Design → Indicator Validation →
State Machine Design → **Data Layer Refactor (6)** → **Scoring Engine (7)** →
**Decision Engine (8)** → **AI Insight Engine (9)** → **Dashboard (10)** →
**Testing (11)** → Documentation (12, this document). Steps 1-5 were audits/
design work with no lasting code artifact beyond what's referenced here;
Step 12 is complete as of this document.
