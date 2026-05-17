
# CLAUDE.md - Crypto Phase Dashboard

## Project Overview
A cryptocurrency dashboard for tracking phases, trends, and market data. Built with modern web technologies.

## ⚠️ CRITICAL: Reduce Token Usage

### Folders to IGNORE (DO NOT READ)
Claude Code must **NEVER** read these folders to save context window:

```
node_modules/          # 1000s of files - huge token waste
.next/                 # Next.js build output
out/                   # Export output
dist/                  # Build artifacts
build/                 # Another build folder
.cache/                # Cache files
coverage/              # Test coverage reports
.vercel/               # Vercel deployment cache
.git/                  # Git history (useless for coding)
*.log                  # Log files
.DS_Store              # Mac system files
.env.local             # Local secrets (security risk!)
.env.*.local           # Environment-specific secrets
```

### File Types to IGNORE
```
*.lock                 # package-lock.json, yarn.lock (too verbose)
*.log                  # Log files
*.map                  # Source maps
*.min.js               # Minified files
*.test.ts.snap         # Jest snapshots
*.png, *.jpg, *.svg    # Images (can't analyze anyway)
*.woff, *.woff2        # Fonts
```

### Selective Reading Strategy
- **DO read**: `app/`, `components/`, `lib/`, `hooks/`, `types/`, `public/`
- **DO read config files**: `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.js`
- **SKIP**: Tests (unless fixing test failures), Storybook stories, markdown docs (except README)

### How to Implement Ignores
Create `.claude/ignore` file:
```
node_modules/
.next/
dist/
build/
coverage/
.git/
*.log
*.lock
*.map
*.min.js
package-lock.json
.env*
.DS_Store
**/__pycache__/
**/*.test.ts.snap
```

## Tech Stack & Versions
- **Next.js**: 15.1.6 (App Router)
- **React**: 19.0.0
- **TypeScript**: 5.x
- **TailwindCSS**: 4.x
- **Node.js**: 20+ (LTS recommended)
- **Package Manager**: npm (see package.json - ignore package-lock.json)

## Project Structure (files that matter)
```
crypto-phase-dashboard/
├── app/                    # ✅ READ - App Router pages
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   └── favicon.ico
├── components/            # ✅ READ - All components
│   ├── ui/               # Reusable UI components
│   ├── charts/           # Chart components
│   ├── dashboard/        # Dashboard-specific components
│   └── layout/           # Layout components
├── lib/                  # ✅ READ - Utilities & API clients
├── hooks/                # ✅ READ - Custom hooks
├── types/                # ✅ READ - TypeScript types
├── public/               # ✅ READ - Static assets (only index files)
├── .claude/             # ✅ READ - Claude config (commands, rules)
│   ├── commands/
│   ├── rules/
│   └── ignore           # ⚠️ This file
├── node_modules/        # ❌ IGNORE - 10,000+ files
├── .next/              # ❌ IGNORE - Build cache
├── coverage/           # ❌ IGNORE - Test outputs
└── package-lock.json   # ❌ IGNORE - 10,000+ lines of noise
```

## Token Budget Guidelines
- **Aim for**: < 50k tokens per conversation
- **Warning**: > 100k tokens (will hit limits)
- **If Claude reads node_modules**: STOP and restart session
- **Proactive approach**: Use `/memory` command to check what's loaded

## Coding Conventions

### TypeScript
- **No `any` types** - use proper types or `unknown` with type guards
- Prefer `interface` for objects/APIs, `type` for unions/primitives
- Export reusable types from `types/` directory
- Use strict mode (already enabled in tsconfig.json)

### React/Next.js
- **Functional components only** (no class components)
- Use React Server Components by default (App Router)
- Add `'use client'` directive only for client components (hooks, interactivity)
- Prefer named exports over default exports
- Component file naming: `PascalCase.tsx`

