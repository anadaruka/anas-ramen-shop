// ============================================================
// Order generation — The Pyramid (spec §4.4 + v3.1 addendum)
// Pure logic, no DOM. Takes the current game state, returns orders.
// ============================================================

import { DIALS, ING, TIER_MEMBERS } from './dials.js';

function weightedPick(pairs) {
  // pairs: [ [value, weight], ... ]
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) {
    r -= w;
    if (r <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
}

export function unlockedIngredients(state) {
  return DIALS.ingredients.filter(i => {
    const u = DIALS.unlocks[i.id] || {};
    if (u.start) return true;
    if (u.bowls != null && state.bowlsServed >= u.bowls) return true;
    if (u.cumGold != null && state.cumGoldEarned >= u.cumGold) return true;
    return false;
  }).map(i => i.id);
}

// Tier weights renormalized over tiers that have ≥1 unlocked ingredient.
function activeTierWeights(state, unlocked) {
  const base = state.festival ? DIALS.festivalTierWeights : DIALS.tierWeights;
  const pairs = [];
  for (const [tier, w] of Object.entries(base)) {
    const members = (TIER_MEMBERS[tier] || []).filter(id => unlocked.includes(id));
    if (members.length > 0) pairs.push([tier, w]);
  }
  return pairs;
}

// Roll one order: pick a topping count, then roll each slot independently
// (duplicates allowed, uniform within tier).
export function rollOrder(state) {
  const unlocked = unlockedIngredients(state);
  const tierPairs = activeTierWeights(state, unlocked);
  if (tierPairs.length === 0) return []; // nothing unlocked → plain bowl

  const count = weightedPick(DIALS.countWeights.map((w, i) => [i + 1, w]));
  const order = [];
  for (let s = 0; s < count; s++) {
    const tier = weightedPick(tierPairs);
    const members = TIER_MEMBERS[tier].filter(id => unlocked.includes(id));
    order.push(members[Math.floor(Math.random() * members.length)]);
  }
  return order.sort();
}

// Shoots the player would still need to buy to cover this order,
// given pantry stock already committed to earlier queue tickets.
function shootsNeeded(order, pantryLeft) {
  let need = 0;
  for (const id of order) {
    if (pantryLeft[id] > 0) pantryLeft[id] -= 1;
    else need += ING[id].shoots;
  }
  return need;
}

// An order is serveable if pantry stock (allocated greedily across the
// queue) plus affordable shoot purchases can cover it.
export function isServeable(order, state, pantryLeft) {
  const budget = state.shoots + state.inbox;
  return shootsNeeded(order, pantryLeft) <= budget;
}

// Mercy rule (spec §4.4, generalized): when a new ticket would leave the
// queue with < mercyServeableShare serveable tickets, force the new ticket
// to be serveable — degrade toward a plain bowl if necessary.
export function generateTicketOrder(state) {
  let order = rollOrder(state);

  const pantryLeft = { ...state.pantry };
  let serveable = 0;
  for (const c of state.queue) {
    if (isServeable(c.order, state, pantryLeft)) serveable++;
  }
  const newServeable = isServeable(order, state, { ...pantryLeft });
  const total = state.queue.length + 1;
  const share = (serveable + (newServeable ? 1 : 0)) / total;

  if (!newServeable && share < DIALS.mercyServeableShare) {
    // Drop the most expensive toppings until the order fits; ends at plain.
    order = [...order].sort((a, b) => ING[b].shoots - ING[a].shoots);
    while (order.length > 0 && !isServeable(order, state, { ...pantryLeft })) {
      order.shift();
    }
    order.sort();
    state.stats.mercy += 1;
    return { order, mercy: true };
  }
  return { order, mercy: false };
}

// Multiset equality between a bowl's contents and a ticket.
export function bowlMatches(bowlToppings, order) {
  if (bowlToppings.length !== order.length) return false;
  const a = [...bowlToppings].sort();
  const b = [...order].sort();
  return a.every((v, i) => v === b[i]);
}

// Price of a bowl before streak/festival multipliers.
export function rawPrice(toppings) {
  return DIALS.basePriceGold + toppings.reduce((s, id) => s + ING[id].gold, 0);
}

export function shootValue(toppings) {
  return toppings.reduce((s, id) => s + ING[id].shoots, 0);
}
