// ============================================
// SCHEDULER v2.2
// Jalankan: node src/scheduler.js
//
// JADWAL ANALISIS (Gemini + Mode All + Prompt + Telegram + Discord):
//   06:00 WIB  → Tokyo open   (08:00 JST)
//   15:00 WIB  → London open  (08:00 GMT)
//   19:00 WIB  → New York open (08:00 EDT)
//
// JADWAL FETCH DATA (Stand-alone):
//   07:00 WIB  → daily fetch (setiap hari)
//   07:05 WIB  → weekly fetch (Senin)
//   07:10 WIB  → monthly fetch (tgl 1)
//   08:00 WIB  → Fed liquidity (Kamis & Jumat)
// ============================================

import 'dotenv/config';
import cron  from 'node-cron';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ── Jalankan perintah sebagai child process ───────────────────────────────────
function run(label, args) {
  const ts = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  console.log(chalk.cyan(`\n${'─'.repeat(56)}`));
  console.log(chalk.cyan(`[${ts}] ▶  ${label}`));
  console.log(chalk.gray(`   $ node src/index.js ${args.join(' ')}`));
  console.log(chalk.cyan(`${'─'.repeat(56)}`));

  const child = spawn('node', ['src/index.js', ...args], {
    cwd:   ROOT,
    stdio: 'inherit',
    env:   process.env,
  });

  child.on('error', err =>
    console.error(chalk.red(`[${label}] spawn error: ${err.message}`))
  );

  child.on('close', code => {
    const tsEnd = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    if (code === 0) {
      console.log(chalk.green(`[${tsEnd}] ✓ ${label} selesai`));
    } else {
      console.error(chalk.red(`[${tsEnd}] ✗ ${label} exit code ${code}`));
    }
  });
}

// ── Startup banner ────────────────────────────────────────────────────────────
function printBanner() {
  const now = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  console.log(chalk.cyan('\n╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║      🕐  Crypto Dashboard Scheduler v2.2              ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════════╝'));
  console.log(chalk.gray(`  Dimulai : ${now}`));
  console.log();
  console.log(chalk.bold('  📊 FETCH DATA (Stand-alone):'));
  console.log(chalk.gray('  07:00 WIB  Daily fetch          (setiap hari)'));
  console.log(chalk.gray('  07:05 WIB  Weekly fetch         (Senin saja)'));
  console.log(chalk.gray('  07:10 WIB  Monthly fetch        (tanggal 1 saja)'));
  console.log(chalk.gray('  08:00 WIB  Fed Liquidity fetch  (Kamis & Jumat saja)'));
  console.log();
  console.log(chalk.bold('  🤖 ANALISIS GEMINI | CLAUDE FULL (MODE ALL) + PROMPT + TG + DC:'));
  console.log(
    chalk.blue('  06:00 WIB') + chalk.gray('  Tokyo Open   ') +
    chalk.white('08:00 JST') + chalk.gray(' | 01:00 UTC')
  );
  console.log(
    chalk.yellow('  15:00 WIB') + chalk.gray('  London Open  ') +
    chalk.white('08:00 GMT') + chalk.gray(' | 08:00 UTC')
  );
  console.log(
    chalk.red('  19:00 WIB') + chalk.gray('  New York Open ') +
    chalk.white('08:00 EDT') + chalk.gray(' | 12:00 UTC')
  );
  console.log();
  console.log(chalk.gray('  ♥  Heartbeat log setiap jam'));
  console.log(chalk.gray('  Ctrl+C untuk stop'));
  console.log(chalk.cyan('  ' + '─'.repeat(54) + '\n'));
}

printBanner();

// ─────────────────────────────────────────────────────────────────────────────
// FETCH SCHEDULES (WIB = UTC+7)
// cron format: detik(opsional) menit jam hari-bulan bulan hari-minggu
// ─────────────────────────────────────────────────────────────────────────────

// // Daily — 07:00 WIB
// cron.schedule('0 7 * * *', () => {
//   run('Daily fetch', ['--mode', 'daily']);
// }, { timezone: 'Asia/Jakarta' });

// // Weekly — 07:05 WIB setiap Senin
// cron.schedule('5 7 * * 1', () => {
//   run('Weekly fetch (Senin)', ['--mode', 'weekly']);
// }, { timezone: 'Asia/Jakarta' });

// // Monthly — 07:10 WIB tanggal 1
// cron.schedule('10 7 1 * *', () => {
//   run('Monthly fetch (tgl 1)', ['--mode', 'monthly']);
// }, { timezone: 'Asia/Jakarta' });

// // Fed Liquidity — 08:00 WIB Kamis(4) dan Jumat(5)
// cron.schedule('0 8 * * 4,5', () => {
//   run('Fed Liquidity fetch', ['--mode', 'fed']);
// }, { timezone: 'Asia/Jakarta' });

// ─────────────────────────────────────────────────────────────────────────────
// ANALISIS GEMINI + TELEGRAM + DISCORD + PROMPT (MODE=ALL)
//
// Semua menggunakan: node src/index.js --mode=all --analyze --provider gemini --send-prompt --telegram --discord
// ─────────────────────────────────────────────────────────────────────────────

// ── 06:00 WIB — TOKYO OPEN (08:00 JST) ──────────────────────────────────────
cron.schedule('0 6 * * *', () => {
  run('Gemini Full (Mode All) + Prompt + TG + DC — Tokyo Open 🇯🇵', [
    '--mode=all', '--analyze', '--provider', 'all', '--send-prompt', '--telegram', '--discord',
  ]);
}, { timezone: 'Asia/Jakarta' });

// ── 15:00 WIB — LONDON OPEN (08:00 GMT) ─────────────────────────────────────
cron.schedule('0 15 * * *', () => {
  run('Gemini Full (Mode All) + Prompt + TG + DC — London Open 🇬🇧', [
    '--mode=all', '--analyze', '--provider', 'all', '--send-prompt', '--telegram', '--discord',
  ]);
}, { timezone: 'Asia/Jakarta' });

// ── 19:00 WIB — NEW YORK OPEN (08:00 EDT) ───────────────────────────────────
cron.schedule('0 19 * * *', () => {
  run('Gemini Full (Mode All) + Prompt + TG + DC — NY Open 🇺🇸', [
    '--mode=all', '--analyze', '--provider', 'all', '--send-prompt', '--telegram', '--discord',
  ]);
}, { timezone: 'Asia/Jakarta' });

// ─────────────────────────────────────────────────────────────────────────────
// HEARTBEAT — setiap jam untuk konfirmasi scheduler masih hidup
// ─────────────────────────────────────────────────────────────────────────────
cron.schedule('0 * * * *', () => {
  const ts = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit', minute: '2-digit',
  });
  process.stdout.write(chalk.gray(`  ♥  ${ts} WIB — scheduler aktif\n`));
}, { timezone: 'Asia/Jakarta' });

// ─────────────────────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────────────────────────────────────
process.on('SIGINT',  () => { console.log(chalk.yellow('\n\n👋 Scheduler dihentikan.\n')); process.exit(0); });
process.on('SIGTERM', () => { console.log(chalk.yellow('\n👋 Scheduler terminated.')); process.exit(0); });
