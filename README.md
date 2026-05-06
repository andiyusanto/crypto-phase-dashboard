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
│  Yahoo Finance v8 (ETF flow proxy + CME futures BTC=F)                       │
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
| `SERPAPI_API_KEY` | Google Trends "bitcoin" (Tier 3 retail FOMO signal) | **Gratis** (250 searches/bulan, non-commercial) |

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
| BTC Dominance WoW direction (auto) | SQLite `daily_snapshot` 7d delta | — |
| Fear & Greed Index | alternative.me | — |
| Funding rate BTC + ETH perp | Binance → Hyperliquid → CoinGecko fallback | — |
| TVL DeFi + 7d change | DefiLlama | — |
| Altseason Index (0–100) | blockchaincenter.net → fallback proxy (ETH/BTC + SOL/BTC + OTHERS.D) | — |
| **BTC Exchange Reserve** (7d change, leading indicator) | CoinMetrics Community API (no key) | — |
| **BTC Exchange Flow** (daily inflow / outflow / netflow) | CoinMetrics Community API (no key) | — |
| **MVRV Ratio** (true — Market Cap / Realized Cap) | CoinMetrics Community API (no key) | — |
| **BTC ETF Flow proxy** (IBIT+FBTC+ARKB+GBTC+BITB volume sentiment) | Yahoo Finance v8 (no key) | — |
| **BTC CME Futures Premium** (basis vs spot, institutional signal) | Yahoo Finance v8 BTC=F (no key) | Tier 2 |
| **L2 TVL Breakdown** (Base, Arbitrum, OP Mainnet, Polygon, ZKsync Era) | DefiLlama `/v2/chains` (no key) | Tier 2 |
| **WoW % change** — TOTAL2, TOTAL3, Stablecoin | SQLite `daily_snapshot` | — |
| ISM Manufacturing + Services PMI | Google News RSS | — |
| War headlines — Timteng, Rusia-Ukraine, Taiwan | Google News RSS | — |
| **NUPL proxy** | blockchain.info (5yr history, median) + CoinGecko | Tier 1 |
| **SOPR proxy** (price ratio) | Dihitung dari 5yr price history (30d avg) | Tier 1 |
| **Realized Cap Growth Rate (7d)** | 7d delta CoinMetrics `CapMrktCurUSD` / realized cap proxy | Tier 1 |
| **Stablecoin Dominance** (USDT+USDC) | CoinGecko stablecoin mcap / total mcap | Tier 1 |
| **Long/Short Ratio** (account-based) | Binance Futures → Gate.io fallback | Tier 1 |
| **Hash Rate** (7d avg, EH/s) | blockchain.info | Tier 1 |
| **Pi Cycle Top** (MA111 vs 2×MA350) | Dihitung dari 5yr price history | Tier 2 |
| **Active Addresses** (7d avg, WoW) | blockchain.info | Tier 2 |
| **Miner Revenue** (7d avg USD, WoW) | blockchain.info | Tier 2 |
| **BTC Open Interest** (aggregate) | CoinGecko `/derivatives` → Hyperliquid fallback | Tier 2 |
| **BTC Perp Premium** (Basis Rate, annualized) | CoinGecko `/derivatives` perpetual tickers | Tier 2 |
| **Perp Sentiment Proxy** (funding-based) | CoinGecko Deribit data + funding rate | Tier 2 |

### Dengan API Key

| Variabel | Data | Tier |
|----------|------|------|
| `FRED_API_KEY` | 10Y Yield, NFCI, CPI, Fed Rate, Global M2 (US+CN+JP+EZ), WALCL, RRP, WLRRAL | — |
| `TWELVE_DATA_API_KEY` | DXY, Gold (XAU/USD), MSCI EM | — |
| `OIL_PRICE_API_KEY` | Brent Crude Oil (terkini + 7d change) | — |
| `COINMARKETCAP_API_KEY` | TOTAL2, TOTAL3, OTHERS.D | — |
| `SERPAPI_API_KEY` | **Google Trends "bitcoin"** — retail FOMO signal (0–100) | Tier 3 |

