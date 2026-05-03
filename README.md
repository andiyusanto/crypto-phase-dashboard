# Crypto Dashboard — Hedge Fund Analyst

Script Node.js untuk otomatis fetch data macro/crypto, analisis dengan **6 AI** (Claude, ChatGPT, Gemini, Perplexity, Grok, Qwen), dan distribusi ke **Telegram** dan/atau **Discord**.

Setiap AI provider, Telegram, dan Discord **sepenuhnya independen** — menjalankan satu tidak memerlukan yang lain terkonfigurasi.

---

## Arsitektur

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              DATA SOURCES                                    │
│  CoinGecko · Binance · Hyperliquid · DefiLlama · FRED · OilPriceAPI          │
│  alternative.me · Google News RSS · Twelve Data · blockchain.info            │
│  CoinMetrics Community API · blockchaincenter · Gate.io · SerpAPI            │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
              ┌────────────────┼───────────────────┐
              │                │                   │
       SQLite Cache        generate prompt      War Headlines
    (Fed·PMI·Weekly·Oil)       │               (Google News RSS)
                               │
         ┌─────────────────────┼──────────────────────────────────────┐
         ▼                     ▼          ▼            ▼              ▼
    🤖 Claude             ✨ Gemini  🔍 Perplexity  ⚡ Grok       🤖 Qwen
    Anthropic             Google     Sonar          OpenRouter    OpenRouter
         │                     │          │            │              │
         └─────────────────────┼──────────┘            └──────┬───────┘
                               │      🟢 ChatGPT              │
                               │       (OpenRouter)           │
                               └──────────┬───────────────────┘
                                          │
                      ┌───────────────────┴───────────────────┐
                      ▼                                       ▼
                📱 Telegram                           🎮 Discord
                (Bot API)                             (Webhook)
