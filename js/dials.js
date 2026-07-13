// ============================================================
// Ana's Ramen Shop — LiveOps Dials
// The "remote config skeleton" (spec §15.2): every balance value
// lives here, nothing is hardcoded in game logic.
// Values come from Final Spec v3 unless marked DESIGNER
// (chosen during the Phase 1 build and documented in the spec addendum).
// ============================================================

export const DIALS = {
  // --- Shoot economy ---
  // PLAYTEST RETUNE 2026-07-13 (Ana): the spec §5.2 values walled the player
  // in minutes. New target: shoots run out after ~30 min of active serving,
  // and the first 10 minutes flow completely free. Pressure comes from the
  // queue, not the wallet. Supersedes spec §5.2 / §17 for the prototype.
  regenIntervalMin: 4,          // 1 shoot per N minutes (was 8)
  walletCap: 60,                // was 20
  startingShoots: 40,           // fresh-game grant (was 10)

  patchSun: {                   // Active Sunlight Patch (retuned)
    plant: 2, harvest: 6,       // was 2 → 4
    growSec: 120, cooldownSec: 30,  // was 180 / 60
    dailyCap: 12,               // was 8
    tutorialGrowSec: 5,         // spec §11 Beat 1
  },
  patchReturn: {                // 4-hour Return Patch (unchanged)
    plant: 3, harvest: 10,
    growSec: 4 * 3600,
  },

  tipRate: 0.12,                // shoot-tip chance per served bowl (was 0.08)

  // --- Core loop (spec §4) ---
  stations: 2,                  // starting loadout
  baseCookSec: 15,              // burner level 1
  tutorialCookSec: 5,           // spec §11 Beat 2
  arrivalSec: 14,               // 1 customer per N s (was 20 — busier counter)
  queueCap: 5,
  patienceSec: 90,
  streakStepPct: 2,
  streakCapPct: 30,
  maxToppingsPerBowl: 4,        // DESIGNER: physical bowl capacity (orders max 3)

  // --- Day-Old Shelf (spec §4.5) ---
  shelfSlots: 2,
  shelfWindowSec: 90,
  luckyMatchBonus: 0.10,        // full price +10%
  shelfSalePct: 0.50,           // day-old discount sale

  // --- Menu & prices (spec §5.1, gold retuned per v3.1 addendum) ---
  basePriceGold: 10,            // base bowl: noodles + broth, 0 shoots
  ingredients: [
    { id: 'scallion', name: 'Scallions',  shoots: 1, gold: 3,  tier: 'common' },
    { id: 'egg',      name: 'Boiled Egg', shoots: 1, gold: 4,  tier: 'common' },
    { id: 'chashu',   name: 'Chashu',     shoots: 2, gold: 7,  tier: 'mid'    },
    { id: 'shrimp',   name: 'Shrimp',     shoots: 3, gold: 10, tier: 'rare'   },
    { id: 'tuna',     name: 'Tuna',       shoots: 4, gold: 13, tier: 'rare'   },
  ],
  pantryCap: 8,                 // units per ingredient

  // --- Order-mix weights: The Pyramid (v3.1 addendum) ---
  // Per-slot tier weights; each slot rolls independently, duplicates allowed,
  // 50/50 within a tier, weights renormalize over unlocked ingredients only.
  tierWeights:         { common: 0.70, mid: 0.25, rare: 0.05 },
  festivalTierWeights: { common: 0.20, mid: 0.30, rare: 0.50 },
  festivalPayMult: 1.5,         // Midnight Festival pays 1.5× (spec §8.3)
  // Toppings-per-order distribution (1 / 2 / 3) → avg 1.95 slots
  countWeights: [0.30, 0.45, 0.25],

  // Mercy rule (spec §4.4, generalized per v3.1 addendum):
  // ≥ this share of the queue must be serveable with current wallet + pantry.
  mercyServeableShare: 0.40,

  // --- Ingredient unlocks (DESIGNER: spec gap, documented in addendum) ---
  // Scallions from the start; egg by bowls served; rest by cumulative gold earned.
  unlocks: {
    scallion: { start: true },
    egg:      { bowls: 3 },
    chashu:   { cumGold: 200 },
    shrimp:   { cumGold: 600 },
    tuna:     { cumGold: 1200 },
  },

  // --- Premium currency (spec §5.4; no IAP in prototype) ---
  mn: {
    startingBalance: 5,         // DESIGNER: grant so pinch tools are testable
    refillShoots: 12, refillCost: 3,
    instantFinishCost: 1,
    skipPatchCost: 1,
  },

  // --- Session interruption (spec §15.3) ---
  interruptionGraceSec: 30 * 60,
};

// Convenience lookups
export const ING = Object.fromEntries(DIALS.ingredients.map(i => [i.id, i]));
export const TIER_MEMBERS = DIALS.ingredients.reduce((m, i) => {
  (m[i.tier] = m[i.tier] || []).push(i.id);
  return m;
}, {});