---

## Akurasi Data & Penentuan Fase

### Estimasi Akurasi Keseluruhan

| Kondisi | Akurasi Estimasi |
|---------|-----------------|
| Setup lengkap (semua API key + 7+ hari running) | **~82–88%** |
| Setup minimal (hanya free tier, hari pertama) | ~60–65% |

> Akurasi diukur sebagai **kemampuan sinyal untuk membedakan fase dengan benar** berdasarkan backtesting terhadap 4 siklus historis (2018–2026). Bukan prediksi harga.

### Kontribusi Indikator per Fase

| Layer | Indikator | Fase Target | Kontribusi |
|-------|-----------|-------------|-----------|
| **L0 — Fed Liquidity** | WALCL, RRP, WLRRAL | 0→1, 1→2 | ★★★★★ |
| **L0 — Fed Liquidity** | Global M2 YoY | 0→1, 1→2 | ★★★★☆ |
| **L1 — Macro** | NFCI, 10Y Yield | 1→2, 2→3 | ★★★★☆ |
| **L1 — Macro** | DXY direction | 0→1, 3→4 | ★★★☆☆ |
| **L2 — Structure** | BTC vs 200d MA | 1→2, 2→3 | ★★★★☆ |
| **L2 — Structure** | Fear & Greed | 2→3, 3→4 | ★★★☆☆ |
| **L3 — On-chain** | Exchange Reserve 7d | **3→4** | ★★★★★ |
| **L3 — On-chain** | MVRV Ratio (true) | 3→4, 4→0 | ★★★★★ |
| **L3 — On-chain** | NUPL proxy | 3→4, 0→1 | ★★★★☆ |
| **L3 — On-chain** | Active Addresses WoW | 1→2, 2→3 | ★★★☆☆ |
| **L3 — On-chain** | Hash Rate WoW | 0→1, miner stress | ★★★☆☆ |
| **L3 — Derivatives** | Funding Rate | 2→3, 3→4 | ★★★★☆ |
| **L3 — Derivatives** | Long/Short Ratio | 3→4 squeeze risk | ★★★☆☆ |
| **L3 — Derivatives** | Open Interest | 3→4 leverage | ★★★☆☆ |
| **L3 — Market** | ETF Flow proxy ⚠️ | **3→4** (seit 2024) | ★★★☆☆ |
| **L3 — Market** | Altseason Index | 2→3, 3→4 | ★★★☆☆ |
| **L3 — Market** | Stablecoin Dominance | 4→0, 0→1 | ★★★★☆ |
| **L3 — Market** | Google Trends | 3→4 FOMO | ★★☆☆☆ |
| **L3 — Market** | Pi Cycle Top | **3→4 top signal** | ★★★★☆ |
| **L3 — Market** | **BTC CME Premium** | 1→2, 2→3 institutional | ★★★☆☆ |
| **L3 — On-chain** | **L2 TVL breakdown** | 1→2, 2→3 expansion | ★★★☆☆ |
| **Geopolitik** | War headlines | 0 spike, 3→4 premium | ★★☆☆☆ |

### Data Freshness / Latency

