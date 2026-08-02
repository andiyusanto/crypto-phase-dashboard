// ============================================
// PROVIDER LAYER — top-level orchestrator
//
// Combines all 5 providers (Macro, Crypto, Derivatives, On-chain, Geopolitical)
// per Step 4's domain model / Step 6's refactor plan.
//
// Additive only: nothing here is wired into src/index.js, formatter.js, or the
// senders yet. This is a new, parallel entry point — the live scheduler.js/
// index.js pipeline is untouched and keeps working exactly as before.
// ============================================

import { fetchMacroSnapshot } from './macro/index.js';
import { fetchCryptoSnapshot } from './crypto/index.js';
import { fetchDerivativesSnapshot } from './derivatives/index.js';
import { fetchOnChainSnapshot } from './onchain/index.js';
import { fetchGeopoliticalRisks } from './geopolitical/index.js';

export async function fetchAllProviders(config = {}, geoOverrides = {}) {
  // Crypto runs first — its BTC spot price is needed by Derivatives (CME premium)
  // and On-chain (NVT ratio USD conversion). Macro and Geopolitical have no such
  // dependency and run fully in parallel with everything else.
  const [crypto, macro, geopolitical] = await Promise.all([
    fetchCryptoSnapshot(config),
    fetchMacroSnapshot(config),
    fetchGeopoliticalRisks(geoOverrides),
  ]);

  const btcPriceIndicator = crypto.indicators.find(i => i.name === 'BTC Price');
  const btcPrice = btcPriceIndicator?.rawValue ?? null;

  const [derivatives, onchain] = await Promise.all([
    fetchDerivativesSnapshot(btcPrice),
    fetchOnChainSnapshot(btcPrice),
  ]);

  return {
    macro,
    crypto,
    derivatives: { category: 'derivatives', ...derivatives, fetchedAt: new Date().toISOString() },
    onchain: { category: 'onchain', ...onchain, fetchedAt: new Date().toISOString() },
    geopolitical,
    fetchedAt: new Date().toISOString(),
  };
}
