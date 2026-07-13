# Ana's Ramen Shop — Phase 1 prototype

A mobile-first web prototype of the time-management ramen game from
`anas_ramen_shop_final_spec_v3` — Phase 1 scope (core loop §4 + shoot
economy §5 + the pinch §5.3–5.4), playable on phone and desktop.

Pure static site: no build step, no dependencies.

## Run locally

Any static server works:

```bash
python3 -m http.server 4174
# open http://localhost:4174
```

(ES modules don't load over `file://`, so a server is required.)

## What's in

- Drag-and-drop bowl assembly with no undo; mismatched bowls go to the Day-Old Shelf
- Customer queue with patience meters and moods; streak bonus (+2%/bowl to +30%)
- Green Shoot energy: wallet (cap 60) + bonus inbox, regen (1/4 min), Sunlight & Return
  patches — retuned 2026-07-13 so an active session runs ~30 min before the wall
- Serve juice: coins fly to the gold counter, synthesized ca-ching (🔊 toggle in header)
- Pantry placards: tap to stock, drag to top a bowl
- Pause (⏸ in header): freezes patience/cooks/arrivals/shelf; garden and regen keep
  growing; a paused shift never auto-ends
- Pantry stocking (shoots → ingredient stock, cap 8/each)
- The Pyramid order mix: 70/25/5 tier weights per slot, 30/45/25 topping counts
- Generalized mercy rule: ≥40% of the queue is always serveable
- Ingredient unlocks (egg → chashu → shrimp → tuna) as the difficulty ramp
- Maneki-Neko pinch tools: 12-shoot refill, instant cook, patch skip (no IAP; 5 granted)
- Session interruption handling (pause under 30 min away, auto-end shift beyond)
- LiveOps dev panel (⚙ top right): live dials, Midnight Festival order-mix inversion
  (20/30/50, pay ×1.5), cheats, session stats (watch avg shoots/bowl → ~2.7), telemetry tail

## Where the numbers live

All balance values are in [`js/dials.js`](js/dials.js) — the "remote config
skeleton" from spec §15.2. Nothing is hardcoded in game logic. Values marked
`DESIGNER` were chosen during this build and are documented in the spec's
v3.1 addendum.
