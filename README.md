# Crypto Dashboard — Hedge Fund Analyst

Script Node.js untuk otomatis fetch data macro/crypto, analisis dengan **6 AI** (Claude, ChatGPT, Gemini, Perplexity, Grok, Qwen), dan distribusi ke **Telegram** dan/atau **Discord**.

Setiap AI provider, Telegram, dan Discord **sepenuhnya independen** — menjalankan satu tidak memerlukan yang lain terkonfigurasi.

---

## Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                      DATA SOURCES                           │
│  CoinGecko · Hyperliquid · DefiLlama · FRED · OilPriceAPI   │
│  alternative.me · Google News RSS · Twelve Data             │
└──────────────────────────┬──────────────────────────────────┘
                           │ generate prompt
         ┌─────────────────┼────────────────────────────────────────┐
         ▼                 ▼          ▼            ▼                ▼
    🤖 Claude         ✨ Gemini   🔍 Perplexity  ⚡ Grok (Puter)  🤖 Qwen (Puter)
    Anthropic         Google      Sonar         xAI              Alibaba
         │                 │          │            │                │
         └─────────────────┼──────────┘            └──────┬─────────┘
                           │      🟢 ChatGPT              │
                           │       (Puter)                │
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
| `PUTER_AUTH_TOKEN` | ChatGPT (via Puter) | openai/gpt-4o | [developer.puter.com](https://developer.puter.com) | **Gratis** |
| `GEMINI_API_KEY` | Gemini | gemini-2.5-flash | [aistudio.google.com](https://aistudio.google.com/apikey) | **Gratis** |
| `PERPLEXITY_API_KEY` | Perplexity | sonar-pro | [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api) | Berbayar |
| `PUTER_AUTH_TOKEN` | Grok (via Puter) | x-ai/grok-4-1-fast | [developer.puter.com](https://developer.puter.com) | **Gratis** |
| `PUTER_AUTH_TOKEN` | Qwen (via Puter) | qwen/qwen3.6-plus:free | [developer.puter.com](https://developer.puter.com) | **Gratis** |

> **Puter AI**: Mendukung ChatGPT, Grok, Qwen, dll. tanpa API key individual untuk free tier. Opsional: gunakan `PUTER_AUTH_TOKEN` jika punya akun premium.

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

#### Data Sources (untuk data lebih lengkap)

| Variabel | Data | Harga |
|----------|------|-------|
| `FRED_API_KEY` | 10Y Yield, NFCI, CPI, PMI, Global M2, Fed Balance Sheet, RRP, Reserves | **Gratis** |
| `TWELVE_DATA_API_KEY` | DXY, Gold, MSCI EM | **Gratis** (800 req/hari) |
| `OIL_PRICE_API_KEY` | Brent Crude Oil | **Gratis** (200 req/bulan) |

### 3. Update manual overrides harian

Edit `src/index.js`, bagian `manualOverrides`:

```js
const manualOverrides = {
  faseEstimasi:    '2',     // estimasi fase kamu: 0/1/2/3/4
  warTimteng:      'none',  // 'none' = auto-fetch Google News
  warRusiaUkraine: 'none',
  warTaiwan:       'none',

  // Setiap SENIN (uncomment):
  // altseasonIndex:   '65',
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

### Kirim Prompt

| Command | Deskripsi |
|---------|-----------|
| `npm run send:prompt` | Kirim prompt ke Telegram (tanpa analisis) |
| `npm run send:prompt:analyze` | Kirim prompt + jalankan semua AI + kirim ke semua channel |
| `node src/index.js --send-prompt --analyze --provider grok --telegram` | Kirim prompt + Grok → Telegram |

### Analisis AI (tanpa channel)

| Command | AI |
|---------|----|
| `npm run analyze:claude` | 🤖 Claude (Anthropic) |
| `npm run analyze:chatgpt` | 🟢 ChatGPT (OpenAI) |
| `npm run analyze:gemini` | ✨ Gemini (Google) |
| `npm run analyze:perplexity` | 🔍 Perplexity Sonar |
| `npm run analyze:grok` | ⚡ Grok (Puter AI) |
| `npm run analyze:qwen` | 🤖 Qwen (Puter AI) |
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
| `--send-prompt` | Kirim prompt ke Telegram sebelum analisis dimulai |
| `--print` | Print prompt lengkap ke terminal |
| `--no-save` | Jangan simpan file ke `output/` |
| `--mode=daily\|weekly\|monthly\|fed` | Fetch data tertentu saja |
| `--provider=claude\|chatgpt\|gemini\|perplexity\|grok\|all` | Pilih AI |
| `--telegram` | Aktifkan Telegram |
| `--discord` | Aktifkan Discord |

**Contoh kombinasi:**
```bash
# Grok + kirim prompt + Telegram + Discord
node src/index.js --analyze --provider grok --send-prompt --telegram --discord

# Semua AI, print prompt dulu, kirim ke semua channel
node src/index.js --analyze --provider all --print --telegram --discord

# Fetch weekly saja + Discord
node src/index.js --mode=weekly --discord

# Kirim prompt ke Telegram saja (tanpa analisis)
node src/index.js --send-prompt
```

### Scheduler Otomatis

```bash
npm run schedule
```

Analisis Gemini + Prompt + Telegram + Discord berjalan **3× sehari**:

| Waktu WIB | Setara | Hari | Aksi |
|-----------|--------|------|------|
| 06:00 | Tokyo 08:00 JST | Setiap hari | ✨ Gemini → Prompt + Telegram + Discord |
| 06:00 | — | **Senin** | Weekly fetch → Gemini → Prompt + semua channel |
| 07:00 | — | Setiap hari | Daily fetch |
| 07:05 | — | **Senin** | Weekly fetch |
| 07:10 | — | **Tgl 1** | Monthly fetch |
| 08:00 | — | **Kamis & Jumat** | Fed Liquidity fetch |
| 15:00 | London 08:00 GMT | Setiap hari | ✨ Gemini → Prompt + Telegram + Discord |
| 19:00 | New York 08:00 EDT | Setiap hari | ✨ Gemini → Prompt + Telegram + Discord |
| 19:00 | — | **Kamis & Jumat** | Fed fetch → Gemini → Prompt + semua channel |

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

## Output Files

```
output/
├── latest_prompt.txt                  ← Prompt terbaru (bisa paste ke AI manapun)
├── latest_data.json                   ← Raw data JSON
├── latest_analysis.txt                ← Analisis terbaru
├── latest_analysis_claude.txt
├── latest_analysis_chatgpt.txt
├── latest_analysis_gemini.txt
├── latest_analysis_perplexity.txt
├── latest_analysis_grok.txt
│
├── prompt_2026-03-27T07-00-00.txt
├── data_2026-03-27T07-00-00.json
└── analysis_grok_2026-03-27T07-00-00.txt
```

---

## Data Coverage

### Tanpa API key

| Data | Sumber |
|------|--------|
| BTC, ETH, SOL price + 24h | CoinGecko |
| BTC Dominance, ETH/BTC, SOL/BTC | CoinGecko |
| Stablecoin supply, OTHERS.D | CoinGecko |
| Fear & Greed Index | alternative.me |
| Funding rate BTC+ETH | Hyperliquid → CoinGecko fallback |
| TVL DeFi + 7d change | DefiLlama |
| War headlines (3 wilayah) | Google News RSS |

### FRED API (gratis)

| Data | FRED Series |
|------|-------------|
| US 10Y Yield | DGS10 |
| NFCI | NFCI |
| CPI YoY | CPIAUCSL |
| ISM PMI | MANPMI |
| Fed Funds Rate | FEDFUNDS |
| Global M2 (US+CN+JP+EZ) | M2SL + MYAGM2CNM189N + MYAGM2JPM189N + MABMM301EZM189S |
| Fed Balance Sheet | WALCL |
| RRP Balance | RRPONTSYD |
| Reserve Balances | WLRRAL |

### Twelve Data (gratis)
DXY, Gold (XAU/USD), MSCI EM via EEM ETF

### OilPriceAPI (gratis)
Brent Crude Oil — harga terkini + 7d change

### Manual (di `manualOverrides`)
Altseason Index (blockchaincenter.net), BTC Exchange Netflow (CryptoQuant), TOTAL2/TOTAL3 (TradingView)

---

## Perbandingan AI

| Provider | Keunggulan | Model | Harga |
|----------|-----------|-------|-------|
| 🤖 **Claude** | Reasoning terdalam, analisis fase paling konsisten | claude-sonnet-4-5 | Berbayar |
| 🟢 **ChatGPT** | Balanced, risk management (via Puter) | openai/gpt-4o | **Gratis** |
| ✨ **Gemini** | Paling cepat, free tier generous | gemini-2.5-flash | **Gratis** |
| 🔍 **Perplexity** | Real-time web search + citations | sonar-pro | Berbayar |
| ⚡ **Grok** | Reasoning kuat, xAI model via Puter | x-ai/grok-4-1-fast | **Gratis** |
| 🤖 **Qwen** | Alibaba Qwen model via Puter | qwen/qwen3.6-plus:free | **Gratis** |

---

## Format Pesan

### Telegram
- Data summary: teks Markdown dengan bold header
- Prompt (jika `--send-prompt`): teks full prompt dengan header tanggal
- Analisis AI: header per provider + teks analisis
- Pesan panjang auto-split dengan label `(1/N)`

### Discord
- Data summary: Rich Embed kuning dengan fields terstruktur
- Analisis AI: Rich Embed dengan warna per provider
  - 🤖 Claude: oranye `#CC785C`
  - 🟢 ChatGPT: hijau `#10A37F`
  - ✨ Gemini: biru `#4285F4`
  - 🔍 Perplexity: cyan `#1FB8CD`
  - ⚡ Grok: abu gelap `#1A1A1A`

---

## Troubleshooting

| Error | Solusi |
|-------|--------|
| `API key tidak diset` | Isi di `.env`, atau gunakan provider lain |
| `Hostname/IP does not match` | ISP SSL intercept — funding rate pakai fallback otomatis |
| `WALCL undefined` | Bukan Kamis/Jumat — set `forceFed: true` di manualOverrides |
| Telegram `parse error` | Otomatis fallback ke plain text |
| Discord `Invalid Form Body` | Otomatis di-split per ≤3800 karakter |
| `getaddrinfo EAI_AGAIN` | DNS/network issue — cek koneksi server |
| Grok `401 Unauthorized` | XAI_API_KEY tidak valid — cek di console.x.ai |
