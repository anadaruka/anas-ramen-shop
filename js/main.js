// ============================================================
// Ana's Ramen Shop — Phase 1 prototype
// Core loop (spec §4) + shoot economy (§5) + the pinch (§5.3–5.4).
// ============================================================

import { DIALS, ING } from './dials.js';
import {
  generateTicketOrder, bowlMatches, rawPrice, shootValue, unlockedIngredients,
} from './orders.js';
import {
  toppingSVG, bowlSVG, avatarSVG, patchSVG, lanternSVG, fortuneIcon, shootIcon, coinIcon, hashSeed,
} from './art.js';
import { caChing, dropTick, unlockAudio, setMuted, isMuted } from './sound.js';

// v2: economy retune 2026-07-13 — old saves start fresh under the new rules
const SAVE_KEY = 'anas-ramen-save-v2';
const $ = sel => document.querySelector(sel);
const now = () => Date.now();

const NAMES = [
  // Japan
  'Kenji', 'Mei', 'Aiko', 'Haruto', 'Yuna', 'Ren', 'Hana', 'Emi',
  // North America
  'Marcus', 'Tessa', 'Jake', 'Emma', 'Grace', 'Sam', 'Avery', 'Miguel',
  // South America
  'Diego', 'Sofía', 'Mateo', 'Valentina', 'Camila', 'Santiago', 'Isabela', 'Thiago', 'Luiza',
  // regulars-to-be from everywhere
  'Priya', 'Noor', 'Leo',
];

// ------------------------------------------------------------
// State
// ------------------------------------------------------------

function freshState() {
  return {
    shoots: DIALS.startingShoots, inbox: 0, gold: 0, mn: DIALS.mn.startingBalance,
    muted: false,
    pantry: Object.fromEntries(DIALS.ingredients.map(i => [i.id, 0])),
    bowlsServed: 0, cumGoldEarned: 0, streak: 0,
    queue: [],           // {id, name, seed, order, patienceEndTs, patienceTotalMs, mercy}
    stations: Array.from({ length: DIALS.stations }, (_, i) =>
      ({ id: i, phase: 'empty', cookEndTs: 0, toppings: [] })),
    shelf: Array.from({ length: DIALS.shelfSlots }, () => null), // {toppings, expiresTs}
    patches: {
      sun: { phase: 'idle', readyTs: 0, cooldownEndTs: 0, harvestsToday: 0 },
      ret: { phase: 'idle', readyTs: 0 },
    },
    dayKey: todayKey(), lastRegenTs: now(), lastArrivalTs: 0,
    festival: false, paused: false,
    tutorialStep: 0, tutorialDone: false,
    stats: { lost: 0, mercy: 0, tips: 0, lucky: 0, shelfSold: 0, shootsServed: 0, refills: 0 },
    telemetry: [],
    nextId: 1,
    savedAt: now(),
  };
}

let S = freshState();
let announcedUnlocks = [];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function track(event, props = {}) {
  S.telemetry.push({ t: now(), event, ...props });
  if (S.telemetry.length > 200) S.telemetry.splice(0, S.telemetry.length - 200);
  const tail = $('#tel-tail');
  if (tail && !devPanelHidden()) renderTelemetry();
}

// --- Save / load with offline reconciliation ---

// Reset must suppress autosave: pagehide fires save() during the reload,
// which would silently re-persist the state being wiped.
let suppressSave = false;

function save() {
  if (suppressSave) return;
  S.savedAt = now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
}

function hardReset() {
  suppressSave = true;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* private mode */ }
  location.reload();
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* private mode */ }
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    S = Object.assign(freshState(), parsed);
    // day rollover for patch caps
    if (S.dayKey !== todayKey()) {
      S.dayKey = todayKey();
      S.patches.sun.harvestsToday = 0;
    }
    reconcileAbsence(now() - S.savedAt);
    announcedUnlocks = unlockedIngredients(S);
    return true;
  } catch (e) { return false; }
}

// Spec §15.3: away > 30 min → the shift auto-ends; shorter gaps just
// push in-session deadlines forward (patches/regen run on real time).
function reconcileAbsence(gapMs) {
  if (gapMs <= 1500) return;
  // an explicitly paused shift never auto-ends, however long the absence
  if (!S.paused && gapMs > DIALS.interruptionGraceSec * 1000) {
    endShift();
  } else {
    const t = now();
    for (const c of S.queue) {
      c.patienceEndTs += gapMs;
      // never resume with a customer already expired — give a small grace
      c.patienceEndTs = Math.max(c.patienceEndTs, t + c.patienceTotalMs * 0.2);
    }
    for (const st of S.stations) if (st.phase === 'cooking') st.cookEndTs += gapMs;
    for (const slot of S.shelf) if (slot) slot.expiresTs += gapMs;
  }
}

function endShift() {
  // in-progress cooks refund their ingredients
  for (const st of S.stations) {
    if (st.phase === 'cooking') {
      for (const id of st.toppings) {
        S.pantry[id] = Math.min(DIALS.pantryCap, S.pantry[id] + 1);
      }
    } else if (st.phase === 'ready' && st.toppings.length >= 0) {
      // completed bowls resolve via shelf rules → day-old sale
      S.gold += Math.round(rawPrice(st.toppings) * DIALS.shelfSalePct);
    }
    st.phase = 'empty'; st.toppings = []; st.cookEndTs = 0;
  }
  for (let i = 0; i < S.shelf.length; i++) {
    if (S.shelf[i]) {
      S.gold += Math.round(rawPrice(S.shelf[i].toppings) * DIALS.shelfSalePct);
      S.shelf[i] = null;
    }
  }
  S.queue = []; // customers disperse — no streak penalty (spec §15.3)
  track('shift_auto_ended');
}

// ------------------------------------------------------------
// Shoot wallet helpers (spec §15.4: inbox consumed first)
// ------------------------------------------------------------

const shootTotal = () => S.shoots + S.inbox;

