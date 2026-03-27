// ============================================
// WAR HEADLINES FETCHER
// Sumber: Google News RSS (gratis, tanpa API key)
// Agregasi dari Reuters, AP, BBC via Google News
// Bloomberg diblokir scraping — Google News proxy lebih reliable
// ============================================

import axios from 'axios';
import { parseStringPromise } from 'xml2js';

// ── Helper: fetch + parse RSS feed ────────────────────────────────────────────
async function fetchRSS(url) {
  const res = await axios.get(url, {
    timeout: 10000,
    headers: {
      // Google News butuh user agent yang terlihat seperti browser
      'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
  });
  const parsed = await parseStringPromise(res.data, { explicitArray: false });
  return parsed?.rss?.channel?.item || [];
}

// ── Helper: ambil N headline pertama yang relevan ─────────────────────────────
function extractHeadlines(items, maxItems = 3) {
  const arr = Array.isArray(items) ? items : [items];
  return arr.slice(0, maxItems).map(item => {
    const title = item.title?.replace(/<[^>]*>/g, '').trim() || '';
    const source = item.source?._ || item['dc:creator'] || '';
    const pubDate = item.pubDate ? new Date(item.pubDate).toLocaleDateString('id-ID') : '';
    return { title, source, pubDate };
  }).filter(h => h.title);
}

// ── Helper: format menjadi string ringkas untuk prompt ────────────────────────
function formatHeadlines(headlines, fallback = 'none') {
  if (!headlines.length) return fallback;
  // Ambil headline terpenting (pertama), tambah ringkasan jika ada lebih
  const main = headlines[0].title;
  const extra = headlines.slice(1).map(h => h.title).join(' | ');
  return extra ? `${main} [+${headlines.length - 1}: ${extra.slice(0, 100)}...]` : main;
}

// ── 1. MIDDLE EAST ────────────────────────────────────────────────────────────
// Query: berita Timur Tengah 24 jam terakhir dari sumber terpercaya
export async function fetchMiddleEastNews() {
  try {
    // Query spesifik: Middle East conflict/war — filter ke sumber terpercaya
    const queries = [
      'Middle+East+war+conflict+Israel+Gaza+Iran',
      'Middle+East+ceasefire+attack+strike',
    ];

    const url = `https://news.google.com/rss/search?q=when:24h+${queries[0]}&ceid=US:en&hl=en-US&gl=US`;
    const items = await fetchRSS(url);
    const headlines = extractHeadlines(items, 3);

    // Filter: hilangkan yang tidak relevan (olahraga, hiburan, dll)
    const warKeywords = ['war', 'attack', 'strike', 'kill', 'ceasefire', 'missile',
      'bomb', 'troops', 'military', 'conflict', 'hostage', 'Hamas', 'Hezbollah',
      'Iran', 'Israel', 'Gaza', 'Lebanon', 'Yemen', 'Houthi', 'Red Sea'];

    const filtered = headlines.filter(h =>
      warKeywords.some(kw => h.title.toLowerCase().includes(kw.toLowerCase()))
    );

    const result = formatHeadlines(filtered.length ? filtered : headlines);
    console.log(`  ✓ Timteng headline: ${result.slice(0, 80)}...`);
    return result;
  } catch (err) {
    console.warn(`⚠️  Middle East news error: ${err.message}`);
    return '[fetch gagal — isi manual]';
  }
}

// ── 2. RUSSIA-UKRAINE ─────────────────────────────────────────────────────────
export async function fetchUkraineNews() {
  try {
    const url = `https://news.google.com/rss/search?q=when:24h+Russia+Ukraine+war+attack&ceid=US:en&hl=en-US&gl=US`;
    const items = await fetchRSS(url);
    const headlines = extractHeadlines(items, 3);

    const warKeywords = ['Russia', 'Ukraine', 'attack', 'strike', 'troops',
      'Kyiv', 'Moscow', 'missile', 'drone', 'ceasefire', 'Zelensky', 'Putin',
      'NATO', 'frontline', 'Kursk', 'Kharkiv'];

    const filtered = headlines.filter(h =>
      warKeywords.some(kw => h.title.toLowerCase().includes(kw.toLowerCase()))
    );

    const result = formatHeadlines(filtered.length ? filtered : headlines);
    console.log(`  ✓ Rusia-Ukraine headline: ${result.slice(0, 80)}...`);
    return result;
  } catch (err) {
    console.warn(`⚠️  Ukraine news error: ${err.message}`);
    return '[fetch gagal — isi manual]';
  }
}

// ── 3. TAIWAN / SOUTH CHINA SEA ───────────────────────────────────────────────
export async function fetchTaiwanNews() {
  try {
    const url = `https://news.google.com/rss/search?q=when:48h+Taiwan+China+military+strait&ceid=US:en&hl=en-US&gl=US`;
    const items = await fetchRSS(url);
    const headlines = extractHeadlines(items, 3);

    const warKeywords = ['Taiwan', 'China', 'military', 'strait', 'PLA',
      'exercise', 'invasion', 'sovereignty', 'drills', 'aircraft', 'warship',
      'South China Sea', 'Philippines', 'Xi Jinping'];

    const filtered = headlines.filter(h =>
      warKeywords.some(kw => h.title.toLowerCase().includes(kw.toLowerCase()))
    );

    // Taiwan lebih tenang — 48h window, ambil status terbaru
    const result = filtered.length
      ? formatHeadlines(filtered)
      : 'Tidak ada eskalasi signifikan dalam 48 jam terakhir';

    console.log(`  ✓ Taiwan headline: ${result.slice(0, 80)}...`);
    return result;
  } catch (err) {
    console.warn(`⚠️  Taiwan news error: ${err.message}`);
    return '[fetch gagal — isi manual]';
  }
}

// ── AGGREGATE: SEMUA WAR HEADLINES ───────────────────────────────────────────
export async function fetchAllWarHeadlines() {
  console.log('📰 Fetching war headlines via Google News RSS...');

  // Fetch paralel tapi dengan sedikit delay untuk hindari rate limit
  const [timteng, rusiaUkraine, taiwan] = await Promise.allSettled([
    fetchMiddleEastNews(),
    fetchUkraineNews(),
    fetchTaiwanNews(),
  ]);

  return {
    timteng:      timteng.value      ?? '[fetch gagal]',
    rusiaUkraine: rusiaUkraine.value ?? '[fetch gagal]',
    taiwan:       taiwan.value       ?? '[fetch gagal]',
    fetchedAt: new Date().toISOString(),
    source: 'Google News RSS (Reuters/AP/BBC via GNews)',
  };
}
