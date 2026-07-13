// ============================================================
// Flat cartoon SVG art — readability first (spec §2).
// Every function returns an SVG string.
// ============================================================

// --- Topping icons -------------------------------------------------
// Each drawn inside a 40×40 viewBox so they scale anywhere.

const TOPPING_ART = {
  scallion: `
    <g>
      <circle cx="14" cy="22" r="7" fill="#7db85c" stroke="#4c7a35" stroke-width="2.5"/>
      <circle cx="14" cy="22" r="2.6" fill="#d8ecc3"/>
      <circle cx="27" cy="16" r="6" fill="#8cc46b" stroke="#4c7a35" stroke-width="2.5"/>
      <circle cx="27" cy="16" r="2.2" fill="#e2f1d2"/>
      <circle cx="26" cy="28" r="5" fill="#6da84d" stroke="#4c7a35" stroke-width="2.5"/>
      <circle cx="26" cy="28" r="1.8" fill="#d8ecc3"/>
    </g>`,
  egg: `
    <g>
      <ellipse cx="20" cy="21" rx="13" ry="16" fill="#fdf6e3" stroke="#d9c48f" stroke-width="2.5"/>
      <circle cx="20" cy="21" r="6.5" fill="#f2a93b"/>
      <circle cx="18" cy="19" r="2" fill="#f8c96e"/>
    </g>`,
  chashu: `
    <g>
      <circle cx="20" cy="20" r="15" fill="#d9a066" stroke="#a06835" stroke-width="2.5"/>
      <path d="M20 20 a9 9 0 0 1 9 9" fill="none" stroke="#b5804a" stroke-width="3" stroke-linecap="round"/>
      <path d="M20 20 a5 5 0 0 0 -5 -5" fill="none" stroke="#b5804a" stroke-width="3" stroke-linecap="round"/>
      <circle cx="20" cy="20" r="15" fill="none" stroke="#f3e0c8" stroke-width="3" stroke-dasharray="6 10"/>
    </g>`,
  shrimp: `
    <g>
      <path d="M10 26 Q8 12 22 10 Q34 9 32 18 Q31 25 22 27 L24 31 Q15 33 10 26 Z"
            fill="#f4926f" stroke="#c25a3a" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M14 24 Q13 16 22 14 M18 26 Q16 19 25 16" fill="none" stroke="#c25a3a" stroke-width="2" stroke-linecap="round"/>
      <path d="M30 12 L36 8 L34 15 Z" fill="#e8744f" stroke="#c25a3a" stroke-width="2" stroke-linejoin="round"/>
    </g>`,
  tuna: `
    <g>
      <path d="M8 14 Q20 8 32 14 L30 28 Q20 32 10 28 Z"
            fill="#e05a6d" stroke="#a83648" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M12 18 Q20 15 28 18 M12 23 Q20 20 28 23" fill="none" stroke="#f4b6bd" stroke-width="2.5" stroke-linecap="round"/>
    </g>`,
};

export function toppingSVG(id, size = 34) {
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">${TOPPING_ART[id] || ''}</svg>`;
}

// --- The bowl ------------------------------------------------------
// Ichiran-style: cream bowl, red rim band. Toppings sit on the broth.

const TOPPING_SLOTS = [
  [50, 34], [76, 40], [26, 40], [50, 52],
];

export function bowlSVG(toppings = [], { size = 100, cooking = false } = {}) {
  const tops = toppings.slice(0, 4).map((id, i) => {
    const [x, y] = TOPPING_SLOTS[i];
    return `<g transform="translate(${x - 14},${y - 14}) scale(0.7)">${TOPPING_ART[id] || ''}</g>`;
  }).join('');
  const steam = cooking ? `
    <g class="steam" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.7">
      <path d="M38 22 q-4 -8 0 -16"/>
      <path d="M52 20 q4 -8 0 -16"/>
      <path d="M66 24 q-4 -8 0 -16"/>
    </g>` : '';
  const noodles = `
    <g stroke="#f0d48a" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.9">
      <path d="M30 40 q10 6 20 0 q10 -6 20 0"/>
      <path d="M32 47 q9 5 18 0 q9 -5 18 0"/>
    </g>`;
  return `<svg viewBox="0 0 100 92" width="${size}" height="${size * 0.92}" aria-hidden="true">
    ${steam}
    <ellipse cx="50" cy="76" rx="34" ry="7" fill="rgba(0,0,0,0.25)"/>
    <path d="M12 38 a38 38 0 0 0 76 0 z" fill="#f6ead3" stroke="#caa87c" stroke-width="2.5"/>
    <path d="M14 46 a36 30 0 0 0 72 0 l-4 0 a32 26 0 0 1 -64 0 z" fill="#c94f42" opacity="0.95"/>
    <ellipse cx="50" cy="38" rx="38" ry="12" fill="#e9c47f" stroke="#caa87c" stroke-width="2.5"/>
    ${noodles}
    ${tops}
  </svg>`;
}