function spendShoots(n) {
  if (shootTotal() < n) return false;
  const fromInbox = Math.min(S.inbox, n);
  S.inbox -= fromInbox;
  S.shoots -= (n - fromInbox);
  return true;
}

// Faucets fill the wallet to cap; overflow lands in the bonus inbox
// so a full wallet never silently wastes a harvest.
function grantShoots(n) {
  const toWallet = Math.min(n, Math.max(0, DIALS.walletCap - S.shoots));
  S.shoots += toWallet;
  S.inbox += n - toWallet;
}

function earnGold(n) {
  S.gold += n;
  S.cumGoldEarned += n;
  checkUnlocks();
}

// ------------------------------------------------------------
// Core actions
// ------------------------------------------------------------

function spawnCustomer(scripted = null) {
  if (S.queue.length >= DIALS.queueCap) return;
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  let order, mercy = false;
  if (scripted) order = scripted;
  else ({ order, mercy } = generateTicketOrder(S));
  const patienceMs = DIALS.patienceSec * 1000;
  S.queue.push({
    id: S.nextId++, name, seed: hashSeed(name + S.nextId + Math.random()),
    order, patienceEndTs: now() + patienceMs, patienceTotalMs: patienceMs, mercy,
  });
  track('customer_arrived', { order: order.join('+') || 'plain', mercy });
  renderQueue();
  tryShelfMatches();
}

function startCook(stationId) {
  const st = S.stations[stationId];
  if (st.phase !== 'empty') return;
  const cookSec = inTutorial() ? DIALS.tutorialCookSec : DIALS.baseCookSec;
  st.phase = 'cooking';
  st.cookEndTs = now() + cookSec * 1000;
  st.toppings = [];
  track('bowl_started', { station: stationId });
  renderStations();
  tutorialEvent('cook_started');
}

function dropTopping(stationId, ingId) {
  const st = S.stations[stationId];
  if (st.phase === 'empty') return false;
  if (st.toppings.length >= DIALS.maxToppingsPerBowl) return false;
  if (S.pantry[ingId] <= 0) return false;
  S.pantry[ingId] -= 1;
  st.toppings.push(ingId);
  st.toppings.sort();
  dropTick();
  renderStations(); renderPantry();
  tutorialEvent('topping_dropped');
  return true;
}

function buyIngredient(ingId) {
  const ing = ING[ingId];
  if (S.pantry[ingId] >= DIALS.pantryCap) { toast('Pantry full for ' + ing.name); return; }
  if (!spendShoots(ing.shoots)) { pinchToast(); return; }
  S.pantry[ingId] += 1;
  track('pantry_purchase', { ingredient: ingId, shoots: ing.shoots });
  renderPantry(); renderHUD();
  tutorialEvent('stocked');
}

function payForBowl(toppings, { lucky = false } = {}) {
  let price = rawPrice(toppings);
  const streakPct = Math.min(S.streak * DIALS.streakStepPct, DIALS.streakCapPct);
  price *= 1 + streakPct / 100;
  if (lucky) price *= 1 + DIALS.luckyMatchBonus;
  if (S.festival) price *= DIALS.festivalPayMult;
  return Math.round(price);
}

function serveCustomer(customer, toppings, { lucky = false } = {}) {
  const paid = payForBowl(toppings, { lucky });
  earnGold(paid);
  S.bowlsServed += 1;
  S.streak += 1;
  S.stats.shootsServed += shootValue(toppings);
  if (lucky) S.stats.lucky += 1;
  S.queue = S.queue.filter(c => c.id !== customer.id);
  if (Math.random() < DIALS.tipRate) {
    S.stats.tips += 1;
    grantShoots(1);
    toast('🌱 ' + customer.name + ' tipped a Green Shoot!');
    track('tip_received');
  }
  track('bowl_served', {
    recipe: toppings.join('+') || 'plain', paid, lucky,
    streak: S.streak, shoots: shootValue(toppings),
  });
  renderQueue(); renderHUD(); renderStations();
  return paid;
}

function loseCustomer(customer, cause) {
  S.queue = S.queue.filter(c => c.id !== customer.id);
  S.stats.lost += 1;
  // Only a patience failure breaks the streak (v3.1 addendum —
  // queue-full walk-offs and mercy-state losses are not the player's fault).
  if (cause === 'patience' && S.streak > 0) {
    toast(`😤 ${customer.name} left! (streak broken)`);
    S.streak = 0;
  } else if (cause === 'patience') {
    toast(`😤 ${customer.name} left hungry…`);
  }
  track('customer_lost', { cause });
  renderQueue(); renderHUD();
}

// Day-Old Shelf (spec §4.5)
function setAside(stationId) {
  const st = S.stations[stationId];
  if (st.phase !== 'ready') return false;
  const slot = S.shelf.findIndex(s => s === null);
  if (slot === -1) { toast('Shelf is full!'); return false; }
  S.shelf[slot] = { toppings: [...st.toppings], expiresTs: now() + DIALS.shelfWindowSec * 1000 };
  st.phase = 'empty'; st.toppings = []; st.cookEndTs = 0;
  track('bowl_set_aside', { recipe: S.shelf[slot].toppings.join('+') || 'plain' });
  renderStations(); renderShelf();
  return true;
}

function tryShelfMatches() {
  for (let i = 0; i < S.shelf.length; i++) {
    const slot = S.shelf[i];
    if (!slot) continue;
    const match = S.queue.find(c => bowlMatches(slot.toppings, c.order));
    if (match) {
      const slotEl = document.querySelector(`.shelf-slot[data-slot="${i}"]`) || $('#shelf-row');
      const rect = slotEl.getBoundingClientRect();
      const paid = serveCustomer(match, slot.toppings, { lucky: true });
      S.shelf[i] = null;
      toast(`✨ Lucky match! ${match.name} took the shelf bowl (+${paid} 🪙)`);
      serveJuice(rect, paid);
      renderShelf();
    }
  }
}