```

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Konfigurasi

```bash
cp .env.example .env
```

Edit `.env` — isi **hanya** yang dibutuhkan:

#### AI Providers (pilih minimal satu)

| Variabel | Provider | Model | Link | Harga |
|----------|----------|-------|------|-------|
| `ANTHROPIC_API_KEY` | Claude | claude-sonnet-4-6 | [console.anthropic.com](https://console.anthropic.com) | Berbayar |
| `OPENROUTER_API_KEY` | ChatGPT (OpenRouter) | openai/gpt-4o | [openrouter.ai](https://openrouter.ai) | Berbayar |
| `GEMINI_API_KEY` | Gemini | gemini-2.5-flash | [aistudio.google.com](https://aistudio.google.com/apikey) | **Gratis** |
| `PERPLEXITY_API_KEY` | Perplexity | sonar-pro | [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api) | Berbayar |
| `OPENROUTER_API_KEY` | Grok (OpenRouter) | x-ai/grok-beta | [openrouter.ai](https://openrouter.ai) | Berbayar |
| `OPENROUTER_API_KEY` | Qwen (OpenRouter) | qwen/qwen3-next-80b:free | [openrouter.ai](https://openrouter.ai) | **Gratis** |

> **OpenRouter**: Satu API key untuk mengakses Grok, ChatGPT, Qwen, dan ratusan model lain.

#### Messaging Channels (opsional)

**Telegram:**
```env
TELEGRAM_BOT_TOKEN=1234567890:AAxxxxxxxxxx
TELEGRAM_CHAT_ID=@namaChannel
```
Setup: `@BotFather` → `/newbot` → tambahkan bot ke channel sebagai **admin**

**Discord:**
```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/ID/TOKEN
```
Setup: Channel Settings → Integrations → Webhooks → **New Webhook** → Copy URL

#### Data Sources

| Variabel | Data | Harga |
|----------|------|-------|
| `FRED_API_KEY` | 10Y Yield, NFCI, CPI, Fed Rate, Global M2, Fed Balance Sheet, RRP, Reserves | **Gratis** |
| `TWELVE_DATA_API_KEY` | DXY, Gold, MSCI EM | **Gratis** (800 req/hari) |
| `OIL_PRICE_API_KEY` | Brent Crude Oil | **Gratis** (200 req/bulan) |
| `COINMARKETCAP_API_KEY` | TOTAL2, TOTAL3, OTHERS.D | **Gratis** |
| `SERPAPI_API_KEY` | Google Trends "bitcoin" (Tier 3 retail FOMO signal) | **Gratis** (100 req/bulan) |

> **SerpAPI**: Digunakan dengan 12-jam in-memory cache → ~60 req/bulan efektif, well within free tier.

### 3. Update manual overrides harian

Edit `src/index.js`, bagian `manualOverrides`:

```js
const manualOverrides = {
  faseEstimasi:    '2',     // estimasi fase kamu: 0/1/2/3/4 — WAJIB diisi
  warTimteng:      'none',  // 'none' = auto-fetch Google News
  warRusiaUkraine: 'none',
  warTaiwan:       'none',

  // Uncomment untuk override manual (semua sudah auto-fetched):
  // btcDominanceDirection: 'naik',
  // altseasonIndex:   '65',
  // exchangeNetflow:  'outflow (-1,200 BTC)',
};
```

---

## Semua Commands

### Fetch Data

| Command | Deskripsi |
|---------|-----------|
| `npm run fetch` | Fetch semua data, simpan ke `output/` |
| `npm run fetch:telegram` | Fetch + data summary → Telegram |
| `npm run fetch:discord` | Fetch + data summary → Discord |
| `npm run fetch:all-channels` | Fetch + data summary → Telegram **+** Discord |

### Kirim Prompt ke Channel

| Command | Deskripsi |
|---------|-----------|
| `node src/index.js --send-prompt --telegram` | Kirim prompt → Telegram |
| `node src/index.js --send-prompt --discord` | Kirim prompt → Discord |
| `node src/index.js --send-prompt --telegram --discord` | Kirim prompt → keduanya |

### Analisis AI (tanpa channel)

| Command | AI |
|---------|----|
| `npm run analyze:claude` | 🤖 Claude (Anthropic) |
| `npm run analyze:chatgpt` | 🟢 ChatGPT (OpenRouter) |
| `npm run analyze:gemini` | ✨ Gemini (Google) |
| `npm run analyze:perplexity` | 🔍 Perplexity Sonar |
| `npm run analyze:grok` | ⚡ Grok (OpenRouter) |
| `npm run analyze:qwen` | 🤖 Qwen (OpenRouter) |
| `npm run analyze:all` | Semua AI yang ada key-nya |

### Analisis + Telegram

| Command | AI → Telegram |
|---------|---------------|
| `npm run analyze:claude:telegram` | Claude |
| `npm run analyze:chatgpt:telegram` | ChatGPT |
| `npm run analyze:gemini:telegram` | Gemini |
| `npm run analyze:perplexity:telegram` | Perplexity |
| `npm run analyze:grok:telegram` | Grok |
| `npm run analyze:qwen:telegram` | Qwen |
| `npm run analyze:all:telegram` | Semua AI |

### Analisis + Discord

| Command | AI → Discord |
|---------|--------------|
| `npm run analyze:claude:discord` | Claude |
| `npm run analyze:chatgpt:discord` | ChatGPT |
| `npm run analyze:gemini:discord` | Gemini |
| `npm run analyze:perplexity:discord` | Perplexity |
| `npm run analyze:grok:discord` | Grok |
| `npm run analyze:qwen:discord` | Qwen |
| `npm run analyze:all:discord` | Semua AI |

### Analisis + Telegram + Discord

| Command | AI → Telegram + Discord |
|---------|------------------------|
| `npm run analyze:claude:all-channels` | Claude |
| `npm run analyze:chatgpt:all-channels` | ChatGPT |
| `npm run analyze:gemini:all-channels` | Gemini |
| `npm run analyze:perplexity:all-channels` | Perplexity |
| `npm run analyze:grok:all-channels` | Grok |
| `npm run analyze:qwen:all-channels` | Qwen |
| `npm run analyze:all:all-channels` | Semua AI |

### Flags Tambahan

| Flag | Deskripsi |
|------|-----------|
| `--send-prompt` | Kirim prompt ke channel sebelum analisis |
| `--print` | Print prompt lengkap ke terminal |
| `--no-save` | Jangan simpan file ke `output/` |
| `--mode=daily\|weekly\|monthly\|fed\|pmi` | Fetch data tertentu saja |
| `--provider=claude\|chatgpt\|gemini\|perplexity\|grok\|qwen\|all` | Pilih AI |
| `--telegram` | Aktifkan Telegram |
| `--discord` | Aktifkan Discord |

**Contoh kombinasi:**
```bash
# Fetch + print prompt ke terminal (test tanpa side-effect)
node src/index.js --print --no-save