// --- Customers -----------------------------------------------------

const SKIN = ['#f3c89d', '#e7b184', '#c98e5f', '#9c6b42'];
const HAIR_OK = ['#2f2013', '#111418', '#6b4423', '#8c8c8c', '#3d2b52', '#7a3b2e'];
const SHIRT = ['#5b7fa6', '#a65b5b', '#6da34d', '#b58a3c', '#7a5ba6', '#4d8f8f'];

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// mood: 'happy' | 'okay' | 'angry'
export function avatarSVG(seed, mood = 'happy', size = 56) {
  const skin = SKIN[seed % SKIN.length];
  const hair = HAIR_OK[(seed >> 3) % HAIR_OK.length];
  const shirt = SHIRT[(seed >> 6) % SHIRT.length];
  const style = (seed >> 9) % 3; // 0 bowl cut, 1 buns, 2 short spikes

  let hairArt = '';
  if (style === 0) hairArt = `<path d="M14 26 a18 18 0 0 1 36 0 l0 6 q-4 -8 -10 -9 q-8 -2 -16 0 q-6 1 -10 9 z" fill="${hair}"/>`;
  if (style === 1) hairArt = `<path d="M16 27 a16 16 0 0 1 32 0 l0 3 q-16 -9 -32 0 z" fill="${hair}"/>
    <circle cx="13" cy="22" r="6" fill="${hair}"/><circle cx="51" cy="22" r="6" fill="${hair}"/>`;
  if (style === 2) hairArt = `<path d="M15 28 q1 -14 17 -14 q16 0 17 14 q-6 -7 -17 -7 q-11 0 -17 7 z" fill="${hair}"/>`;

  let mouth = `<path d="M26 40 q6 5 12 0" fill="none" stroke="#7a4a2a" stroke-width="2.5" stroke-linecap="round"/>`;
  if (mood === 'okay') mouth = `<path d="M27 41 l10 0" fill="none" stroke="#7a4a2a" stroke-width="2.5" stroke-linecap="round"/>`;
  if (mood === 'angry') mouth = `<path d="M26 43 q6 -5 12 0" fill="none" stroke="#7a4a2a" stroke-width="2.5" stroke-linecap="round"/>`;
  const brows = mood === 'angry'
    ? `<path d="M22 27 l8 3 M42 27 l-8 3" stroke="#3a2716" stroke-width="2.5" stroke-linecap="round"/>` : '';

  return `<svg viewBox="0 0 64 74" width="${size}" height="${size * 1.15}" aria-hidden="true">
    <path d="M10 74 q0 -16 22 -16 q22 0 22 16 z" fill="${shirt}"/>
    <circle cx="32" cy="32" r="19" fill="${skin}"/>
    ${hairArt}
    <circle cx="25" cy="33" r="2.4" fill="#2b1c10"/>
    <circle cx="39" cy="33" r="2.4" fill="#2b1c10"/>
    ${brows}
    ${mouth}
    <circle cx="20" cy="39" r="3" fill="#e88" opacity="${mood === 'happy' ? 0.45 : 0}"/>
    <circle cx="44" cy="39" r="3" fill="#e88" opacity="${mood === 'happy' ? 0.45 : 0}"/>
  </svg>`;
}

// --- Patches -------------------------------------------------------