// --- Patches (spec §5.2) ---

function plantSun() {
  const p = S.patches.sun;
  if (p.phase !== 'idle') return;
  if (p.harvestsToday >= DIALS.patchSun.dailyCap) { toast('The sunlight patch rests until tomorrow 🌙'); return; }
  if (!spendShoots(DIALS.patchSun.plant)) { pinchToast(); return; }
  const growSec = inTutorial() ? DIALS.patchSun.tutorialGrowSec : DIALS.patchSun.growSec;
  p.phase = 'growing';
  p.readyTs = now() + growSec * 1000;
  track('green_shoot_plant', { patch: 'sun' });
  renderPatches(); renderHUD();
  tutorialEvent('planted');
}

function harvestSun() {
  const p = S.patches.sun;
  if (p.phase !== 'ready') return;
  grantShoots(DIALS.patchSun.harvest);
  p.harvestsToday += 1;
  p.phase = 'cooldown';
  p.cooldownEndTs = now() + DIALS.patchSun.cooldownSec * 1000;
  track('green_shoot_harvest', { patch: 'sun', amount: DIALS.patchSun.harvest });
  toast(`🌱 Harvested ${DIALS.patchSun.harvest} shoots!`);
  renderPatches(); renderHUD();
  tutorialEvent('harvested');
}

function plantReturn() {
  const p = S.patches.ret;
  if (p.phase !== 'idle') return;
  if (!spendShoots(DIALS.patchReturn.plant)) { pinchToast(); return; }
  p.phase = 'growing';
  p.readyTs = now() + DIALS.patchReturn.growSec * 1000;
  track('green_shoot_plant', { patch: 'return' });
  renderPatches(); renderHUD();
}

function harvestReturn() {
  const p = S.patches.ret;
  if (p.phase !== 'ready') return;
  grantShoots(DIALS.patchReturn.harvest);
  p.phase = 'idle';
  track('green_shoot_harvest', { patch: 'return', amount: DIALS.patchReturn.harvest });
  toast(`🌱 The big patch paid out ${DIALS.patchReturn.harvest} shoots!`);
  renderPatches(); renderHUD();
}

// --- Golden Fortune (福) spends (spec §5.4; renamed from Maneki-Neko after playtest) ---

function mnSpend(cost) {
  if (S.mn < cost) { toast('Out of Golden Fortune <span class="fu">福</span> — more with the full game!'); return false; }
  S.mn -= cost;
  return true;
}

function refillShoots() {
  if (!mnSpend(DIALS.mn.refillCost)) return;
  grantShoots(DIALS.mn.refillShoots);
  S.stats.refills += 1;
  track('energy_refill_used', { mn: DIALS.mn.refillCost });
  toast(`<span class="fu">福</span> Refilled ${DIALS.mn.refillShoots} shoots!`);
  renderHUD(); renderPatches();
}

function instantFinish(stationId) {
  const st = S.stations[stationId];
  if (st.phase !== 'cooking') return;
  if (!mnSpend(DIALS.mn.instantFinishCost)) return;
  st.cookEndTs = now();
  track('speedup_used', { context: 'cook' });
  renderHUD();
}

function skipPatch(kind) {
  const p = S.patches[kind];
  if (p.phase !== 'growing') return;
  if (!mnSpend(DIALS.mn.skipPatchCost)) return;
  p.readyTs = now();
  track('speedup_used', { context: 'patch' });
  renderHUD();
}

function checkUnlocks() {
  const current = unlockedIngredients(S);
  for (const id of current) {
    if (!announcedUnlocks.includes(id)) {
      announcedUnlocks.push(id);
      toast(`🎉 New ingredient unlocked: ${ING[id].name}!`);
      track('ingredient_unlocked', { ingredient: id });
      renderPantry();
    }
  }
}

function pinchToast() {
  toast('Not enough Green Shoots! 🌱 Harvest a patch — or refill with <span class="fu">福</span>');
  renderPatches();
}

function setPaused(p) {
  S.paused = p;
  $('#pause-overlay').classList.toggle('hidden', !p);
  $('#pause-btn').textContent = p ? '▶' : '⏸';
  track(p ? 'session_paused' : 'session_resumed');
  save();
}

// ------------------------------------------------------------
// Game tick
// ------------------------------------------------------------

let lastTick = now();