# Gemini + kirim prompt + Telegram + Discord
node src/index.js --analyze --provider gemini --send-prompt --telegram --discord

# Semua AI + print prompt + semua channel
node src/index.js --analyze --provider all --print --telegram --discord

# Cek data PMI saja
node src/index.js --mode=pmi --no-save

# Fetch weekly + Discord
node src/index.js --mode=weekly --discord
```

### Scheduler Otomatis

```bash
npm run schedule
# atau
node src/scheduler.js
```

Analisis berjalan **3× sehari** pada market session open:

| Waktu WIB | Session | Aksi |
|-----------|---------|------|
| 06:00 | 🇯🇵 Tokyo Open | Semua AI → Prompt + Telegram + Discord |
| 15:00 | 🇬🇧 London Open | Semua AI → Prompt + Telegram + Discord |
| 19:00 | 🇺🇸 New York Open | Semua AI → Prompt + Telegram + Discord |

**Run di background:**
```bash
# PM2 (recommended)
npm install -g pm2
pm2 start src/scheduler.js --name crypto-dashboard
pm2 save && pm2 startup

# nohup
nohup node src/scheduler.js > logs/scheduler.log 2>&1 &
```

> **GCP**: Gunakan zone `asia-southeast1-a` (Singapore). Zone `us-central1-a` (Iowa) diblokir Binance Futures (HTTP 451 regulatory block). Fallback otomatis ke Gate.io/Hyperliquid/CoinGecko tetap berfungsi dari US zone, tapi Singapore mendapat akses penuh ke Binance.

---

## Data Coverage

### Selalu (tanpa API key)

| Data | Sumber | Tier |
|------|--------|------|
| BTC, ETH, SOL price + 24h change + volume | Binance → CoinGecko fallback | — |
| BTC Dominance, ETH/BTC, SOL/BTC ratio | CoinGecko | — |
| BTC vs ATH (% from all-time high) | CoinGecko `/coins/bitcoin` | — |
| BTC vs 200d MA (gap %) | Dihitung dari 5yr price history | — |
| Fear & Greed Index | alternative.me | — |
| Funding rate BTC + ETH | Binance → Hyperliquid → CoinGecko fallback | — |
| TVL DeFi + 7d change | DefiLlama | — |
| Altseason Index (0–100) | blockchaincenter.net | — |
| BTC Exchange Netflow | CoinMetrics Community API | — |
| ISM Manufacturing + Services PMI | Google News RSS | — |
| War headlines — Timteng, Rusia-Ukraine, Taiwan | Google News RSS | — |
| **NUPL proxy** | blockchain.info (5yr history, median) + CoinGecko | Tier 1 |
| **SOPR proxy** (price ratio) | Dihitung dari 5yr price history (30d avg) | Tier 1 |
| **Realized Price Multiple** (MVRV proxy) | current price / 5yr median price | Tier 1 |
| **Stablecoin Dominance** (USDT+USDC) | CoinGecko stablecoin mcap / total mcap | Tier 1 |
| **Long/Short Ratio** (account-based) | Binance Futures → Gate.io fallback | Tier 1 |
| **Hash Rate** (7d avg, EH/s) | blockchain.info | Tier 1 |
| **Pi Cycle Top** (MA111 vs 2×MA350) | Dihitung dari 5yr price history | Tier 2 |
| **Active Addresses** (7d avg, WoW) | blockchain.info | Tier 2 |
| **Miner Revenue** (7d avg USD, WoW) | blockchain.info | Tier 2 |
| **BTC Open Interest** (aggregate) | CoinGecko `/derivatives` → Hyperliquid fallback | Tier 2 |
| **BTC Perp Premium** (Basis Rate, annualized) | CoinGecko `/derivatives` perpetual tickers | Tier 2 |
| **Perp Sentiment Proxy** (funding-based) | CoinGecko Deribit data + funding rate | Tier 2 |
| **WoW % change** — TOTAL2, TOTAL3, Stablecoin | SQLite `daily_snapshot` | — |

### Dengan API Key

| Variabel | Data | Tier |
|----------|------|------|
| `FRED_API_KEY` | 10Y Yield, NFCI, CPI, Fed Rate, Global M2, WALCL, RRP, WLRRAL | — |
| `TWELVE_DATA_API_KEY` | DXY, Gold (XAU/USD), MSCI EM | — |
| `OIL_PRICE_API_KEY` | Brent Crude Oil (terkini + 7d change) | — |
| `COINMARKETCAP_API_KEY` | TOTAL2, TOTAL3, OTHERS.D | — |
| `SERPAPI_API_KEY` | **Google Trends "bitcoin"** — retail FOMO signal (0–100) | Tier 3 |

---

## Sinyal Fase & Framework

### 5-Fase Framework

| Fase | Label | Karakteristik |
|------|-------|---------------|
| 0 | Liquidity Collapse | Risk-off ekstrem, Fed kontraksi, DXY spike, BTC dump |
| 1 | Early Recovery | Likuiditas mulai longgar, akumulasi diam-diam, fear tinggi |
| 2 | Expansion | Risk-on building, FCI loose, BTC leading, alts mulai ikut |
| 3 | Late Cycle | Euphoria, funding rate tinggi, dominance turun, alts outperform |
| 4 | Distribution | Topping signal, whale exit, stablecoin naik, volume divergence |

Perubahan fase hanya valid jika **≥3 signal upstream** konfirmasi.

### Liquidity Hierarchy (upstream → downstream)

```
Fed Balance Sheet → RRP → Global M2 → FCI → DXY/10Y → BTC → ETH/Alts
```

### Threshold Referensi

| Indikator | Bearish | Netral | Bullish |
|-----------|---------|--------|---------|
| NFCI | > 0.3 | -0.3–0.3 | < -0.3 |
| DXY | > 104 | 100–104 | < 100 |
| US 10Y Yield | > 4.5% | 4.0–4.5% | < 4.0% |
| Fear & Greed | < 25 | 25–60 | > 60 |
| BTC vs 200d MA | < -10% | -10%–+20% | > +20% |
| NUPL proxy | < 0 (capitulation) | 0–0.25 (hope) | > 0.5 (belief) |
| SOPR proxy (price ratio) | < 0.85 (selloff tajam) | 0.95–1.05 (netral) | > 1.20 (overextended) |
| Realized Price Multiple | < 1.0x (capitulation) | 1.0–2.0x | > 3.5x (distribusi) |
| Pi Cycle Top gap | > 0% (crossing = top!) | -10%–0% | < -30% (aman) |
| Long/Short Ratio | < 0.6 (shorts dominan) | 0.9–1.2 | > 1.8 (longs dominan) |
| Hash Rate WoW | < -5% (miner capitulation) | -1%–+1% | > +1% |
| Stablecoin Dom. (USDT+USDC) | > 6% (risk-off) | 3–6% | < 3% (risk-on) |
| Active Addresses WoW | < -10% (capitulation) | -2%–+2% | > +2% |
| Miner Revenue WoW | < -20% (capitulation) | -2%–+2% | > +2% |
| OI BTC | Kontraksi < $15B | $15–30B | > $30B |
| Basis Rate (ann.) | < 0% (backwardation) | 0–15% | 5–15% (carry positif) |
| Google Trends "bitcoin" | < 20 (bear) | 40–80 | > 80 (FOMO ekstrem) |

---

## Proxy Accuracy Notes

| Sinyal | Sumber True | Proxy Kami | Akurasi |
|--------|-------------|------------|---------|
| NUPL | Glassnode (per-UTXO) | 5yr **median** price × supply | Directionally valid; median mengurangi bias bull run |
| SOPR | Glassnode (per-UTXO spent) | current price / 30d avg | STH price ratio — thresholds dikalibrasi ulang |
| MVRV | Glassnode (realized cap) | current / 5yr median price | Reasonable proxy untuk distribusi zone |
| Options Skew | Deribit 25Δ skew | Perp funding rate (inverted) | Perp sentiment, **bukan** options market IV |
| Stablecoin Dom. | Full stablecoin market | USDT+USDC only (~75% coverage) | Threshold disesuaikan ke >6% / <3% |

---

## SQLite Cache (`data/dashboard.db`)

| Tabel | Data | Dedup logic |
|-------|------|-------------|
| `fed_liquidity` | WALCL + RRP + WLRRAL snapshot | Berdasarkan tanggal observasi FRED |
| `pmi_data` | ISM Manufacturing + Services PMI | Per bulan (`released_month` YYYY-MM) |
| `weekly_data` | 10Y yield, NFCI, altseason, netflow, TVL, ratio trend | Per hari (`fetch_date`) |
| `monthly_data` | CPI, Fed Rate, M2 | Per bulan (`period` YYYY-MM) |
| `oil_prices` | Brent Crude price | Per hari (`price_date`) |
| `daily_snapshot` | TOTAL2, TOTAL3, Stablecoin Supply | Per hari — dipakai untuk WoW delta |

**WoW delta**: Setiap run menyimpan snapshot ke `daily_snapshot`. Delta dihitung dari snapshot ~7 hari lalu. Tersedia otomatis setelah 7 hari pertama.

---

## Output Files

```
output/
├── latest_prompt.txt
├── latest_data.json
├── latest_analysis.txt
├── latest_analysis_claude.txt
├── latest_analysis_chatgpt.txt
├── latest_analysis_gemini.txt
├── latest_analysis_perplexity.txt
├── latest_analysis_grok.txt
├── latest_analysis_qwen.txt
├── prompt_2026-05-03T06-00-00.txt
└── analysis_gemini_2026-05-03T06-00-00.txt
```

---

## Perbandingan AI

| Provider | Keunggulan | Token Limit | Harga |
|----------|-----------|-------------|-------|
| 🤖 **Claude** | Reasoning terdalam, analisis fase paling konsisten | 6500 | Berbayar |
| 🟢 **ChatGPT** | Balanced, risk management | 6500 | Berbayar |
| ✨ **Gemini** | Paling cepat, free tier generous | 6500 | **Gratis** |
| 🔍 **Perplexity** | Real-time web search + citations | 6500 | Berbayar |
| ⚡ **Grok** | Reasoning kuat via OpenRouter | 6500 | Berbayar |
| 🤖 **Qwen** | Alibaba model via OpenRouter | 6500 | **Gratis** |

---

## Format Pesan

### Telegram
- Data summary: teks Markdown dengan bold header
- Prompt (`--send-prompt`): teks full prompt, auto-split dengan label `(1/N)`
- Analisis AI: header per provider + teks analisis

### Discord
- Data summary: Rich Embed kuning dengan fields — Fed, Daily, Macro, On-Chain & Derivatif, Weekly, Monthly
- Prompt: embed biru "📋 Prompt Analisis"
- Analisis AI: Rich Embed warna per provider, auto-split per ≤3800 karakter
  - 🤖 Claude: oranye `#CC785C`
  - 🟢 ChatGPT: hijau `#10A37F`
  - ✨ Gemini: biru `#4285F4`
  - 🔍 Perplexity: cyan `#1FB8CD`
  - ⚡ Grok: abu gelap `#1A1A1A`
  - 🤖 Qwen: kuning `#F0B429`