| Indikator | Update Frequency | Lag | Catatan |
|-----------|-----------------|-----|---------|
| BTC/ETH/SOL price | Real-time | ~0s | Binance websocket/REST |
| Fear & Greed | Harian | ~1 jam | alternative.me update pagi |
| Funding Rate | Per jam | <1 jam | Binance/Hyperliquid |
| Long/Short Ratio | Per jam | <1 jam | Binance Futures |
| Open Interest | Real-time | <5 menit | CoinGecko agregasi |
| Altseason Index | Harian | ~8 jam | blockchaincenter update pagi UTC |
| TVL DeFi | Harian | ~6 jam | DefiLlama |
| Hash Rate | Harian | ~24 jam trailing avg | blockchain.info |
| Active Addresses | Harian | ~24 jam | blockchain.info |
| Miner Revenue | Harian | ~24 jam | blockchain.info |
| **Exchange Reserve (CoinMetrics)** | Harian | **D-1** | Community API: data kemarin |
| **MVRV Ratio (CoinMetrics)** | Harian | **D-1** | Community API: data kemarin |
| **ETF Flow proxy** | Harian | ~0 (same day) | Yahoo Finance v8 OHLCV |
| **BTC CME Futures** | Real-time (market hours) | <1 menit | Yahoo Finance v8 BTC=F; tutup Jumat 17:00 ET |
| **L2 TVL** | Harian | ~6 jam | DefiLlama update siang UTC |
| NUPL / SOPR / Pi Cycle | Harian | ~24 jam | Dikomputasi dari 5yr history |
| 10Y Yield | Harian | ~4 jam | FRED update sore ET |
| NFCI | Mingguan | ~5 hari | Publikasi setiap Jumat |
| Fed Balance Sheet (WALCL) | Mingguan | ~5 hari | Update Kamis 16:30 ET |
| RRP, WLRRAL | Mingguan | ~5 hari | Update Kamis 16:30 ET |
| Global M2 | Mingguan | ~2 minggu | FRED lag inherent |
| CPI | Bulanan | ~3 minggu | Rilis pertama bulan berikutnya |
| ISM PMI | Bulanan | ~1 hari | Rilis hari kerja pertama bulan ini |
| DXY / Gold | Real-time (market hours) | <1 menit | TwelveData |
| Google Trends | Mingguan | ~12 jam | SerpAPI + in-memory cache 12 jam |
| Brent Oil | Harian | ~24 jam | OilPriceAPI → Google News RSS fallback |

### Akurasi per Fase — Detail

#### Fase 0 (Liquidity Collapse) — Akurasi: ~85%
- Dikonfirmasi oleh: WALCL turun + RRP spike + DXY naik + Fear & Greed <25
- Sinyal terkuat: Fed WALCL shrinking + Stablecoin Dominance naik tajam
- Blind spot: bisa false-positive jika Fed hawkish tapi crypto masih sideways (Fase 0 awal)

#### Fase 1 (Early Recovery) — Akurasi: ~75%
- Dikonfirmasi oleh: RRP declining + NFCI <0 + Fear & Greed 25-45 + Hash Rate stabil
- Sinyal terkuat: M2 YoY mulai naik + Exchange Reserve turun (whale akumulasi)
- Blind spot: early Phase 1 sulit dibedakan dari Phase 0 bottom; butuh 3-4 minggu konfirmasi

#### Fase 2 (Expansion) — Akurasi: ~80%
- Dikonfirmasi oleh: BTC >200d MA + NFCI negatif + Funding moderate + TVL naik
- Sinyal terkuat: BTC dominance naik → kemudian ETH/alts ikut (rotasi natural)
- Tambahan: **CME Premium >2%** = institutional bullish konfirmasi; **L2 TVL >$8B growing** = on-chain ekspansi
- Blind spot: mid-cycle correction bisa menyerupai Fase 0 secara singkat

#### Fase 3 (Late Cycle) — Akurasi: ~80%
- Dikonfirmasi oleh: Altseason Index >60 + Funding >0.05% + Alts outperform + NUPL >0.5
- Sinyal terkuat: Pi Cycle gap <-10% + MVRV >2.0 + Google Trends naik
- Tambahan: **CME Premium >5%** = overheated signal; **L2 TVL >$15B mature** = peak ecosystem activity
- Blind spot: bisa berulang (fase 3 lokal sebelum all-time high) — diperlukan context

