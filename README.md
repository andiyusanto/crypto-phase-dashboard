# Crypto Dashboard — Hedge Fund Analyst

Script Node.js untuk otomatis fetch data macro/crypto, analisis dengan **6 AI** (Claude, ChatGPT, Gemini, Perplexity, Grok, Qwen), dan distribusi ke **Telegram** dan/atau **Discord**.

Setiap AI provider, Telegram, dan Discord **sepenuhnya independen** — menjalankan satu tidak memerlukan yang lain terkonfigurasi.

---

## Arsitektur

```
┌──────────────────────────────────────────────────────────────────────┐
│                            DATA SOURCES                              │
│  CoinGecko · Hyperliquid · DefiLlama · FRED · OilPriceAPI            │
│  alternative.me · Google News RSS · Twelve Data · blockchaincenter   │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
              ┌────────────────┼───────────────────┐
              │                │                   │
       SQLite Cache        generate prompt      War Headlines
       (Fed + PMI)             │               (Google News RSS)
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
| `ANTHROPIC_API_KEY` | Claude | claude-sonnet-4-5 | [console.anthropic.com](https://console.anthropic.com) | Berbayar |
| `OPENROUTER_API_KEY` | ChatGPT (OpenRouter) | openai/gpt-4o | [openrouter.ai](https://openrouter.ai) | Berbayar |
| `GEMINI_API_KEY` | Gemini | gemini-2.5-flash | [aistudio.google.com](https://aistudio.google.com/apikey) | **Gratis** |
| `PERPLEXITY_API_KEY` | Perplexity | sonar-pro | [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api) | Berbayar |
| `OPENROUTER_API_KEY` | Grok (OpenRouter) | x-ai/grok-4-1-fast | [openrouter.ai](https://openrouter.ai) | Berbayar |
| `OPENROUTER_API_KEY` | Qwen (OpenRouter) | qwen/qwen3-plus:free | [openrouter.ai](https://openrouter.ai) | **Gratis** |

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

### 3. Update manual overrides harian

Edit `src/index.js`, bagian `manualOverrides`:

```js
const manualOverrides = {
  faseEstimasi:    '2',     // estimasi fase kamu: 0/1/2/3/4
  warTimteng:      'none',  // 'none' = auto-fetch Google News
  warRusiaUkraine: 'none',
  warTaiwan:       'none',
  btcDominanceDirection: 'naik',  // override arah BTC.D

  // Uncomment untuk override manual:
  // altseasonIndex:   '65',              // auto-fetched dari blockchaincenter.net
  // exchangeNetflow:  'outflow (-1,200 BTC)',
  // total2:           '$1.12T | di bawah $1.2T',
  // total3:           '$680B | mendekati $700B',
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
| `--send-prompt` | Kirim prompt ke channel (Telegram dan/atau Discord) sebelum analisis |
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

Analisis berjalan **3× sehari** pada market session open dengan banner visual:

```
=================================================================================================================
====================================================   Start   ====================================================
=========================================== Japan 2026-04-09 06:00:00 ===========================================

   ... semua output analisis + pengiriman channel ...

=========================================== Japan 2026-04-09 06:08:43 ===========================================
=====================================================   END   =====================================================
=================================================================================================================
```

| Waktu WIB | Session | Aksi |
|-----------|---------|------|
| 06:00 | 🇯🇵 Tokyo Open (08:00 JST) | Semua AI → Prompt + Telegram + Discord |
| 15:00 | 🇬🇧 London Open (08:00 GMT) | Semua AI → Prompt + Telegram + Discord |
| 19:00 | 🇺🇸 New York Open (08:00 EDT) | Semua AI → Prompt + Telegram + Discord |

**Run di background:**
```bash
# PM2 (recommended)
npm install -g pm2
pm2 start src/scheduler.js --name crypto-dashboard
pm2 save && pm2 startup

# nohup
nohup node src/scheduler.js > logs/scheduler.log 2>&1 &
```

---

## Data Coverage

### Selalu (tanpa API key)

| Data | Sumber |
|------|--------|
| BTC, ETH, SOL price + 24h change | CoinGecko |
| BTC Dominance, ETH/BTC, SOL/BTC ratio | CoinGecko |
| Fear & Greed Index | alternative.me |
| Funding rate BTC + ETH | Hyperliquid → CoinGecko fallback |
| TVL DeFi + 7d change | DefiLlama |
| Altseason Index (0–100) | blockchaincenter.net (HTML scrape) |
| ISM Manufacturing PMI + Services PMI | Google News RSS (ISM press release) |
| War headlines — Middle East, Russia-Ukraine, Taiwan | Google News RSS |

### FRED API (gratis)

| Data | Series |
|------|--------|
| US 10Y Yield | DGS10 |
| Chicago Fed NFCI | NFCI |
| CPI YoY | CPIAUCSL |
| Fed Funds Rate | FEDFUNDS |
| Global M2 (US + CN + JP + EZ) | M2SL + MYAGM2CNM189N + MYAGM2JPM189N + MABMM301EZM189S |
| Fed Balance Sheet (WALCL) | WALCL |
| RRP Balance | RRPONTSYD |
| Reserve Balances (WLRRAL) | WLRRAL |

### Twelve Data (gratis, 800 req/hari)
DXY, Gold (XAU/USD), MSCI EM via EEM ETF

### OilPriceAPI (gratis, 200 req/bulan)
Brent Crude Oil — harga terkini + 7d change

### CoinMarketCap (gratis)
TOTAL2, TOTAL3, OTHERS.D dominance

### Manual (di `manualOverrides` jika diperlukan)
BTC Exchange Netflow (CryptoQuant)

---

## SQLite Cache (`data/dashboard.db`)

Data di-cache lokal untuk fallback ketika fetch gagal:

| Tabel | Data | Dedup logic |
|-------|------|-------------|
| `fed_liquidity` | WALCL + RRP + WLRRAL snapshot | Berdasarkan tanggal observasi FRED (walcl.date + rrp.date + reserves.date) |
| `pmi_data` | ISM Manufacturing + Services PMI | Berdasarkan `released_month` (YYYY-MM) — satu record per bulan |

**Fallback hierarchy:**
- Fed data: Thu/Fri fetch → jika skip/gagal → SQLite cache
- PMI data: Google News RSS → jika gagal → SQLite cache

---

## Output Files

```
output/
├── latest_prompt.txt                    ← Prompt terbaru
├── latest_data.json                     ← Raw data JSON
├── latest_analysis.txt                  ← Analisis terbaru
├── latest_analysis_claude.txt
├── latest_analysis_chatgpt.txt
├── latest_analysis_gemini.txt
├── latest_analysis_perplexity.txt
├── latest_analysis_grok.txt
├── latest_analysis_qwen.txt
│
├── prompt_2026-04-09T06-00-00.txt
└── analysis_gemini_2026-04-09T06-00-00.txt
```

---

## Perbandingan AI

| Provider | Keunggulan | Harga |
|----------|-----------|-------|
| 🤖 **Claude** | Reasoning terdalam, analisis fase paling konsisten | Berbayar |
| 🟢 **ChatGPT** | Balanced, risk management | Berbayar |
| ✨ **Gemini** | Paling cepat, free tier generous | **Gratis** |
| 🔍 **Perplexity** | Real-time web search + citations | Berbayar |
| ⚡ **Grok** | Reasoning kuat via OpenRouter | Berbayar |
| 🤖 **Qwen** | Alibaba model via OpenRouter | **Gratis** |

---

## Format Pesan

### Telegram
- Data summary: teks Markdown dengan bold header
- Prompt (`--send-prompt`): teks full prompt
- Analisis AI: header per provider + teks analisis
- Pesan panjang auto-split dengan label `(1/N)`

### Discord
- Data summary: Rich Embed kuning dengan fields terstruktur (Fed, Daily, Macro, Weekly, Monthly)
- Prompt (`--send-prompt --discord`): embed biru dengan judul "📋 Prompt Analisis"
- Analisis AI: Rich Embed dengan warna per provider, auto-split per ≤3800 karakter
  - 🤖 Claude: oranye `#CC785C`
  - 🟢 ChatGPT: hijau `#10A37F`
  - ✨ Gemini: biru `#4285F4`
  - 🔍 Perplexity: cyan `#1FB8CD`
  - ⚡ Grok: abu gelap `#1A1A1A`
  - 🤖 Qwen: kuning `#F0B429`

---

## Troubleshooting

| Error | Solusi |
|-------|--------|
| `API key tidak diset` | Isi di `.env`, atau gunakan provider lain |
| `Hostname/IP does not match` | ISP SSL intercept — funding rate pakai fallback otomatis |
| `WALCL undefined / skipped` | Bukan Kamis/Jumat — data diambil dari SQLite cache otomatis |
| `PMI data tidak tersedia` | Google News RSS gagal — data diambil dari SQLite cache otomatis |
| `Altseason Index [isi manual]` | blockchaincenter.net tidak bisa diakses — set manual di `manualOverrides.altseasonIndex` |
| Telegram `parse error` | Otomatis fallback ke plain text |
| Discord `Invalid Form Body` | Otomatis di-split per ≤3800 karakter |
| `getaddrinfo EAI_AGAIN` | DNS/network issue — cek koneksi server |