function tick() {
  const t = now();
  // paused while backgrounded (spec §15.3); __ramenForceTick is a debug escape
  if (document.hidden && !window.__ramenForceTick) { lastTick = t; return; }
  const dt = t - lastTick;
  lastTick = t;

  // user pause: slide every in-session deadline forward so the shift is
  // frozen in place; regen and patches keep running (same as being away)
  if (S.paused) {
    for (const c of S.queue) c.patienceEndTs += dt;
    for (const st of S.stations) if (st.phase === 'cooking') st.cookEndTs += dt;
    for (const slot of S.shelf) if (slot) slot.expiresTs += dt;
    if (S.lastArrivalTs) S.lastArrivalTs += dt;
  }

  // regen: 1 shoot / N min while below cap; timer idles at cap
  const regenMs = DIALS.regenIntervalMin * 60 * 1000;
  if (S.shoots >= DIALS.walletCap) {
    S.lastRegenTs = t;
  } else {
    while (t - S.lastRegenTs >= regenMs && S.shoots < DIALS.walletCap) {
      S.shoots += 1;
      S.lastRegenTs += regenMs;
      renderHUD();
    }
  }

  // day rollover
  if (S.dayKey !== todayKey()) {
    S.dayKey = todayKey();
    S.patches.sun.harvestsToday = 0;
    renderPatches();
  }

  if (!S.paused) {
    // arrivals — run even during the tutorial (patience is frozen there),
    // but keep the queue short until it's done
    const queueLimit = inTutorial() ? 2 : DIALS.queueCap;
    if (S.lastArrivalTs === 0) S.lastArrivalTs = t - DIALS.arrivalSec * 1000; // first arrives fast
    if (t - S.lastArrivalTs >= DIALS.arrivalSec * 1000) {
      S.lastArrivalTs = t;
      if (S.queue.length < queueLimit) spawnCustomer();
    }

    // patience
    for (const c of [...S.queue]) {
      if (inTutorial()) { c.patienceEndTs = t + c.patienceTotalMs; continue; }
      if (t >= c.patienceEndTs) loseCustomer(c, 'patience');
    }

    // cooking done
    for (const st of S.stations) {
      if (st.phase === 'cooking' && t >= st.cookEndTs) {
        st.phase = 'ready';
        track('bowl_cooked', { station: st.id });
        renderStations();
        tutorialEvent('cooked');
      }
    }
  }

  // patches maturing
  for (const [kind, p] of Object.entries(S.patches)) {
    if (p.phase === 'growing' && t >= p.readyTs) { p.phase = 'ready'; renderPatches(); }
    if (kind === 'sun' && p.phase === 'cooldown' && t >= p.cooldownEndTs) { p.phase = 'idle'; renderPatches(); }
  }

  // shelf: lucky matches + expiry sale
  if (!S.paused) tryShelfMatches();
  for (let i = 0; i < S.shelf.length; i++) {
    const slot = S.shelf[i];
    if (!S.paused && slot && t >= slot.expiresTs) {
      const got = Math.round(rawPrice(slot.toppings) * DIALS.shelfSalePct);
      S.gold += got; // day-old sale: no streak, no cumGold-unlock credit? — it is earned gold
      S.cumGoldEarned += got;
      S.stats.shelfSold += 1;
      S.shelf[i] = null;
      toast(`🍜 Day-old bowl sold to a hungry student (+${got} 🪙)`);
      track('shelf_sold', { got });
      checkUnlocks();
      renderShelf(); renderHUD();
    }
  }

  updateMeters();
}

// ------------------------------------------------------------
// Rendering
// ------------------------------------------------------------

function orderChips(order) {
  if (order.length === 0) return '<span class="plain-chip">plain</span>';
  return order.map(id => `<span class="chip" title="${ING[id].name}">${toppingSVG(id, 22)}</span>`).join('');
}

function moodOf(c) {
  const left = (c.patienceEndTs - now()) / c.patienceTotalMs;
  return left > 0.55 ? 'happy' : left > 0.25 ? 'okay' : 'angry';
}

function renderQueue() {
  const wrap = $('#queue');
  wrap.innerHTML = S.queue.map(c => `
    <div class="customer" data-cid="${c.id}">
      <div class="avatar" data-mood="${moodOf(c)}">${avatarSVG(c.seed, moodOf(c))}</div>
      <div class="cust-name">${c.name}</div>
      <div class="order-card">${orderChips(c.order)}</div>
      <div class="patience"><div class="patience-fill"></div></div>
    </div>
  `).join('') || '<div class="queue-empty">The counter is quiet…</div>';
  highlightMatches();
}

function renderStations() {
  const wrap = $('#stations');
  wrap.innerHTML = S.stations.map(st => {
    if (st.phase === 'empty') {
      return `<div class="station empty" data-sid="${st.id}">
        <div class="station-hint">${bowlSVG([], { size: 86 })}<span>Tap to cook noodles</span></div>
      </div>`;
    }
    if (st.phase === 'cooking') {
      return `<div class="station cooking" data-sid="${st.id}">
        ${bowlSVG(st.toppings, { size: 96, cooking: true })}
        <div class="cook-bar"><div class="cook-fill"></div></div>
        <button class="mn-btn instant" data-sid="${st.id}">⚡ 1 ${fortuneIcon(14)}</button>
      </div>`;
    }
    return `<div class="station ready" data-sid="${st.id}">
      ${bowlSVG(st.toppings, { size: 96 })}
      <div class="ready-tag">ready — drag to serve</div>
    </div>`;
  }).join('');
  highlightMatches();
}

// glow bowls that match a ticket; highlight their customers
function highlightMatches() {
  for (const st of S.stations) {
    const el = document.querySelector(`.station[data-sid="${st.id}"]`);
    if (!el) continue;
    const match = st.phase === 'ready' && S.queue.some(c => bowlMatches(st.toppings, c.order));
    el.classList.toggle('match', !!match);
  }
  for (const c of S.queue) {
    const el = document.querySelector(`.customer[data-cid="${c.id}"]`);
    if (!el) continue;
    const match = S.stations.some(st => st.phase === 'ready' && bowlMatches(st.toppings, c.order));
    el.classList.toggle('wants-ready', match);
  }
}

function renderShelf() {
  const wrap = $('#shelf-slots');
  wrap.innerHTML = S.shelf.map((slot, i) => slot
    ? `<div class="shelf-slot filled" data-slot="${i}">${bowlSVG(slot.toppings, { size: 56 })}
         <div class="shelf-timer"><div class="shelf-fill"></div></div></div>`
    : `<div class="shelf-slot" data-slot="${i}"><span>—</span></div>`
  ).join('');
}

function renderPantry() {
  const wrap = $('#pantry');
  const unlocked = unlockedIngredients(S);
  wrap.innerHTML = DIALS.ingredients.map(ing => {
    const isUnlocked = unlocked.includes(ing.id);
    if (!isUnlocked) {
      const u = DIALS.unlocks[ing.id];
      const hint = u.bowls != null ? `${u.bowls} bowls` : `${u.cumGold} 🪙 earned`;
      return `<div class="ing locked"><div class="ing-icon">🔒</div>
        <div class="ing-name">${ing.name}</div><div class="ing-unlock">${hint}</div></div>`;
    }
    const stock = S.pantry[ing.id];
    const afford = shootTotal() >= ing.shoots;
    return `<div class="ing ${stock > 0 ? 'has-stock' : ''}" data-ing="${ing.id}">
      <div class="ing-icon draggable" data-ing="${ing.id}">${toppingSVG(ing.id, 38)}</div>
      <div class="ing-stock">×${stock}</div>
      <div class="ing-name">${ing.name}</div>
      <button class="buy-btn ${afford ? '' : 'cant'}" data-buy="${ing.id}">
        +1&thinsp;·&thinsp;${ing.shoots}${shootIcon(12)}
      </button>
    </div>`;
  }).join('');
}

