# Planned features: swing, ADSR scaling, master limiter

Paused mid-spec; resuming this means **reading `CLAUDE.md` first**, then this file. All
decisions below were confirmed by the user — don't re-litigate. Line-number references
may be stale; re-read current code regions before editing.

## Build order (each independent, ~30 min)

1. **Master limiter** — 4-line diff, no UI, no state. Land first so its headroom
   protection is in place before the other two start exercising the graph harder.
2. **Swing** — knob next to BPM, single scheduler line.
3. **ADSR scaling** — knob next to SWING, mechanical sweep across voice funcs.

---

## Feature 1 — Global swing

**What it does.** Delay every weak 16th (odd `currentStep`) by a fraction of a step.
50% = no swing (default), 75% = max shuffle/triplet. Bar duration stays exactly
the same (only trigger times shift), so it composes cleanly with pages / halve-double
/ tempo-locked delay time.

**State.** `let swingPct = 50;` at the top of the step-sequencer section. Add to
`saveStateNow()` blob, `loadState()` parse, and the tail sync block.

**Scheduler change** — one line in `schedulerLoop()` (grep `function schedulerLoop`):
```js
const swingOffset = (currentStep % 2) * (swingPct - 50) / 100 * STEP_SECONDS;
scheduleStep(currentStep, nextStepTime + swingOffset);
nextStepTime += STEP_SECONDS;   // pacing unchanged
```

**UI (locked).** New knob next to the BPM pill in `.ctrl-row` (the row containing
`#synthToggle` + `.tempo-ctrl`). Labelled `SWING` with a `%` value display, same
visual treatment as the existing knobs (use `makeKnob`). Stash the knob ref so
randomize can drive it.

**Randomize.** Add `swing` leaf to `RND_TREE` (random 50–75 int).

**Test.** Smoke check: open modal → swing knob exists, has default 50, can be
dragged via simulated pointer.

---

## Feature 2 — Global ADSR-time scaling

**Clarification.** The "1024 controls" math in the original ask describes per-step
ADSR — that's a much larger feature for later. This is **one global multiplier**
that scales the envelope time-literals already baked into the voice functions.
Fan-out is trivial: ~25 multiplications per voice trigger total. No caching needed.

**State.** `let adsrScale = 0;` (0% = no change, 100% = max stretch). Add to
persistence + tail sync.

**Helper:**
```js
const ENV_MAX_MULT = 5;                                       // 100% = 5× as slow
const envMult = () => 1 + (adsrScale / 100) * (ENV_MAX_MULT - 1);
```

**Voice-function edits** — the only invasive part. Every time-literal in
`playKick`/`playSnare`/`playHat`/`playAcid`/`playFM` gets `* envMult()`:
```js
osc.frequency.exponentialRampToValueAtTime(106.8, t + 0.001 * envMult());
gain.gain.linearRampToValueAtTime(0,            t + 0.18  * envMult());
```
Mechanical, ~25 sites. Re-read each voice fn end-to-end and apply.

**Scope (locked).** A/D/R time-literals only.
- **Sustain stays untouched** (it's a level, not a time).
- **Step-relative stop times in `playFM`** (`STEP_SECONDS * 2`) **stay untouched** —
  multiplying them risks notes bleeding into the next step at high scaling.

**UI (locked).** New knob in `.ctrl-row` alongside SWING. Layout: `[▶] [BPM 140] [SWING] [ADSR]`.

**Randomize.** Add `adsr` leaf to `RND_TREE` (random 0–100 int).

**Test.** Smoke check: knob exists, default 0, can be dragged.

---

## Feature 3 — Master limiter

**Spec.** Soft clip · -6 dBFS ceiling · true-peak safe · invisible · fixed.

**Implementation.** One `WaveShaperNode` with a tanh curve + `oversample: '4x'`
(this is THE true-peak guarantee — the node oversamples internally before
applying the curve, so inter-sample peaks get caught). No `DynamicsCompressorNode`
even at extreme settings — it leaks true peaks.

```js
function makeLimiterCurve(){
  const n = 8192;
  const curve = new Float32Array(n);
  const ceiling = 0.5; // -6 dB linear
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ceiling * Math.tanh(x);
  }
  return curve;
}
function makeMasterLimiter(audioCtx){
  const ws = audioCtx.createWaveShaper();
  ws.curve = makeLimiterCurve();
  ws.oversample = '4x';
  return ws;
}
```

**Routing edit — two sites, two lines each.**

`ensureAudio()` — replace:
```js
analyser.connect(ctx.destination);
```
with:
```js
const limiter = makeMasterLimiter(ctx);
analyser.connect(limiter);
limiter.connect(ctx.destination);
```

`buildOfflineGraph()` — same shape: insert limiter between `master` and
`octx.destination`, and also between `delayReturn`/`reverbReturn` and the
destination (those connect directly to destination today — they need to route
through the limiter too, otherwise the limiter only catches the dry signal).

**State / UI / persistence / randomize / test:** none. Invisible by definition.
Optional smoke check: `OfflineAudioContext` render of a hot pattern → peak ≤ 0.5.

---

## Cross-cutting touch points (do these in one pass per feature)

| | Swing | ADSR | Limiter |
|---|---|---|---|
| New state var | `swingPct` | `adsrScale` | — |
| `saveStateNow` / `loadState` | +1 line each | +1 line each | — |
| Tail sync block | knob.setValue | knob.setValue | — |
| `RND_TREE` leaf | `swing` | `adsr` | — |
| `ctrl-row` knob in `index.html` | ✓ | ✓ | — |
| Voice func edits | — | ~25 sites | — |
| Scheduler edit | 1 line | — | — |
| Audio graph edit | — | — | 2 sites |
| Smoke test | knob present, default | knob present, default | offline peak ≤ 0.5 (optional) |

## Already done in this repo (do NOT redo)

- Knob component (`makeKnob`) exposes `setValue` on the returned element so
  randomize / loadState can drive angles from outside.
- Persistence is rAF-coalesced + flushed on `pagehide`/`visibilitychange`.
  Adding `swingPct`/`adsrScale` is a one-line addition each to both
  `saveStateNow` and `loadState`.
- Randomize is data-driven from `RND_TREE`. Adding a leaf = appending one
  array entry with `{ id, label, apply: () => ... }`.

## Workflow reminders (from CLAUDE.md)

- **Run `npm test` before committing.** Currently 19 tests; persistence + randomize
  tests would catch regressions on these new params if `saveStateNow`/`loadState`
  is forgotten.
- **Preview server + screenshots fine for iterating; `npm test` is the commit gate.**
- **Push to main directly.** End commits with the `Co-Authored-By` trailer.