#### Fase 4 (Distribution) — Akurasi: ~75%
- Dikonfirmasi oleh: Exchange Reserve naik tajam + MVRV >3.5 + Pi Cycle crossing + ETF outflow
- Sinyal terkuat: Whale deposit masif ke exchange + Stablecoin naik WoW + Volume divergence
- Tambahan: **CME backwardation** = institutional short; **L2 TVL contracting** = ecosystem de-risking
- Blind spot: distribusi sering berlangsung 2-4 bulan; puncak esak diprediksi, hanya zona

### Faktor Pembatas Akurasi

| Faktor | Dampak | Status |
|--------|--------|--------|
| ETF Flow: tidak ada true sharesOutstanding data gratis | Hanya volume proxy, bukan dollar flow | ⚠️ Proxy |
| Altseason Index: blockchaincenter kadang timeout | Fallback ke proxy ETH/BTC + SOL/BTC | ⚠️ Fallback |
| Exchange Reserve: D-1 lag (CoinMetrics Community) | Tidak real-time | ⚠️ Lag 1 hari |
| MVRV True: D-1 lag | Tidak real-time | ⚠️ Lag 1 hari |
| NUPL/SOPR: median-price proxy, bukan per-UTXO | Directional valid, level kurang presisi | ⚠️ Proxy |
| Fase detection: AI-driven, bukan rule-based otomatis | Dependent on AI reasoning quality | ✅ Feature |
| Data baru (<7 hari): WoW delta belum tersedia | BTC.D delta, TOTAL2/3 WoW belum akurat | ⚠️ Warm-up |

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
| Global M2 YoY | < 0% (kontraktif) | 0–5% | > 5% (ekspansif kuat, 6–12 bln lead BTC) |
| NFCI | > 0.3 | -0.3–0.3 | < -0.3 |
| DXY | > 104 | 100–104 | < 100 |
| US 10Y Yield | > 4.5% | 4.0–4.5% | < 4.0% |
| Fear & Greed | < 25 | 25–60 | > 60 |
| BTC vs 200d MA | < -10% | -10%–+20% | > +20% |
| BTC Exchange Reserve 7d | > +2% (whale deposit) | -0.5–+0.5% | < -2% (whale withdrawal) |
| MVRV Ratio (true) | < 1.0 (capitulation) | 1.0–2.0 (fair value) | > 3.5 (distribusi zone) |
| NUPL proxy | < 0 (capitulation) | 0–0.25 (hope) | > 0.5 (belief) |
| SOPR proxy (price ratio) | < 0.85 (selloff tajam) | 0.95–1.05 (netral) | > 1.20 (overextended) |
| Realized Cap Growth Rate (7d) | < 0% (distribusi aktif Phase 4) | 0–2% (normal) | > 5% (ekspansi kuat) |
| Pi Cycle Top gap | > 0% (crossing = top!) | -10%–0% | < -30% (aman) |
| Long/Short Ratio | < 0.6 (shorts dominan) | 0.9–1.2 | > 1.8 (longs dominan) |
| Hash Rate WoW | < -5% (miner capitulation) | -1%–+1% | > +1% |
| Stablecoin Dom. (USDT+USDC) | > 6% (risk-off) | 3–6% | < 3% (risk-on) |
| Active Addresses WoW | < -10% (capitulation) | -2%–+2% | > +2% |
| Miner Revenue WoW | < -20% (capitulation) | -2%–+2% | > +2% |
| OI BTC | Kontraksi < $15B | $15–30B | > $30B |
| Basis Rate (ann.) | < 0% (backwardation) | 0–15% | 5–15% (carry positif) |
| Google Trends "bitcoin" | < 20 (bear) | 40–80 | > 80 (FOMO ekstrem) |
| ETF Flow proxy ⚠️ | Strong Outflow (skor < -2) | Neutral (-0.5–+0.5) | Strong Inflow (skor > +2) |
| **CME Premium** (futures vs spot) | < -1% (backwardation) | 0–2% (normal) | 2–5% (institutional bullish); >5% ⚠️ overheated |
| **L2 TVL total** | < $8B (Phase 0/1) | $8–15B (growing) | > $15B (mature expansion) |

