// ============================================
// PMI SCRAPER (Real-time Layer 1)
// Source: https://www.ismworld.org/
// ============================================

import axios from 'axios';
import { savePMI, getLatestPMI } from '../db.js';

const BASE_URL = 'https://www.ismworld.org';
const REPORTS_PAGE = 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Scrape the latest PMI reports from ISM website
 */
export async function fetchRealtimePMI() {
  console.log('🏭 Scraping ISM PMI reports...');
  
  try {
    const res = await axios.get(REPORTS_PAGE, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });

    const html = res.data;

    // Find latest Manufacturing report link
    const mfgRegex = /href="([^"]+manufacturing-ism-report-on-business\/)"/i;
    const mfgMatch = html.match(mfgRegex);
    
    // Find latest Services report link
    const svcRegex = /href="([^"]+services-ism-report-on-business\/)"/i;
    const svcMatch = html.match(svcRegex);

    const mfgUrl = mfgMatch ? (mfgMatch[1].startsWith('http') ? mfgMatch[1] : BASE_URL + mfgMatch[1]) : null;
    const svcUrl = svcMatch ? (svcMatch[1].startsWith('http') ? svcMatch[1] : BASE_URL + svcMatch[1]) : null;

    if (!mfgUrl && !svcUrl) {
      throw new Error('Could not find latest PMI report links on ISM page');
    }

    const results = {
      manufacturing: null,
      services: null,
      fetchedAt: new Date().toISOString(),
      source: 'ISM World (Scraped)'
    };

    // Fetch and parse Manufacturing
    if (mfgUrl) {
      const mfgRes = await axios.get(mfgUrl, { headers: { 'User-Agent': USER_AGENT } });
      const valMatch = mfgRes.data.match(/([0-9]+\.[0-9])%/);
      if (valMatch) {
        results.manufacturing = {
          value: parseFloat(valMatch[1]),
          url: mfgUrl,
          label: 'Manufacturing PMI'
        };
      }
    }

    // Fetch and parse Services
    if (svcUrl) {
      const svcRes = await axios.get(svcUrl, { headers: { 'User-Agent': USER_AGENT } });
      const valMatch = svcRes.data.match(/([0-9]+\.[0-9])%/);
      if (valMatch) {
        results.services = {
          value: parseFloat(valMatch[1]),
          url: svcUrl,
          label: 'Services PMI'
        };
      }
    }

    // SAVE TO DATABASE if we have data
    if (results.manufacturing || results.services) {
      savePMI(results);
      return results;
    }

    throw new Error('Scraped data was empty');

  } catch (err) {
    console.warn(`⚠️  PMI Scraping failed: ${err.message}. Mencoba data dari database...`);
    const fallback = getLatestPMI();
    if (fallback) {
      console.log('✅ Berhasil mengambil PMI terakhir dari database SQLite.');
      return fallback;
    }
    console.error('❌ Database juga kosong. Tidak ada data PMI.');
    return null;
  }
}