export function patchSVG(state, size = 76) {
  // state: 'idle' | 'growing' | 'ready' | 'cooldown'
  // A proper garden plot: tilled soil bed + wooden sprout sign,
  // with plants that tell the state at a glance.
  const bed = `
    <ellipse cx="36" cy="45" rx="33" ry="11" fill="#7d573a" stroke="#4a3220" stroke-width="2.5"/>
    <path d="M10 45 q26 7 52 0" stroke="#5f3d22" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.85"/>
    <path d="M15 40.5 q21 6 42 0" stroke="#5f3d22" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>
    <path d="M18 49.5 q18 5 36 0" stroke="#5f3d22" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>`;
  const sign = `
    <g>
      <rect x="66" y="28" width="4.5" height="18" rx="2" fill="#8a5a35" stroke="#4a3220" stroke-width="1.6"/>
      <rect x="59" y="17" width="19" height="13" rx="3.5" fill="#c99a5e" stroke="#4a3220" stroke-width="1.8"/>
      <path d="M68.5 27 l0 -4.5 M68.5 23.5 q-3.4 -0.8 -4 -4.5 M68.5 22.5 q3.4 -0.8 4 -4.5"
        stroke="#4c7a35" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    </g>`;
  let plants = '';
  if (state === 'growing') plants = `
    <g stroke="#6da34d" stroke-width="3" stroke-linecap="round" fill="none">
      <path d="M20 41 l0 -7 M20 36 q-4 -1.5 -5 -6"/>
      <path d="M36 43 l0 -6 M36 39 q4 -1.5 5 -5"/>
      <path d="M50 41 l0 -5 M50 38 q-3.5 -1.5 -4 -5"/>
    </g>`;
  if (state === 'ready') plants = `
    <g stroke-linecap="round" fill="none">
      <circle cx="36" cy="15" r="12" fill="#ffe9a8" opacity="0.4"/>
      <path d="M19 42 l0 -17 M19 31 q-6 -3 -7 -10 M19 27 q6 -3 7 -10" stroke="#5f9e40" stroke-width="4"/>
      <path d="M36 43 l0 -21 M36 29 q-7 -3 -8 -11 M36 24 q7 -3 8 -11" stroke="#74b656" stroke-width="4"/>
      <path d="M52 42 l0 -15 M52 32 q-6 -3 -7 -9 M52 29 q6 -3 7 -9" stroke="#8cc46b" stroke-width="4"/>
    </g>`;
  if (state === 'cooldown') plants = `
    <g stroke="#8a6a45" stroke-width="3" stroke-linecap="round" fill="none">
      <path d="M20 41 l0 -4 M36 43 l0 -4 M50 41 l0 -4"/>
    </g>`;
  return `<svg viewBox="0 0 82 58" width="${size}" height="${size * 0.71}" aria-hidden="true">
    ${bed}${plants}${sign}
  </svg>`;
}

// --- Little decorations -------------------------------------------

export function lanternSVG(size = 26) {
  return `<svg viewBox="0 0 24 34" width="${size}" height="${size * 1.4}" aria-hidden="true">
    <line x1="12" y1="0" x2="12" y2="5" stroke="#3a2716" stroke-width="2"/>
    <rect x="8" y="4" width="8" height="3" rx="1.5" fill="#3a2716"/>
    <ellipse cx="12" cy="17" rx="10" ry="11" fill="#d95f4b"/>
    <ellipse cx="12" cy="17" rx="10" ry="11" fill="none" stroke="#a83a2c" stroke-width="2"/>
    <path d="M6 10 q6 3 12 0 M4.5 17 q7.5 3 15 0 M6 24 q6 3 12 0" stroke="#a83a2c" stroke-width="1.5" fill="none"/>
    <rect x="8" y="27" width="8" height="3" rx="1.5" fill="#3a2716"/>
    <ellipse cx="12" cy="15" rx="5" ry="6" fill="#f2a049" opacity="0.6"/>
  </svg>`;
}

// Premium currency: the Golden Fortune — white 福 on a red medallion
// with a gold rim (replaced the maneki-neko cat after playtest;
// red backdrop + white glyph per Ana's request)
export function fortuneIcon(size = 18) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#d3402f" stroke="#e9b949" stroke-width="1.7"/>
    <circle cx="12" cy="12" r="8.6" fill="none" stroke="#f4c2b5" stroke-width="0.8" opacity="0.55"/>
    <text x="12" y="16.4" text-anchor="middle" font-size="12.5" font-weight="bold" fill="#ffffff"
      font-family="'Hiragino Mincho ProN','Yu Mincho','Songti SC',serif">福</text>
  </svg>`;
}

export function catSVG(size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <path d="M5 8 L7 3 L10 7 Z" fill="#e9b949"/>
    <path d="M19 8 L17 3 L14 7 Z" fill="#e9b949"/>
    <circle cx="12" cy="13" r="9" fill="#e9b949"/>
    <circle cx="9" cy="12" r="1.3" fill="#4a3220"/>
    <circle cx="15" cy="12" r="1.3" fill="#4a3220"/>
    <path d="M10.5 15.5 q1.5 1.5 3 0" stroke="#4a3220" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  </svg>`;
}

export function shootIcon(size = 18) {
  return `<svg viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true">
    <path d="M10 18 l0 -9" stroke="#5f9e40" stroke-width="3" stroke-linecap="round"/>
    <path d="M10 11 q-5 -1 -6 -7 q6 0 6 7 z" fill="#74b656"/>
    <path d="M10 9 q5 -1 6 -7 q-6 0 -6 7 z" fill="#8cc46b"/>
  </svg>`;
}

export function coinIcon(size = 18) {
  return `<svg viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="10" cy="10" r="8.5" fill="#e9b949" stroke="#b58a3c" stroke-width="2"/>
    <text x="10" y="14" text-anchor="middle" font-size="10" font-weight="bold" fill="#8a6420">円</text>
  </svg>`;
}