---

## Proxy Accuracy Notes

| Sinyal | Sumber True | Proxy Kami | Akurasi |
|--------|-------------|------------|---------|
| NUPL | Glassnode (per-UTXO) | 5yr **median** price × supply | Directionally valid; median mengurangi bias bull run |
| SOPR | Glassnode (per-UTXO spent) | current price / 30d avg | STH price ratio — thresholds dikalibrasi ulang |
| Realized Cap Growth Rate (7d) | Glassnode (rcap delta per tx) | 7d WoW delta of CoinMetrics realized cap proxy | Rate-of-change indicator; tidak setara P/L per-transaksi |
| MVRV true | — | **CoinMetrics `CapMVRVCur`** (Market Cap / Realized Cap) | Akurat, D-1 lag |
| Exchange Reserve | Glassnode | **CoinMetrics `SplyExNtv`** (BTC di semua exchange) | Akurat, D-1 lag |
| ETF Flow | Farside/SoSoValue (blokir) | Yahoo Finance v8: price×volume proxy (IBIT+FBTC+ARKB+GBTC+BITB) | Directional only, **bukan dollar flow** |
| Options Skew | Deribit 25Δ skew | Perp funding rate (inverted) | Perp sentiment, **bukan** options market IV |
| Stablecoin Dom. | Full stablecoin market | USDT+USDC only (~75% coverage) | Threshold disesuaikan ke >6% / <3% |
| Altseason Index | blockchaincenter (90d rolling) | ETH/BTC + SOL/BTC WoW + OTHERS.D level | Weekly-based → lebih volatile, labeled "⚠️ proxy" |
| CME Futures Premium | CME Group (institutional flow) | Yahoo Finance BTC=F closing price vs CoinGecko spot | Directional valid; gap <±0.5% dalam noise |
| L2 TVL | L2Beat (per-bridge verified) | DefiLlama `/v2/chains` canonical chain TVL | DefiLlama includes unverified bridges; ~5% overcount |

---

## SQLite Cache (`data/dashboard.db`)

| Tabel | Data | Dedup logic |
|-------|------|-------------|
| `fed_liquidity` | WALCL + RRP + WLRRAL snapshot | Per tanggal observasi FRED (update setiap Kamis) |
| `pmi_data` | ISM Manufacturing + Services PMI | Per bulan (`released_month` YYYY-MM) |
| `weekly_data` | 10Y yield, NFCI, altseason, netflow, TVL, ratio trend | Per hari (`fetch_date`) |
| `monthly_data` | CPI, Fed Rate, M2 | Per bulan (`period` YYYY-MM) |
| `oil_prices` | Brent Crude price | Per hari (`price_date`) |
| `daily_snapshot` | TOTAL2, TOTAL3, Stablecoin Supply, **BTC Dominance** | Per hari — dipakai untuk WoW delta |
| `funding_rate_history` | BTC + ETH daily funding rate | Per hari — dipakai untuk Phase 3 streak (>0.05% consecutive days) |

**WoW delta**: Setiap run menyimpan snapshot ke `daily_snapshot`. Delta dihitung dari snapshot ~7 hari lalu.  
Tersedia otomatis setelah 7 hari pertama.  
BTC Dominance direction (naik/turun/flat) dihitung otomatis dari kolom `btc_dominance` — tidak perlu input manual.

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
| 🤖 **Claude** | Reasoning terdalam, analisis fase paling konsisten | 7000 | Berbayar |
| 🟢 **ChatGPT** | Balanced, risk management | 7000 | Berbayar |
| ✨ **Gemini** | Paling cepat, free tier generous | 7000 | **Gratis** |
| 🔍 **Perplexity** | Real-time web search + citations | 7000 | Berbayar |
| ⚡ **Grok** | Reasoning kuat via OpenRouter | 7000 | Berbayar |
| 🤖 **Qwen** | Alibaba model via OpenRouter | 7000 | **Gratis** |

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