function renderPatches() {
  const sun = S.patches.sun, ret = S.patches.ret;
  const sunCapLeft = DIALS.patchSun.dailyCap - sun.harvestsToday;
  $('#patch-sun').innerHTML = `
    <div class="patch-art">${patchSVG(sun.phase)}</div>
    <div class="patch-info">
      <div class="patch-name">Sunlight Patch</div>
      <div class="patch-sub" id="sun-sub"></div>
      ${sun.phase === 'idle' ? `<button class="patch-btn" id="sun-plant" ${sunCapLeft <= 0 ? 'disabled' : ''}>
          Plant ${DIALS.patchSun.plant}${shootIcon(13)} → ${DIALS.patchSun.harvest}</button>` : ''}
      ${sun.phase === 'ready' ? `<button class="patch-btn ready" id="sun-harvest">Harvest ${DIALS.patchSun.harvest}${shootIcon(13)}</button>` : ''}
      ${sun.phase === 'growing' ? `<button class="mn-btn" id="sun-skip">⏩ 1 ${fortuneIcon(14)}</button>` : ''}
    </div>`;
  $('#patch-ret').innerHTML = `
    <div class="patch-art">${patchSVG(ret.phase)}</div>
    <div class="patch-info">
      <div class="patch-name">Return Patch</div>
      <div class="patch-sub" id="ret-sub"></div>
      ${ret.phase === 'idle' ? `<button class="patch-btn" id="ret-plant">Plant ${DIALS.patchReturn.plant}${shootIcon(13)} → ${DIALS.patchReturn.harvest}</button>` : ''}
      ${ret.phase === 'ready' ? `<button class="patch-btn ready" id="ret-harvest">Harvest ${DIALS.patchReturn.harvest}${shootIcon(13)}</button>` : ''}
      ${ret.phase === 'growing' ? `<button class="mn-btn" id="ret-skip">⏩ 1 ${fortuneIcon(14)}</button>` : ''}
    </div>`;
  updateMeters();
}

function renderHUD() {
  $('#hud-shoots').innerHTML = `${shootIcon(18)} <b>${S.shoots}</b>/${DIALS.walletCap}` +
    (S.inbox > 0 ? ` <span class="inbox">+${S.inbox}</span>` : '');
  $('#hud-gold').innerHTML = `${coinIcon(18)} <b>${S.gold.toLocaleString()}</b>`;
  $('#hud-mn').innerHTML = `${fortuneIcon(18)} <b>${S.mn}</b>`;
  const pct = Math.min(S.streak * DIALS.streakStepPct, DIALS.streakCapPct);
  $('#hud-streak').innerHTML = pct > 0 ? `🔥 +${pct}%` : '🔥 —';
  $('#hud-streak').classList.toggle('hot', pct >= DIALS.streakCapPct);
  // pinch surface: refill offer when the wallet is running dry
  $('#refill-btn').classList.toggle('hidden', shootTotal() >= 4 || S.mn < DIALS.mn.refillCost);
  renderPantryAffordability();
}

function renderPantryAffordability() {
  document.querySelectorAll('.buy-btn').forEach(btn => {
    const ing = ING[btn.dataset.buy];
    btn.classList.toggle('cant', shootTotal() < ing.shoots);
  });
}

// Per-tick meter updates (no DOM rebuild)
function updateMeters() {
  const t = now();
  for (const c of S.queue) {
    const el = document.querySelector(`.customer[data-cid="${c.id}"]`);
    if (!el) continue;
    const left = Math.max(0, (c.patienceEndTs - t) / c.patienceTotalMs);
    const fill = el.querySelector('.patience-fill');
    fill.style.width = (left * 100) + '%';
    fill.style.background = left > 0.55 ? 'var(--green)' : left > 0.25 ? 'var(--amber)' : 'var(--red)';
    const mood = moodOf(c);
    const av = el.querySelector('.avatar');
    if (av.dataset.mood !== mood) { av.dataset.mood = mood; av.innerHTML = avatarSVG(c.seed, mood); }
  }
  for (const st of S.stations) {
    if (st.phase !== 'cooking') continue;
    const el = document.querySelector(`.station[data-sid="${st.id}"] .cook-fill`);
    if (!el) continue;
    const cookSec = inTutorial() ? DIALS.tutorialCookSec : DIALS.baseCookSec;
    const done = 1 - Math.max(0, (st.cookEndTs - t) / (cookSec * 1000));
    el.style.width = (done * 100) + '%';
  }
  for (let i = 0; i < S.shelf.length; i++) {
    const slot = S.shelf[i];
    if (!slot) continue;
    const el = document.querySelector(`.shelf-slot[data-slot="${i}"] .shelf-fill`);
    if (el) el.style.width = (Math.max(0, (slot.expiresTs - t) / (DIALS.shelfWindowSec * 1000)) * 100) + '%';
  }
  // patch countdowns + regen timer
  const sun = S.patches.sun, ret = S.patches.ret;
  const sunSub = $('#sun-sub'), retSub = $('#ret-sub');
  if (sunSub) {
    const capLeft = DIALS.patchSun.dailyCap - sun.harvestsToday;
    sunSub.textContent =
      sun.phase === 'growing' ? `growing… ${fmtSecs(sun.readyTs - t)}` :
      sun.phase === 'ready' ? 'ready!' :
      sun.phase === 'cooldown' ? `resting ${fmtSecs(sun.cooldownEndTs - t)}` :
      capLeft > 0 ? `${capLeft} harvests left today` : 'done for today';
  }
  if (retSub) {
    retSub.textContent =
      ret.phase === 'growing' ? `growing… ${fmtSecs(ret.readyTs - t)}` :
      ret.phase === 'ready' ? 'ready!' : 'plant & come back later';
  }
  const regenEl = $('#regen-timer');
  if (S.shoots >= DIALS.walletCap) regenEl.textContent = 'wallet full';
  else {
    const nextIn = DIALS.regenIntervalMin * 60000 - (t - S.lastRegenTs);
    regenEl.textContent = `next 🌱 in ${fmtSecs(nextIn)}`;
  }
}

