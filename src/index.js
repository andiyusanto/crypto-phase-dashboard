// ============================================
// CRYPTO DASHBOARD — MAIN ENTRY POINT v17
//
// Setiap AI provider & channel sepenuhnya independen.
//
// FETCH:
//   npm run fetch
//   npm run fetch:telegram
//   npm run fetch:discord
//   npm run fetch:all-channels
//
// ANALYZE per AI (+ opsi kirim prompt, telegram, discord):
//   npm run analyze:claude
//   npm run analyze:chatgpt
//   npm run analyze:gemini
//   npm run analyze:perplexity
//   npm run analyze:grok
//   npm run analyze:all
//
// ANALYZE + TELEGRAM:
//   npm run analyze:claude:telegram
//   npm run analyze:grok:telegram
//   ... (lihat package.json)
//
// ANALYZE + DISCORD:
//   npm run analyze:grok:discord
//   ... (lihat package.json)
//
// ANALYZE + SEMUA CHANNEL:
//   npm run analyze:grok:all-channels
//   npm run analyze:all:all-channels
//
// FLAGS TAMBAHAN:
//   --send-prompt      kirim prompt ke Telegram sebelum analisis dimulai
//   --print            print prompt ke terminal
//   --no-save          jangan simpan file
//   --mode=daily|weekly|monthly|fed|all
//   --provider=claude|chatgpt|gemini|perplexity|grok|all
//   --telegram         kirim ke Telegram
//   --discord          kirim ke Discord
// ============================================

import 'dotenv/config';
import chalk from 'chalk';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { fetchAllDailyData }    from './fetchers/daily.js';
import { fetchAllWeeklyData }   from './fetchers/weekly.js';
import { fetchAllMonthlyData }  from './fetchers/monthly.js';
import { fetchAllFedLiquidity } from './fetchers/fedliquidity.js';
import { fetchAllWarHeadlines } from './fetchers/warheadlines.js';
import { formatDashboardPrompt, formatDataSummary } from './formatter.js';
import { analyzeWith, saveAnalysis } from './claude-analyst.js';

import {
  sendToTelegram,
  sendPromptToTelegram,
  formatFetchSummaryForTelegram,
  formatAnalysisHeader as formatAnalysisHeaderTelegram,
} from './telegram-sender.js';