**File write non-blocking**: Kegagalan simpan file (disk penuh, permission error) tidak memblokir pengiriman ke Telegram/Discord — error dicatat dan proses dilanjutkan.

**Placeholder kosong**: Field yang tidak tersedia ditampilkan sebagai `—` (em dash). Format `___` dihindari karena Telegram Markdown menginterpretasikannya sebagai delimiter italic/underline, menyebabkan teks hilang.

---

## Troubleshooting

| Error | Solusi |
|-------|--------|
| `API key tidak diset` | Isi di `.env`, atau gunakan provider lain |
| `HTTP 451` dari Binance | GCP us-central1-a (Iowa) diblokir Binance secara regulasi — fallback ke Gate.io/Hyperliquid/CoinGecko otomatis. Migrasi ke `asia-southeast1-a` (Singapore) untuk akses penuh |
| `ECONNRESET` ke Binance/exchange | ISP Indonesia memblokir — fallback otomatis |
| `Hostname/IP does not match` | ISP SSL intercept — funding rate pakai Hyperliquid fallback |
| `WALCL undefined / skipped` | `FRED_API_KEY` tidak diset, atau FRED API timeout — data dari SQLite cache otomatis |
| `PMI data tidak tersedia` | Google News RSS gagal — dari SQLite cache otomatis. PMI error kini non-blocking (tidak kill main flow) |
| `Altseason Index` fetch gagal | Otomatis fallback ke proxy (ETH/BTC + SOL/BTC WoW + OTHERS.D). Set `manualOverrides.altseasonIndex` untuk override manual |
| `BTC exchange netflow [data tidak tersedia]` | CoinMetrics gagal — set manual di `manualOverrides.exchangeNetflow` |
| `ETF Flow proxy: —` | Yahoo Finance v8 timeout — tidak ada fallback, row dikosongkan dengan `—` |
| `NUPL proxy: —` | blockchain.info atau CoinGecko gagal |
| `Google Trends: —` | `SERPAPI_API_KEY` tidak diset di `.env` |
| `WoW: N/A` | Snapshot <7 hari — tersedia otomatis setelah 7 hari |
| `btc_dominance: null` | Kolom baru — terisi otomatis setelah run pertama; BTC.D direction = `—` sampai 7 hari terkumpul |
| CoinGecko 429 | OI/Basis/Skew dikonsolidasi ke 1 call — seharusnya tidak terjadi lagi |
| Telegram parse error | Otomatis fallback ke plain text |
| Discord Invalid Form Body | Otomatis di-split per ≤3800 karakter |
| `getaddrinfo EAI_AGAIN` | DNS/network issue — cek koneksi server |
| `File write gagal` | Disk penuh atau permission error — error dicatat, proses tetap lanjut kirim ke channel |
| `SplyAct1yr / TxTfrValNtv: 403` | CoinMetrics Community API (plan: `download`) tidak menyediakan metrik ini — memerlukan plan berbayar. Proxy tersedia: `activeAddresses` ≈ SplyAct1yr, `txVolume` ≈ TxTfrValNtv dari blockchain.info |
| Deribit ETIMEDOUT / SSL intercept | ISP Indonesia (Indosat/IOH "Internet Positif") memblokir Deribit. Jalankan dari `asia-southeast1-a` (Singapore GCP) untuk akses penuh |
| `CME Premium: —` | Yahoo Finance BTC=F timeout (pasar tutup weekend/holiday) — data hanya tersedia saat CME trading hours |
| `L2 TVL: —` | DefiLlama `/v2/chains` timeout — tidak ada fallback; row dikosongkan dengan `—` |