**Error isolation**: Telegram dan Discord dikirim dalam try/catch terpisah — kegagalan satu channel tidak memblokir yang lain.

---

## Troubleshooting

| Error | Solusi |
|-------|--------|
| `API key tidak diset` | Isi di `.env`, atau gunakan provider lain |
| `HTTP 451` dari Binance | GCP us-central1-a (Iowa) diblokir Binance secara regulasi — fallback ke Gate.io/Hyperliquid/CoinGecko otomatis. Migrasi ke `asia-southeast1-a` (Singapore) untuk akses penuh |
| `ECONNRESET` ke Binance/exchange | ISP Indonesia memblokir — fallback otomatis |
| `Hostname/IP does not match` | ISP SSL intercept — funding rate pakai Hyperliquid fallback |
| `WALCL undefined / skipped` | Bukan Kamis/Jumat — data dari SQLite cache otomatis |
| `PMI data tidak tersedia` | Google News RSS gagal — dari SQLite cache otomatis |
| `Altseason Index [isi manual]` | blockchaincenter.net tidak accessible — set manual di `manualOverrides.altseasonIndex` |
| `BTC exchange netflow [data tidak tersedia]` | CoinMetrics gagal — set manual di `manualOverrides.exchangeNetflow` |
| `NUPL proxy: ___` | blockchain.info atau CoinGecko gagal |
| `Google Trends: ___` | `SERPAPI_API_KEY` tidak diset di `.env` |
| `WoW: N/A` | Snapshot <7 hari — tersedia otomatis setelah 7 hari |
| CoinGecko 429 | OI/Basis/Skew dikonsolidasi ke 1 call — seharusnya tidak terjadi lagi |
| Telegram parse error | Otomatis fallback ke plain text |
| Discord Invalid Form Body | Otomatis di-split per ≤3800 karakter |
| `getaddrinfo EAI_AGAIN` | DNS/network issue — cek koneksi server |