import {
  sendDataSummaryToDiscord,
  sendAnalysisToDiscord,
} from './discord-sender.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const config = {
  fredApiKey:        process.env.FRED_API_KEY,
  twelveDataKey:     process.env.TWELVE_DATA_API_KEY,
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY,
  oilPriceApiKey:    process.env.OIL_PRICE_API_KEY,

  anthropicApiKey:   process.env.ANTHROPIC_API_KEY,
  openaiApiKey:      process.env.OPENAI_API_KEY,
  geminiApiKey:      process.env.GEMINI_API_KEY,
  perplexityApiKey:  process.env.PERPLEXITY_API_KEY,
  xaiApiKey:         process.env.XAI_API_KEY,

  telegramBotToken:  process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId:    process.env.TELEGRAM_CHAT_ID,
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
};

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL OVERRIDES
// ─────────────────────────────────────────────────────────────────────────────
const manualOverrides = {
  faseEstimasi:    '2',
  warTimteng:      'none',
  warRusiaUkraine: 'none',
  warTaiwan:       'none',
  btcDominanceDirection: 'naik', // Manual override based on user assumption
  // SENIN:
  // altseasonIndex:   '65',
  // exchangeNetflow:  'outflow (-1,200 BTC)',
  // total2:           '$1.12T | di bawah $1.2T',
  // total3:           '$680B | mendekati $700B',
  // FORCE:
  // forceWeekly: true, forceMonthly: true, forceFed: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// METADATA PROVIDER — 5 AI sekarang
// ─────────────────────────────────────────────────────────────────────────────
const PROVIDERS = {
  claude:     { label: 'Claude (Anthropic)', emoji: '🤖', color: chalk.magenta, envKey: 'ANTHROPIC_API_KEY',  cfgKey: 'anthropicApiKey'  },
  chatgpt:    { label: 'ChatGPT (OpenAI)',   emoji: '🟢', color: chalk.green,   envKey: 'OPENAI_API_KEY',     cfgKey: 'openaiApiKey'     },
  gemini:     { label: 'Gemini (Google)',    emoji: '✨', color: chalk.blue,    envKey: 'GEMINI_API_KEY',     cfgKey: 'geminiApiKey'     },
  perplexity: { label: 'Perplexity Sonar',  emoji: '🔍', color: chalk.cyan,    envKey: 'PERPLEXITY_API_KEY', cfgKey: 'perplexityApiKey' },
  grok:       { label: 'Grok (xAI)',        emoji: '⚡', color: chalk.white,   envKey: 'XAI_API_KEY',        cfgKey: 'xaiApiKey'        },
};
const ALL_PROVIDERS = ['claude', 'gemini']; //['claude', 'chatgpt', 'gemini', 'perplexity', 'grok'];

const hasApiKey = p => {
  const v = config[PROVIDERS[p]?.cfgKey];
  return !!(v && v.trim() && !v.includes('your_') && v.length > 10);
};
const hasTelegram = () =>
  !!(config.telegramBotToken && config.telegramChatId &&
     !config.telegramBotToken.includes('your_') && !config.telegramChatId.includes('your_'));
const hasDiscord  = () =>
  !!(config.discordWebhookUrl && !config.discordWebhookUrl.includes('your_'));

// ─────────────────────────────────────────────────────────────────────────────
// PARSE ARGS
// ─────────────────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const doAnalyze   = args.includes('--analyze');
const doTelegram  = args.includes('--telegram');
const doDiscord   = args.includes('--discord');
const doSendPrompt = args.includes('--send-prompt');  // kirim prompt ke Telegram
const printPrompt = args.includes('--print');
const saveFile    = !args.includes('--no-save');
const mode        = args.find(a => a.startsWith('--mode='))?.split('=')[1] || 'all';

const providerRaw = args.find(a => a.startsWith('--provider='))?.split('=')[1]
  ?? (() => { const i = args.indexOf('--provider'); return i >= 0 ? args[i + 1] : null; })()
  ?? 'claude';
const provider = (providerRaw === 'all' || ALL_PROVIDERS.includes(providerRaw))
  ? providerRaw : 'claude';
const providersToRun = provider === 'all' ? [...ALL_PROVIDERS] : [provider];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  // Header
  console.log(chalk.cyan('\n╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║      🚀 Crypto Dashboard — Hedge Fund Analyst         ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════════╝'));
  console.log(chalk.gray(`  Time     : ${new Date().toLocaleString('id-ID')}`));

  if (doAnalyze) {
    const labels = providersToRun.map(p => {
      const m = PROVIDERS[p];
      return hasApiKey(p) ? m.color(`${m.emoji} ${m.label}`) : chalk.gray(`${m.emoji} ${m.label} [no key]`);
    });
    console.log(`  Analyze  : ${labels.join(chalk.gray(' + '))}`);
  }

  const channels = [
    doTelegram   ? (hasTelegram() ? chalk.green('Telegram ✓') : chalk.red('Telegram ✗'))  : null,
    doDiscord    ? (hasDiscord()  ? chalk.green('Discord ✓')  : chalk.red('Discord ✗'))   : null,
    doSendPrompt ? (hasTelegram() ? chalk.green('Prompt→TG ✓') : chalk.red('Prompt→TG ✗')) : null,
  ].filter(Boolean);
  if (channels.length) console.log(`  Channels : ${channels.join(chalk.gray(' + '))}`);
  console.log();

  let daily = null, weekly = null, monthly = null, fed = null, war = null;

  try {
    // ── 1. FETCH ────────────────────────────────────────────────────────
    if (mode === 'all' || mode === 'daily') {
      daily   = await fetchAllDailyData(config);
      console.log(chalk.green('✓ Daily data'));
    }
    if (mode === 'all' || mode === 'weekly') {
      weekly  = await fetchAllWeeklyData(config);
      console.log(chalk.green('✓ Weekly data'));
    }
    if (mode === 'all' || mode === 'monthly') {
      monthly = await fetchAllMonthlyData(config);
      console.log(chalk.green('✓ Monthly data'));
    }
    if (mode === 'all' || mode === 'fed') {
      fed = await fetchAllFedLiquidity(config.fredApiKey);
      console.log(chalk.green('✓ Fed Liquidity'));
    }

    const allWarManual = ['warTimteng', 'warRusiaUkraine', 'warTaiwan']
      .every(k => manualOverrides[k] && manualOverrides[k] !== 'none');
    if (!allWarManual) {
      war = await fetchAllWarHeadlines();
      console.log(chalk.green('✓ War Headlines'));
    }

    // ── 2. GENERATE PROMPT ───────────────────────────────────────────────
    console.log(chalk.yellow(formatDataSummary(daily, weekly, monthly, fed)));
    const prompt = formatDashboardPrompt(daily, weekly, monthly, fed, manualOverrides, war);

    // ── 3. SAVE FILES ────────────────────────────────────────────────────
    const ts        = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputDir = join(ROOT, 'output');
    mkdirSync(outputDir, { recursive: true });

    if (saveFile) {
      writeFileSync(join(outputDir, 'latest_prompt.txt'), prompt, 'utf-8');
      writeFileSync(join(outputDir, `prompt_${ts}.txt`),  prompt, 'utf-8');
      writeFileSync(join(outputDir, 'latest_data.json'),
        JSON.stringify({ daily, weekly, monthly, fed, war }, null, 2), 'utf-8');
    }

    if (printPrompt) {
      console.log('\n' + chalk.bold('═══ PROMPT ═══\n'));
      console.log(chalk.gray(prompt));
      console.log(chalk.bold('═'.repeat(50) + '\n'));
    }

    // ── 4. KIRIM PROMPT KE TELEGRAM (--send-prompt) ──────────────────────
    if (doSendPrompt) {
      if (hasTelegram()) {
        console.log(chalk.cyan('\n📋 Mengirim prompt ke Telegram...'));
        await sendPromptToTelegram(prompt, {
          botToken: config.telegramBotToken,
          chatId:   config.telegramChatId,
          label:    'Prompt',
        });
        console.log(chalk.green('  ✓ Prompt terkirim ke Telegram'));
      } else {
        console.log(chalk.red('  ✗ --send-prompt: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diset'));
      }
    }

    // ── 5. FETCH-ONLY FLOW ────────────────────────────────────────────────
    if (!doAnalyze) {
      if (doTelegram || doDiscord) {
        console.log(chalk.cyan('\n📡 Mengirim data summary ke channel...'));
        await _sendDataToChannels({ daily, weekly, monthly, fed });
      } else if (!doSendPrompt) {
        _printHelp();
      }
      return;
    }

    // ── 6. KIRIM DATA SUMMARY DULU (sebelum analisis) ────────────────────
    if (doTelegram || doDiscord) {
      console.log(chalk.cyan('\n📡 Mengirim data summary ke channel...'));
      await _sendDataToChannels({ daily, weekly, monthly, fed });
    }

    // ── 7. ANALISIS PER PROVIDER ─────────────────────────────────────────
    for (const p of providersToRun) {
      const meta = PROVIDERS[p];

      if (!hasApiKey(p)) {
        console.log(chalk.yellow(`\n⚠️  Skip ${meta.label}: ${meta.envKey} belum diset di .env`));
        continue;
      }

      console.log('\n' + meta.color('═'.repeat(54)));
      console.log(meta.color(`  ${meta.emoji}  ${meta.label.toUpperCase()}`));
      console.log(meta.color('═'.repeat(54)));

      let analysisText = null;
      try {
        analysisText = await analyzeWith(p, prompt, config, {
          onChunk: text => process.stdout.write(chalk.white(text)),
        });

        if (saveFile && analysisText) {
          const fp = saveAnalysis(analysisText, outputDir, ts, p);
          writeFileSync(join(outputDir, 'latest_analysis.txt'), analysisText, 'utf-8');
          console.log(chalk.green(`\n  💾 Tersimpan: ${fp}`));
        }

        if (analysisText) {
          await _sendAnalysisToChannels(p, analysisText);
        }

      } catch (err) {
        console.error(chalk.red(`\n  ❌ ${meta.label} error: ${err.message}`));
        if (err.message?.includes('401')) {
          console.error(chalk.red(`     → ${meta.envKey} tidak valid`));
        }
      }
    }

    console.log(chalk.green(`\n✅ Selesai — output di: output/\n`));

  } catch (err) {
    console.error(chalk.red('\n❌ Fatal error:'), err.message);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: kirim data summary ke Telegram + Discord (independen)
// ─────────────────────────────────────────────────────────────────────────────
async function _sendDataToChannels({ daily, weekly, monthly, fed }) {
  if (doTelegram) {
    if (hasTelegram()) {
      const text = formatFetchSummaryForTelegram(daily, weekly, monthly, fed);
      await sendToTelegram(text, {
        botToken: config.telegramBotToken,
        chatId:   config.telegramChatId,
        label:    'Data Summary',
      });
      console.log(chalk.green('  ✓ Data summary → Telegram'));
    } else {
      console.log(chalk.red('  ✗ Telegram: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diset'));
    }
  }
  if (doDiscord) {
    if (hasDiscord()) {
      await sendDataSummaryToDiscord(config.discordWebhookUrl, daily, weekly, monthly, fed);
      console.log(chalk.green('  ✓ Data summary → Discord'));
    } else {
      console.log(chalk.red('  ✗ Discord: DISCORD_WEBHOOK_URL belum diset'));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: kirim analisis ke Telegram + Discord (independen)
// ─────────────────────────────────────────────────────────────────────────────
async function _sendAnalysisToChannels(provider, analysisText) {
  if (doTelegram) {
    if (hasTelegram()) {
      const formatted = formatAnalysisHeaderTelegram(provider, analysisText);
      await sendToTelegram(formatted, {
        botToken: config.telegramBotToken,
        chatId:   config.telegramChatId,
        label:    `${PROVIDERS[provider].label} analysis`,
      });
      console.log(chalk.green(`  📱 ${PROVIDERS[provider].label} → Telegram ✓`));
    } else {
      console.log(chalk.red(`  ✗ Telegram tidak terkonfigurasi`));
    }
  }
  if (doDiscord) {
    if (hasDiscord()) {
      await sendAnalysisToDiscord(config.discordWebhookUrl, provider, analysisText);
      console.log(chalk.green(`  🎮 ${PROVIDERS[provider].label} → Discord ✓`));
    } else {
      console.log(chalk.red(`  ✗ Discord tidak terkonfigurasi`));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: print help menu
// ─────────────────────────────────────────────────────────────────────────────
function _printHelp() {
  const tgStatus = hasTelegram() ? chalk.green('✓ configured') : chalk.red('✗ not set');
  const dcStatus = hasDiscord()  ? chalk.green('✓ configured') : chalk.red('✗ not set');

  console.log(chalk.cyan('\n─── Commands tersedia ───────────────────────────────────'));

  console.log(chalk.bold('\n  📊 Fetch data:'));
  console.log(chalk.gray('  npm run fetch                  fetch semua data'));
  console.log(chalk.gray('  npm run fetch:telegram         fetch + data summary → Telegram'));
  console.log(chalk.gray('  npm run fetch:discord          fetch + data summary → Discord'));
  console.log(chalk.gray('  npm run fetch:all-channels     fetch + data summary → Telegram + Discord'));

  console.log(chalk.bold('\n  🤖 Analisis AI:'));
  ALL_PROVIDERS.forEach(p => {
    const m = PROVIDERS[p];
    const k = hasApiKey(p) ? chalk.green('✓') : chalk.red('✗ no key');
    console.log(`  ${m.color(`npm run analyze:${p.padEnd(12)}`)} ${m.emoji} ${m.label} [${k}]`);
  });
  console.log(chalk.gray('  npm run analyze:all            semua AI yang ada key-nya'));

  console.log(chalk.bold(`\n  📱 + Telegram [${tgStatus}]:`));
  ALL_PROVIDERS.forEach(p => console.log(chalk.gray(`  npm run analyze:${p}:telegram`)));
  console.log(chalk.gray('  npm run analyze:all:telegram'));

  console.log(chalk.bold(`\n  🎮 + Discord [${dcStatus}]:`));
  ALL_PROVIDERS.forEach(p => console.log(chalk.gray(`  npm run analyze:${p}:discord`)));
  console.log(chalk.gray('  npm run analyze:all:discord'));

  console.log(chalk.bold('\n  📡 + Telegram + Discord:'));
  ALL_PROVIDERS.forEach(p => console.log(chalk.gray(`  npm run analyze:${p}:all-channels`)));
  console.log(chalk.gray('  npm run analyze:all:all-channels'));

  console.log(chalk.bold('\n  ⚙️  Flags tambahan:'));
  console.log(chalk.gray('  --send-prompt      kirim prompt ke Telegram sebelum analisis'));
  console.log(chalk.gray('  --print            print prompt ke terminal'));
  console.log(chalk.gray('  --no-save          jangan simpan output files'));
  console.log(chalk.gray('  --mode=daily|weekly|monthly|fed'));
  console.log(chalk.gray('  --provider=<n>  pilih AI'));
  console.log(chalk.gray('  --telegram         kirim ke Telegram'));
  console.log(chalk.gray('  --discord          kirim ke Discord'));

  console.log(chalk.bold('\n  📁 Output:'));
  console.log(chalk.gray('  output/latest_prompt.txt'));
  console.log(chalk.gray('  output/latest_analysis.txt'));
  console.log(chalk.gray('  output/latest_analysis_{provider}.txt'));
  console.log(chalk.gray('  output/latest_data.json\n'));
}

main();
