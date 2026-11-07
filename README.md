# Splash Slide Race

An original 2D water-slide racing game. Steer down a winding slide against a
crowd of rivals, hug the walls for a speed boost, shove rivals off the edge,
and — if you fall off — land on a lower section and skip ahead.

Everything in this game is original: the title, the racer names, the
procedurally drawn canvas art, and the synthesized WebAudio music and sound
effects. No copied art, code, names, characters, or assets from any existing
game; no external assets and no network needed.

## How to play

- **Steer:** drag with mouse/touch, move the mouse over the slide, or use
  ← / → (A / D).
- **Wall ride:** hug the slide wall for a speed boost (spray flies).
- **Shove:** steer into a rival to push them sideways. Shove one clean off
  the edge and they tumble behind you. +50 pts.
- **Shortcut:** fall off the edge and you land on a lower section, skipping
  140 m ahead — but you lose speed and get stunned, so it's a gamble.
- **Starfish:** grab the orange starfish on the slide for +100 pts.
- **Advance:** finish in the **top 3** to unlock the next race.
  1st = 3 stars, 2nd = 2, 3rd = 1. You get 3 attempts per race.
- **Pause:** the `II` button, `P`, or `Esc`. **Mute:** the `SOUND` button or `M`.

## Races (20)

| Races | Slide | Rivals |
| --- | --- | --- |
| 1–5 | Wide, gentle bends | 4–6 |
| 6–10 | Twistier, narrower | 6–8 |
| 11–15 | Sharp S-bends, narrow | 8–10 |
| 16–20 | Tightest, narrowest, fastest | 11–12 |

Slide length grows from ~1,790 m (race 1) to ~3,500 m (race 20); width
shrinks from 173 px to 116 px; rival speed and rubber-banding rise too.
Progress (unlocked races, stars, best score) is saved in `localStorage`.

## Run it

Open `index.html` in any modern browser — desktop or mobile. That's it:
a single self-contained file, plain HTML5 + vanilla JS + Canvas, no build
step, no server, no network.

```sh
# or serve it locally, e.g.:
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

## Files

- `index.html` — the whole game (markup, styles, logic, audio).
- `test.js` — headless Playwright test (real mouse clicks + real steering).
- `test-shots/` — screenshots captured by the test run.
- `test-run-6.log` — full output of the latest (clean, 37/37) test run.

## Implementation notes

- **Loop:** `requestAnimationFrame` drives the game on real devices, with a
  50 ms watchdog timer that also steps the game if `rAF` is starved (e.g.
  under software rendering), so game time always tracks wall-clock time.
  Physics is sub-stepped (≤ 1/30 s per step) so large frame gaps never
  tunnel through collisions or pickups.
- **Audio:** all sound is synthesized with WebAudio — a bouncy pentatonic
  melody + bass loop composed for this game, plus splash/shove/pickup/
  shortcut/win/lose effects. No audio files, no copyrighted music.
- **Art:** every sprite is drawn procedurally on canvas (rings, swim caps,
  palm trees, starfish, chevrons, checkered finish line). No images.
- **Debug hook:** `window.__splashSlideRace()` returns read-only state
  (screen, level, progress, rank, score, shoves, shortcuts, …) used by the
  automated test. It exposes state only — no cheats or skips.

## Test results

Headless test (`test.js`, Playwright + headless Chromium, real mouse clicks
and real held-key steering — no scripted state jumps) run Nov 6, 2026.
Full log: `test-run-6.log`; screenshots in `test-shots/`.

- **37/37 checks passed, 0 page/console errors.**
- Loads to the menu; how-to overlay opens/closes; race-select grid opens;
  PLAY starts race 1 with 4 rivals.
- Race 1 cleared top-3 on real steering (shoves 8, shortcuts 1, starfish 2);
  NEXT advances to race 2; pause/resume and mute on/off all verified.
- **All 20 races cleared** (3 stars each), final score 46,410, WIN screen
  ("SLIDE CHAMPION!") reached, and RACE AGAIN restarts at race 1.
- Mechanics totals across the 20-race playthrough: **357 shoves, 19
  shortcut falls** — the shove and shortcut mechanics fire constantly in
  real play, not just in theory.
- Screenshots verified by eye: menu, race select, race 1, race-1 clear,
  race-20 clear, win screen (see `test-shots/01-menu.png`,
  `02-levels.png`, `03-race1.png`, `05-clear1.png`, `09-clear20.png`,
  `10-win.png`).

Environment notes (honest): this VM's headless Chromium throttles
`requestAnimationFrame` to ~0.3 fps under SwiftShader, so the game loop
has a watchdog timer that also steps the game when `rAF` starves, with
physics sub-stepped so game time tracks wall-clock time. The test also
waits for a quiet moment (free memory / load) before launching, and
retries the whole run if the browser is killed — during development the
browser was repeatedly OOM-killed by sibling agents' concurrent browser
tests (load 30+, ~200 MB free). Two real bugs were caught and fixed by
the probes: (1) the rival wander clamp was undoing every shove, so no
rival could ever fall off (contacts fired, 0 falls); (2) keyboard
steering could drive the player off the edge unintentionally, so it now
clamps to a safe wall-ride while pointer/touch can still risk the edge
for a shortcut.