function fmtSecs(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

// ------------------------------------------------------------
// Toasts & floaters
// ------------------------------------------------------------

function toast(msg) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3200);
  while (box.children.length > 3) box.firstChild.remove();
}

function floatAt(text, x, y, cls = '') {
  const el = document.createElement('div');
  el.className = 'floater ' + cls;
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

// The payday moment: coins arc up to the gold counter, the counter pops,
// the register goes ca-ching, the customer beams.
function serveJuice(rect, paid) {
  caChing();
  floatAt('😊', rect.left + rect.width / 2 - 26, rect.top - 4, 'happy');
  floatAt('+' + paid, rect.left + rect.width / 2 + 22, rect.top - 4, 'gold');
  flyCoins(rect, paid);
}

function flyCoins(fromRect, amount) {
  const targetEl = $('#hud-gold');
  if (!targetEl) return;
  const target = targetEl.getBoundingClientRect();
  const tx = target.left + target.width / 2;
  const ty = target.top + target.height / 2;
  const n = Math.min(9, 3 + Math.floor(amount / 10));
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'coin-fly';
    el.innerHTML = coinIcon(20);
    const sx = fromRect.left + fromRect.width / 2 + (Math.random() * 36 - 18);
    const sy = fromRect.top + fromRect.height / 2 + (Math.random() * 24 - 12);
    el.style.left = sx + 'px';
    el.style.top = sy + 'px';
    document.body.appendChild(el);
    const midX = (sx + tx) / 2 + (Math.random() * 70 - 35);
    const midY = Math.min(sy, ty) - 50 - Math.random() * 50;
    const anim = el.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${midX - sx}px), calc(-50% + ${midY - sy}px)) scale(1.15)`, opacity: 1, offset: 0.45 },
      { transform: `translate(calc(-50% + ${tx - sx}px), calc(-50% + ${ty - sy}px)) scale(0.45)`, opacity: 0.9 },
    ], { duration: 520 + Math.random() * 160, delay: i * 45, easing: 'cubic-bezier(.3,.7,.35,1)', fill: 'backwards' });
    anim.onfinish = () => {
      el.remove();
      const chip = $('#hud-gold');
      chip.classList.remove('pop');
      void chip.offsetWidth;
      chip.classList.add('pop');
    };
  }
}

// ------------------------------------------------------------
// Drag & drop (Pointer Events → works for touch and mouse)
// ------------------------------------------------------------

let drag = null; // { kind:'topping'|'bowl', ingId?, stationId?, ghost }

function startDrag(e, payload, ghostHTML) {
  drag = { ...payload };
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.innerHTML = ghostHTML;
  document.body.appendChild(ghost);
  drag.ghost = ghost;
  moveGhost(e);
}

function moveGhost(e) {
  if (!drag) return;
  drag.ghost.style.left = e.clientX + 'px';
  drag.ghost.style.top = e.clientY + 'px';
}

function elFromPoint(e, selector) {
  const els = document.elementsFromPoint(e.clientX, e.clientY);
  for (const el of els) {
    const hit = el.closest && el.closest(selector);
    if (hit) return hit;
  }
  return null;
}

function endDrag(e) {
  if (!drag) return;
  const d = drag;
  d.ghost.remove();
  drag = null;

  if (d.kind === 'topping') {
    const stationEl = elFromPoint(e, '.station');
    if (stationEl) {
      const sid = +stationEl.dataset.sid;
      const st = S.stations[sid];
      if (st.phase === 'empty') {
        toast('Tap the station to start noodles first!');
      } else if (!dropTopping(sid, d.ingId)) {
        wobble(stationEl);
      }
    }
    // miss → snaps back, nothing consumed (spec §4.1)
    return;
  }

  if (d.kind === 'bowl') {
    const st = S.stations[d.stationId];
    if (!st || st.phase !== 'ready') return;
    const custEl = elFromPoint(e, '.customer');
    if (custEl) {
      const c = S.queue.find(q => q.id === +custEl.dataset.cid);
      if (c && bowlMatches(st.toppings, c.order)) {
        const rect = custEl.getBoundingClientRect(); // before re-render detaches it
        const toppings = [...st.toppings];
        st.phase = 'empty'; st.toppings = []; st.cookEndTs = 0;
        const paid = serveCustomer(c, toppings);
        serveJuice(rect, paid);
        tutorialEvent('served');
      } else {
        wobble(custEl);
        toast('That’s not their order!');
      }
      return;
    }
    if (elFromPoint(e, '#shelf-row')) setAside(d.stationId);
  }
}

function wobble(el) {
  el.classList.remove('wobble');
  void el.offsetWidth;
  el.classList.add('wobble');
}

// Pantry placards: a tap anywhere on the card buys +1 stock;
// moving past a small threshold turns the gesture into a topping drag.
let pendingTile = null; // { ingId, x, y, el }

function bindPointerEvents() {
  document.addEventListener('pointerdown', e => {
    unlockAudio();
    const tile = e.target.closest('.ing[data-ing]');
    if (tile) {
      if (e.target.closest('.buy-btn')) return; // the button's click handler buys
      e.preventDefault();
      pendingTile = { ingId: tile.dataset.ing, x: e.clientX, y: e.clientY, el: tile };
      return;
    }
    const stEl = e.target.closest('.station');
    if (stEl && !e.target.closest('button')) {
      const sid = +stEl.dataset.sid;
      const st = S.stations[sid];
      if (st.phase === 'empty') { startCook(sid); return; }
      if (st.phase === 'ready') {
        e.preventDefault();
        startDrag(e, { kind: 'bowl', stationId: sid }, bowlSVG(st.toppings, { size: 80 }));
      }
    }
  });
  document.addEventListener('pointermove', e => {
    if (pendingTile) {
      const dist = Math.hypot(e.clientX - pendingTile.x, e.clientY - pendingTile.y);
      if (dist > 8) {
        const { ingId, el } = pendingTile;
        pendingTile = null;
        if (S.pantry[ingId] > 0) {
          startDrag(e, { kind: 'topping', ingId }, toppingSVG(ingId, 44));
        } else {
          wobble(el);
          toast(`No ${ING[ingId].name} stocked — tap the card to buy one`);
        }
      }
      return;
    }
    if (drag) { e.preventDefault(); moveGhost(e); }
  }, { passive: false });
  document.addEventListener('pointerup', e => {
    if (pendingTile) {
      const { ingId } = pendingTile;
      pendingTile = null;
      buyIngredient(ingId); // a clean tap on the placard = stock one
      return;
    }
    endDrag(e);
  });
  document.addEventListener('pointercancel', () => {
    pendingTile = null;
    if (drag) { drag.ghost.remove(); drag = null; }
  });
}

// ------------------------------------------------------------
// Click bindings (delegated)
// ------------------------------------------------------------

function bindClicks() {
  document.addEventListener('click', e => {
    const buy = e.target.closest('.buy-btn');
    if (buy) { buyIngredient(buy.dataset.buy); return; }
    if (e.target.closest('#sun-plant')) return plantSun();
    if (e.target.closest('#sun-harvest')) return harvestSun();
    if (e.target.closest('#sun-skip')) return skipPatch('sun');
    if (e.target.closest('#ret-plant')) return plantReturn();
    if (e.target.closest('#ret-harvest')) return harvestReturn();
    if (e.target.closest('#ret-skip')) return skipPatch('ret');
    if (e.target.closest('#refill-btn')) return refillShoots();
    const inst = e.target.closest('.mn-btn.instant');
    if (inst) return instantFinish(+inst.dataset.sid);
    if (e.target.closest('#dev-toggle')) return toggleDevPanel();
    if (e.target.closest('#pause-btn')) return setPaused(!S.paused);
    if (e.target.closest('#pause-overlay')) return setPaused(false);
    if (e.target.closest('#mute-btn')) {
      S.muted = !S.muted;
      setMuted(S.muted);
      $('#mute-btn').textContent = S.muted ? '🔇' : '🔊';
      return;
    }
  });
}

// ------------------------------------------------------------
// Tutorial (spec §11, beats 1–2 + pinch awareness; skippable)
// ------------------------------------------------------------

// pos: 'top' when the step's target lives in the bottom half of the screen,
// so the card never covers what it is pointing at.
const TUT_STEPS = [
  { text: 'Welcome to Ana’s Ramen Shop! 🍜 First: energy. Plant Green Shoots in the <b>Sunlight Patch</b> below.', target: '#patch-sun', event: 'planted', pos: 'top' },
  { text: 'Shoots are growing… harvest them when they’re ready!', target: '#patch-sun', event: 'harvested', pos: 'top' },
  { text: 'Shoots buy ingredients. <b>Tap the scallion card</b> to stock one.', target: '#pantry', event: 'stocked', pos: 'top' },
  { text: 'A customer! Tap an empty <b>station</b> to start noodles & broth.', target: '#stations', event: 'cook_started', onEnter: () => { if (S.queue.length === 0) spawnCustomer(['scallion']); } },
  { text: 'Now <b>drag the scallion</b> from the pantry into the bowl. Careful — drops are permanent!', target: '#stations', event: 'topping_dropped', pos: 'top' },
  { text: 'When the bowl matches the order it glows. <b>Drag the bowl</b> to your customer!', target: '#queue', event: 'served' },
  { text: '💰 Paid! Serving builds your <b>streak</b> (+2% each bowl). When shoots run dry mid-rush — that’s the pinch. Patches, tips, or a 福 refill get you back. Good luck!', target: null, event: null },
];

function inTutorial() { return !S.tutorialDone; }

// Fast-forwarding: if the player does things out of order (they will),
// any matching later step counts — the tutorial never blocks play.
function tutorialEvent(name) {
  if (!inTutorial()) return;
  for (let i = S.tutorialStep; i < TUT_STEPS.length; i++) {
    if (TUT_STEPS[i].event === name) {
      S.tutorialStep = i + 1;
      if (S.tutorialStep >= TUT_STEPS.length) return finishTutorial();
      return showTutorialStep();
    }
  }
}

function advanceTutorial() {
  S.tutorialStep += 1;
  if (S.tutorialStep >= TUT_STEPS.length) return finishTutorial();
  showTutorialStep();
}

function showTutorialStep() {
  const step = TUT_STEPS[S.tutorialStep];
  if (!step) return finishTutorial();
  if (step.onEnter) step.onEnter();
  const box = $('#tutorial');
  box.classList.remove('hidden');
  box.classList.toggle('tut-top', step.pos === 'top');
  box.querySelector('.tut-text').innerHTML = step.text;
  document.querySelectorAll('.tut-target').forEach(el => el.classList.remove('tut-target'));
  if (step.target) {
    const el = $(step.target);
    if (el) el.classList.add('tut-target');
  }
  // final step: give it a "let's go" button
  box.querySelector('#tut-next').classList.toggle('hidden', step.event !== null);
  track('tutorial_step', { step: S.tutorialStep });
}

function finishTutorial() {
  S.tutorialDone = true;
  $('#tutorial').classList.add('hidden');
  document.querySelectorAll('.tut-target').forEach(el => el.classList.remove('tut-target'));
  // scripted 100% tip on the tutorial bowl already served — grant here (spec §11 Beat 3)
  grantShoots(1);
  toast('🌱 A tip! Happy customers sometimes tip a shoot — every bowl matters.');
  S.lastArrivalTs = now() - DIALS.arrivalSec * 1000 + 4000; // first real customer in ~4 s
  track('tutorial_complete');
  save();
  renderHUD();
}

function bindTutorial() {
  $('#tut-skip').addEventListener('click', finishTutorial);
  $('#tut-next').addEventListener('click', advanceTutorial);
}

// ------------------------------------------------------------
// Dev / LiveOps panel
// ------------------------------------------------------------

function devPanelHidden() { return $('#devpanel').classList.contains('hidden'); }

function toggleDevPanel() {
  $('#devpanel').classList.toggle('hidden');
  if (!devPanelHidden()) { syncDevInputs(); renderStats(); renderTelemetry(); }
}

function syncDevInputs() {
  $('#dial-arrival').value = DIALS.arrivalSec;
  $('#dial-arrival-v').textContent = DIALS.arrivalSec + 's';
  $('#dial-patience').value = DIALS.patienceSec;
  $('#dial-patience-v').textContent = DIALS.patienceSec + 's';
  $('#dial-cook').value = DIALS.baseCookSec;
  $('#dial-cook-v').textContent = DIALS.baseCookSec + 's';
  $('#dial-regen').value = DIALS.regenIntervalMin;
  $('#dial-regen-v').textContent = DIALS.regenIntervalMin + 'm';
  $('#dial-festival').checked = S.festival;
}

function renderStats() {
  const avg = S.bowlsServed > 0 ? (S.stats.shootsServed / S.bowlsServed).toFixed(2) : '—';
  $('#stats').innerHTML = `
    <div>bowls served <b>${S.bowlsServed}</b></div>
    <div>avg shoots/bowl <b>${avg}</b> <span class="dim">(target 2.7 mid-game)</span></div>
    <div>gold earned <b>${S.cumGoldEarned.toLocaleString()}</b></div>
    <div>customers lost <b>${S.stats.lost}</b> · mercy tickets <b>${S.stats.mercy}</b></div>
    <div>tips <b>${S.stats.tips}</b> · lucky matches <b>${S.stats.lucky}</b> · shelf sales <b>${S.stats.shelfSold}</b></div>
    <div>refills bought <b>${S.stats.refills}</b></div>`;
}

function renderTelemetry() {
  const tail = S.telemetry.slice(-12).reverse();
  $('#tel-tail').innerHTML = tail.map(ev => {
    const d = new Date(ev.t);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    const props = Object.entries(ev).filter(([k]) => k !== 't' && k !== 'event')
      .map(([k, v]) => `${k}=${v}`).join(' ');
    return `<div class="tel-row"><span class="dim">${time}</span> <b>${ev.event}</b> <span class="dim">${props}</span></div>`;
  }).join('');
}

function bindDevPanel() {
  $('#dial-arrival').addEventListener('input', e => {
    DIALS.arrivalSec = +e.target.value;
    $('#dial-arrival-v').textContent = DIALS.arrivalSec + 's';
  });
  $('#dial-patience').addEventListener('input', e => {
    DIALS.patienceSec = +e.target.value;
    $('#dial-patience-v').textContent = DIALS.patienceSec + 's';
  });
  $('#dial-cook').addEventListener('input', e => {
    DIALS.baseCookSec = +e.target.value;
    $('#dial-cook-v').textContent = DIALS.baseCookSec + 's';
  });
  $('#dial-regen').addEventListener('input', e => {
    DIALS.regenIntervalMin = +e.target.value;
    $('#dial-regen-v').textContent = DIALS.regenIntervalMin + 'm';
  });
  $('#dial-festival').addEventListener('change', e => {
    S.festival = e.target.checked;
    toast(S.festival
      ? '🏮 Midnight Festival! Exotic orders (20/30/50), pay ×1.5'
      : 'Back to the standard order mix (70/25/5)');
    track('festival_toggled', { on: S.festival });
  });
  $('#cheat-shoots').addEventListener('click', () => { grantShoots(10); renderHUD(); });
  $('#cheat-gold').addEventListener('click', () => { earnGold(200); renderHUD(); });
  $('#cheat-mn').addEventListener('click', () => { S.mn += 5; renderHUD(); });
  $('#cheat-reset').addEventListener('click', () => {
    if (!confirm('Reset all progress?')) return;
    hardReset();
  });
  setInterval(() => { if (!devPanelHidden()) renderStats(); }, 2000);
}

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------

function renderAll() {
  renderHUD(); renderQueue(); renderStations(); renderShelf(); renderPantry(); renderPatches();
}

function boot() {
  const loaded = load();
  document.querySelectorAll('#brand .lantern').forEach(el => { el.innerHTML = lanternSVG(22); });
  setMuted(S.muted);
  $('#mute-btn').textContent = S.muted ? '🔇' : '🔊';
  // restore a paused shift exactly as it was left
  $('#pause-overlay').classList.toggle('hidden', !S.paused);
  $('#pause-btn').textContent = S.paused ? '▶' : '⏸';
  renderAll();
  bindPointerEvents();
  bindClicks();
  bindTutorial();
  bindDevPanel();

  if (!S.tutorialDone) showTutorialStep();
  else track('session_start');

  setInterval(tick, 100);
  setInterval(save, 5000);

  // Pause anchor: while hidden, save() keeps running (so savedAt moves),
  // but the pause gap must be measured from when we actually went hidden.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = now(); save(); }
    else {
      if (hiddenAt) { reconcileAbsence(now() - hiddenAt); hiddenAt = 0; }
      renderAll();
    }
  });
  window.addEventListener('pagehide', save);

  // debug handle for tuning sessions (not part of the game)
  window.__ramen = { get S() { return S; }, DIALS, spawnCustomer, save, tick, renderAll, hardReset };
}

boot();