### Naming Conventions
- **Components**: PascalCase (`DashboardCard.tsx`)
- **Hooks**: camelCase with `use` prefix (`useCryptoData.ts`)
- **Utilities**: camelCase (`formatCurrency.ts`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`)
- **CSS classes**: kebab-case (Tailwind utilities)

### File Organization
- Keep components under 300 lines - split larger components
- Co-locate related files: component + types + styles + tests
- Page-specific components go in `app/[page]/_components/`

## State Management
- Use React `useState`/`useReducer` for local state
- Use Context for moderate shared state (theme, auth)
- Consider TanStack Query (React Query) for server state
- Cache crypto data appropriately (TTL: 30-60 seconds)

## API & Data Fetching
- Fetch crypto data from public APIs (CoinGecko, Binance, etc.)
- Implement error boundaries for API failures
- Add retry logic with exponential backoff (max 3 retries)
- Show loading skeletons during data fetch
- Use Next.js `fetch` with caching strategies

## Testing Standards
- **Unit tests**: Jest + React Testing Library
- **Component tests**: Test user interactions, not implementation
- **Coverage**: Aim for 80% core logic coverage
- **Test naming**: `[component].test.tsx` or `[function].test.ts`
- **Mock external APIs** - never call real APIs in tests
- ⚠️ **Skip tests during normal feature dev** (only read if fixing failures)

## Error Handling
- Use try/catch for async operations
- Log errors with context (component, action, timestamp)
- Show user-friendly error messages (no technical jargon)
- Fallback UI for component errors (error boundaries)
- Never expose API keys or sensitive data in errors

## Performance Requirements
- **LCP**: < 2.5 seconds
- **FID**: < 100ms
- **CLS**: < 0.1
- Implement code splitting for route segments
- Optimize images with Next.js `Image` component
- Virtualize long lists (react-window)
- Debounce search/filter inputs (300ms)

## Crypto-Specific Patterns
- **Price formatting**: Always show 2 decimal places for USD
- **Percentage changes**: Green for positive (>0), red for negative
- **Large numbers**: Use abbreviations (M, B, T)
- **Refresh interval**: Manual refresh button (not auto-polling to avoid rate limits)
- **Watchlists**: Persist to localStorage

## Never Do Rules
- ❌ Don't commit API keys or secrets
- ❌ Don't use inline styles - use Tailwind CSS
- ❌ Don't ignore TypeScript errors (`@ts-ignore`)
- ❌ Don't make API calls directly in components (use hooks/lib)
- ❌ Don't mutate state directly (use setState)
- ❌ Don't hardcode crypto data - always fetch from APIs
- ❌ **Don't read node_modules** (wastes 50k+ tokens instantly)

## Common Pitfalls in this Codebase
- Rate limiting from free crypto APIs - implement throttling
- WebSocket connection leaks on unmount - always cleanup
- Timezone handling for timestamps - use UTC with local display
- Mobile responsiveness - test on iPhone SE and Pixel 5 dimensions
- **Token usage**: If response is slow, Claude is reading too many files

## Development Workflow

### Running the Project
```bash
npm install          # Install dependencies (skip reading package-lock.json)
npm run dev         # Start dev server on localhost:3000
npm run build       # Production build
npm run start       # Start production server
npm run lint        # Run ESLint
npm run type-check  # Run TypeScript compiler
```

### Git Workflow
- **main**: Production-ready code
- **develop**: Integration branch
- **feature/***: New features
- **fix/***: Bug fixes
- Squash commits before merging to main
- Write semantic commit messages (feat:, fix:, docs:, refactor:, test:, chore:)

## Environment Variables
Create `.env.local` for development (⚠️ Claude must NOT read this):
```
NEXT_PUBLIC_API_BASE_URL=https://api.coingecko.com/api/v3
NEXT_PUBLIC_WS_URL=wss://stream.binance.com:9443/ws
CRYPTO_API_KEY=your_api_key_if_needed
```

## Path-Specific Rules

### `/components/ui/*`
- Must be pure, reusable components
- No business logic
- Accept className prop for customization
- Forward refs when appropriate

### `/app/**/page.tsx`
- Server Components by default
- Fetch data directly (no client-side fetching)
- Handle loading and error states

### `*.test.ts` or `*.test.tsx`
- Mock all external dependencies
- One assertion per test (or logical grouping)
- Describe component behavior, not implementation
- ⚠️ **Read these ONLY when fixing test failures**

## Custom Claude Commands

Create these in `.claude/commands/`:

### `/review` - Code Review Checklist
- TypeScript strict compliance
- No console.logs in production code
- Accessibility (a11y) standards met
- Mobile responsive check
- Performance implications
- Security (no XSS, CSRF)

### `/test` - Generate Tests
- Unit tests for utilities
- Component tests for UI
- Integration tests for API flows
- Follow existing test patterns

### `/optimize` - Performance Audit
- Check bundle size
- Identify unnecessary re-renders
- Suggest image optimizations
- Audit WebSocket connections

### `/tokens` - Check Token Usage
Run `/memory` to see what's loaded
Verify node_modules isn't being read
Suggest files to ignore if needed

## First Session Checklist
When starting a new Claude session:

1. [ ] Run `/memory` - verify node_modules NOT loaded
2. [ ] Check token count (should be < 20k at start)
3. [ ] If > 50k, find what's bloating context
4. [ ] Use Plan Mode for multi-file changes
5. [ ] Never let Claude read package-lock.json

## Deployment Environment

### GCP Zone: `asia-southeast1-a` (Singapore)
This app runs on Google Cloud Platform zone **`asia-southeast1-a` (Singapore)**. This is intentional:
- **Binance Futures**: Fully accessible from Singapore. Zone `us-central1-a` (Iowa) gets HTTP 451 (regulatory block).
- **Deribit**: ISP Indonesia ("Internet Positif" by Indosat/IOH) blocks Deribit with SSL intercept — GCP Singapore has full access.
- **OKX, Bybit**: Also blocked by Indonesian ISP — fallback providers used.

### Blocked APIs & Fallbacks

| API | Status | Reason | Fallback |
|-----|--------|--------|---------|
| CoinMetrics `SplyAct1yr` | ❌ 403 | Community plan (`download`) doesn't include | blockchain.info `activeAddresses` (proxy) |
| CoinMetrics `TxTfrValNtv` | ❌ 403 | Community plan limitation | blockchain.info `txVolume` (proxy) |
| CoinMetrics `FlowInExNtvMiner` | ❌ 403 | Community plan limitation | No direct proxy |
| Deribit (options skew) | ❌ ISP block | Indonesian ISP SSL intercept | Perp funding rate (inverted) as proxy |
| Binance Futures (US zone) | ❌ HTTP 451 | Regulatory block from Iowa zone | Gate.io → Hyperliquid → CoinGecko |

### CoinMetrics Community Free Tier — Available Metrics
Only these 5 metrics are accessible without a paid plan:
```
SplyExNtv         # BTC on exchange (reserve)
FlowInExNtv       # Daily inflow to exchange
FlowOutExNtv      # Daily outflow from exchange
CapMVRVCur        # MVRV ratio (true, market cap / realized cap)
CapMrktCurUSD     # Market cap in USD
```
Do **not** add other CoinMetrics metrics without verifying free tier access first — adding blocked metrics causes the entire API call to return 403 (not just that metric).

---

## Review Continuation Rule

When reviewing the same artifact (report, prompt, output file) **for the second time or more**, do NOT scan top-to-bottom looking for new issues. Instead:

1. **Open the prior review's findings first** and walk through them line-by-line.
2. **For each prior finding, classify the current state** as one of:
   - ✅ **FIXED** — issue resolved
   - 🟡 **PARTIAL** — value changed but underlying problem persists (e.g., scale bug still present with different number)
   - 🔴 **REGRESSED** — got worse (e.g., from "wrong number" to "DATA_UNAVAILABLE")
   - ⏳ **PENDING** — cannot evaluate yet
3. **Only after** the prior-findings table is complete, list new issues not seen before.

**Why:** A value changing (e.g., MSCI EM `55.47` → `67.94`) is NOT proof the bug is fixed — it may be the same scale bug with a different rendering. Treat moved values as suspect until cross-checked against ground truth, not as evidence of a fix.

**Trap to avoid:** Skipping verification steps that require tool calls (e.g., `ls output/`, reading a fetcher) in favor of prose-only flagging. If the verification is cheap (≤3 tool calls) and the cost of being wrong is real (broken production data, wasted API spend), do the verification.

---

## Sanity Bounds for Core Indicators

Auto-flag any value outside these ranges as a **scale/unit bug** (not a market anomaly) and verify the fetcher source field before trusting downstream analysis:

| Indikator | Plausible range | Action jika di luar |
|-----------|-----------------|---------------------|
| DXY | 70–120 | flag salah skala — cek field (level vs %change) |
| MSCI EM (EEM ETF proxy) | $25–$80 | this project uses EEM ETF via Twelve Data, NOT the MSCI EM index — value ~50–70 is normal, not a scale bug. Rename label to "EEM (MSCI EM proxy)" in prompts to avoid AI confusion |
| BTC vol 24h (global aggregate) | $10B–$80B | flag salah skala — likely single-exchange, not aggregate |
| ISM PMI (Mfg/Svc) | 35–65 | flag salah skala — value > 100 means wrong series |
| Fed Reserves (WLRRAL) | $2.5T–$5T | flag desimal hilang — `$0.3T` indicates unit mismatch |
| Fed Balance Sheet (WALCL) | $6T–$9T | flag salah unit |
| US 10Y Yield | 0.5%–7% | flag salah unit (raw vs %) |
| CPI YoY | -2%–15% | flag salah skala |
| Fed Funds Rate | 0%–8% | flag salah skala |
| BTC price | $10K–$300K | flag salah unit/source |
| Gold (XAU) | $1500–$8000 | flag if outside (2026 context) |
| Oil Brent | $30–$200 | flag if outside |
| Funding rate (8h) | -1%–+1% | flag salah skala (raw decimal vs %) |
| Stablecoin total supply | $50B–$500B | flag salah unit |
| TVL DeFi total | $30B–$300B | flag salah unit |
| BTC Dominance | 35%–75% | flag salah skala |
| Fear & Greed | 0–100 | flag if outside (out-of-bound = bug) |
| Perp Sentiment Proxy (this project's formula) | -10 to +30 | flag formula bug — out-of-scale value indicates non-normalized output |
| BTC Hash Rate (7d avg) | 400–1200 EH/s | flag salah unit (TH/s vs EH/s) atau stale data |
| BTC TX Volume (on-chain, daily) | 50,000–500,000 BTC/day | flag denominator/source — modern BTC has off-chain shift, but on-chain still in this range |
| BTC Coin Velocity (output volume) | 200,000–2,000,000 BTC/day | flag salah unit; output volume is larger than tx value due to multi-output txs |

**Why:** A scale-bug indicator silently feeds wrong data into the AI prompt. The AI cannot detect it (no ground truth), uses it to classify market phase, and produces wrong allocation recommendations. Real cost: trading decisions based on garbage input. Catching scale bugs at the data layer is the cheapest checkpoint in the pipeline.

**Update this table** whenever a fetcher is added or a real-world plausible range shifts (e.g., new ATH for BTC).

---

## Active Runtime Path — JANGAN edit file yang tidak diimpor

Sebelum mengedit AI analyst, fetcher, atau sender, **wajib verifikasi file ada di runtime path**:

```bash
grep -rn "from './<filename>" src/
```

Kalau tidak ada hasil dari file yang diimpor oleh `src/index.js` (langsung atau transitive), edit-mu tidak akan jalan di production. Konvensi project ini:

- **AI dispatcher aktif**: `src/claude-analyst.js` (meski namanya "claude-", router semua provider — Claude, ChatGPT, Gemini, Perplexity, Grok, Qwen)
- **Dead code parking**: `src/_unused/` — JANGAN edit; pindahkan ke runtime path dulu kalau memang mau dipakai. Penjelasan ada di [`src/_unused/README.md`](src/_unused/README.md).
- **Fetcher orchestrator**: `src/fetchers/{daily,weekly,monthly,fedliquidity}.js` → `fetchAll*()` functions
- **Sender entry points**: `src/{telegram,discord}-sender.js`
- **Formatter**: `src/formatter.js` → `formatDashboardPrompt()` (prompt utama yang dikirim ke AI)

Kalau ragu, baca `src/index.js` import block (sekitar line 49-78) untuk daftar lengkap modul yang dipakai runtime.

**Trap yang sudah terjadi:** mengedit `src/analysts/{claude,gemini,openai,perplexity}.js` untuk bump `maxTokens` — file-file itu **dead code**, edit-nya ZERO efek. Production token limit ada di `src/claude-analyst.js`. Jangan ulangi.

---

## Post-Fix Verification untuk Data Fetcher

Setelah refactor fetcher (baru, ganti source, ganti parsing), **wajib live-test** untuk konfirmasi value masuk akal sebelum claim "done":

```bash
curl -s "<endpoint>" | jq '<extract>'
# bandingkan dengan ground truth — TradingView, FRED website, CoinGecko UI, dll
```

Cross-check terhadap **Sanity Bounds table** di atas. Kalau hasil di luar bounds, jangan commit — investigasi dulu. **"Code compiles" ≠ "data benar".**

Trap yang sudah terjadi:
- DXY $84 dari Twelve Data berbulan-bulan (real ~$97) — tidak ketahuan karena tidak pernah cross-check ke TradingView
- Brent $126 dari Google News RSS (real ~$109) — stale headline 2022 yang lolos filter
- Fed Reserves $0.323T dari WLRRAL (real WRESBAL ~$3T) — series ID salah, silent feed wrong number ke AI prompt

Semua kasus di atas: silent bug yang baru ketahuan setelah ada ground-truth comparison. Lakukan verification step ini sebagai default, bukan as-needed.

---

## README Sync Trigger

Update `README.md` bersamaan dengan perubahan kode kalau menyentuh:

- **Source data primer/fallback** (mis. ganti Yahoo → Twelve Data sebagai primary)
- **FRED series ID** atau API endpoint utama
- **AI provider list, model default, atau token limit default**
- **Command/flag baru** di `src/index.js` arg parser
- **Skema SQLite cache** (tabel baru, kolom baru yang dipakai untuk WoW delta)

Sisanya **tidak perlu**: bug fix internal, refactor non-API, retry logic, null guards. Improvement minor sudah ter-cover oleh section "Reliability & Recent Improvements" di README.

Rule of thumb: kalau user baru perlu tahu perubahan ini untuk run/setup/troubleshoot, update README. Kalau hanya internal robustness, skip.

---

## Commitment to Quality
This dashboard handles real financial data. Every change must maintain:
- **Accuracy**: Crypto prices are exact, no rounding errors
- **Reliability**: Graceful degradation when APIs fail
- **Speed**: Fast initial load and updates
- **Security**: Protect user watchlists and preferences
- **Efficiency**: Stay within token limits (50k max per conversation)

**Remember**: Users depend on this dashboard for trading decisions. Test thoroughly before deploying. **And always check token usage first!**

