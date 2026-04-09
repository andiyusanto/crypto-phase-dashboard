// ============================================
// PMI FETCHER
// Layer 1: Google News RSS — parses ISM PMI values from press-release headlines
// Layer 2: SQLite cache — last known good values
// ============================================

import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { savePMI, getLatestPMI } from '../db.js';

const MONTHS = {
  january:'01', february:'02', march:'03', april:'04',
  may:'05', june:'06', july:'07', august:'08',
  september:'09', october:'10', november:'11', december:'12',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function fetchRSS(url) {
  const res = await axios.get(url, {
    timeout: 12000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
  });
  const parsed = await parseStringPromise(res.data, { explicitArray: false });
  return parsed?.rss?.channel?.item || [];
}

function extractReportMonth(title, pubDate) {
  // Prefer explicit month from headline: "March 2026 ISM..."
  const m = title.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i);
  if (m) return `${m[2]}-${MONTHS[m[1].toLowerCase()]}`;
  // Fallback: reports are published the month after the survey period
  const d = new Date(pubDate);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function extractPMIValue(items, isManufacturing) {
  const arr = Array.isArray(items) ? items : [items];
  const typeKw    = isManufacturing ? /manufactur/i : /services|non.manufactur/i;
  const excludeKw = isManufacturing ? /\bservices\b/i : /\bmanufactur/i;

  const patterns = [
    /PMI[®\s]{0,5}(?:at|of)\s+(\d{2,3}(?:\.\d)?)\s*%/i,
    /(\d{2,3}(?:\.\d)?)\s*%[,;]?\s*(?:march|april|may|june|july|aug|sep|oct|nov|dec|jan|feb)/i,
    /PMI[^.]{0,50}?comes?\s+in\s+at\s+(\d{2,3}(?:\.\d)?)/i,
    /PMI[^.]{0,30}?at\s+(\d{2,3}(?:\.\d)?)/i,
    /(\d{2,3}\.\d)\s*[,%]/i,
  ];

  for (const item of arr) {
    const title = item.title?.replace(/<[^>]*>/g, '').trim() || '';
    if (!typeKw.test(title))    continue;
    if (excludeKw.test(title))  continue;

    for (const p of patterns) {
      const m = title.match(p);
      if (m) {
        const val = parseFloat(m[1]);
        if (val >= 40 && val <= 70) {
          return {
            value: val,
            releasedMonth: extractReportMonth(title, item.pubDate),
            sourceTitle: title,
          };
        }
      }
    }
  }
  return null;
}

// ── Layer 1: Google News RSS ──────────────────────────────────────────────────
async function fetchPMIFromGoogleNews() {
  const [mfgItems, svcItems] = await Promise.all([
    fetchRSS('https://news.google.com/rss/search?q=ISM+Manufacturing+PMI+report&ceid=US:en&hl=en-US&gl=US'),
    fetchRSS('https://news.google.com/rss/search?q=ISM+Services+Non-Manufacturing+PMI+report&ceid=US:en&hl=en-US&gl=US'),
  ]);

  const mfg = extractPMIValue(mfgItems, true);
  const svc = extractPMIValue(svcItems, false);

  if (!mfg && !svc) throw new Error('No PMI values found in Google News headlines');

  // Use the most recent releasedMonth across both
  const releasedMonth = mfg?.releasedMonth || svc?.releasedMonth;

  return {
    manufacturing: mfg ? { value: mfg.value, label: 'ISM Manufacturing PMI' } : null,
    services:      svc ? { value: svc.value, label: 'ISM Services PMI'       } : null,
    releasedMonth,
    fetchedAt: new Date().toISOString(),
    source: 'Google News RSS (ISM Press Release)',
  };
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function fetchRealtimePMI() {
  console.log('🏭 Fetching ISM PMI via Google News RSS...');

  // Layer 1: Google News RSS
  try {
    const data = await fetchPMIFromGoogleNews();
    if (data.manufacturing) console.log(`  ✓ Mfg PMI  : ${data.manufacturing.value} (${data.releasedMonth})`);
    if (data.services)      console.log(`  ✓ Svc PMI  : ${data.services.value} (${data.releasedMonth})`);
    savePMI(data);
    return data;
  } catch (e) {
    console.warn(`  ⚠️  Google News PMI failed: ${e.message}`);
  }

  // Layer 2: SQLite cache
  console.warn('  ↩ Falling back to SQLite cache...');
  const cached = getLatestPMI();
  if (cached) {
    console.log(`  ✅ PMI loaded from cache (${cached.releasedMonth ?? cached.fetchedAt?.slice(0, 7)})`);
    return cached;
  }

  console.error('  ❌ No PMI data available from any source');
  return null;
}
