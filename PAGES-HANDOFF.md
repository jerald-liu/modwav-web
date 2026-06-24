# Handoff: multi-bar "pages" sequencer feature

Context handed off from a prior session. **Read `CLAUDE.md` first**, then this. The plan below was
scoped and approved by the user; a previous agent completed the prep work (slide removal) but did
**not** start the pages feature itself. The prior agent's line-number references may be stale —
**re-read the current `app.js` / `styles.css` regions before editing** (the repo advanced via other
sessions: there's now a `tests/sequencer.spec.js` suite, spacebar transport, BPM clamp, a
right-click guard, and rescaled circuit-diagram SVG coordinates).

---

## Goal

Add the ability to **double / halve** the sequence length, Elektron-"pages" style but minimal:

- Length is **1, 2, or 4 bars only** (no 3, no odd counts). 1 bar = 16 steps.
- The 4×16 grid **stays visually 16 steps**; it shows the **current bar's** settings.
- **Double** (`×2`): duplicate the current sequence into the new half — copy steps **and all
  per-step parameter locks**. 1→2 makes bar 2 a copy of bar 1; 2→4 makes bars 3–4 a copy of 1–2.
- **Halve** (`÷2`): keep only the first half (1→ keeps bar 1; 4→2 keeps bars 1–2).

### Locked design decisions (from the user)

1. **Export renders the *actual* sequence length** (1/2/4 bars), not always 4. Update the WAV
   render, the MIDI builder, and the "4-bar" wording in the README/export filename. (Today
   `EXPORT_BARS = 4` and export repeats the single bar via `% STEPS` — that repetition logic is
   what changes.)
2. **Playback view: stay on the selected page.** The modal grid does NOT auto-follow the playing
   bar. BUT the **page dots must show two independent states at once**: which bar is being
   *viewed/edited* vs. which bar is *currently playing* (distinct visual cues — e.g. outline =
   viewing, fill/glow = playing; the same dot can show both).
3. **Bottom mini-grid follows the currently *playing* bar** during playback (when stopped, show the
   edit page; the idle marquee only runs while stopped anyway).
4. **Page control = clickable page dots (1…numBars) + `÷2` / `×2` buttons**, buttons disabled at
   the 1 and 4 bounds. Minimal Elektron-style.

---

## Current per-step state (all fixed length 16 today — these become length `16 × numBars`)

In `app.js` (grep the `step sequencer` banner region and the constants near it):

- `pattern[trackId]` for each of kick/snare/hat/acid (on/off per step)
- `ACID_NOTES` (pitch p-lock)
- `ACID_ACCENT` (accent p-lock — currently `const`; make it `let` so length can change)
- `FM_RATIO`, `FM_INDEX` (FM p-locks)

`STEPS = 16` should keep meaning **steps per bar (page size)**. Add `let numBars = 1, currentBar = 0`
and helpers `totalSteps()` (= `STEPS * numBars`) and `absStep(visualIndex)` (= `currentBar*STEPS + visualIndex`).

---

## Approved build order (each step is safe / behavior-neutral until step 4)

1. **State model** — add `numBars` / `currentBar` / `totalSteps()` / `absStep()`; the five arrays
   stay length 16 at `numBars = 1`. No behavior change.
2. **Scheduler** — wrap `currentStep` at `totalSteps()` instead of `STEPS` (`schedulerLoop`).
   Identical at 1 bar. (Note: the prior session already removed the slide "prev-step" wrap, so
   there's no `(stepIndex - 1 + STEPS) % STEPS` left to fix.)
3. **`renderPage()`** — re-sync the 16 visual buttons (on/off class + acid note label) from the
   absolute indices for `currentBar`. Point the existing step toggle / acid pitch-drag / FM-popup
   handlers at `absStep(s)` instead of the captured visual `s`. The buttons capture their visual
   index `s` (0–15) in closures; keep that and compute `absStep` at event time. Identical at 1 bar.
4. **Length control** — page dots + `÷2`/`×2` (HTML in `index.html`, CSS in `styles.css`, logic in
   `app.js`). Double = `arr = arr.concat(arr)` on all five arrays; halve = `arr = arr.slice(0, len/2)`.
   Disable `÷2` at 1 bar and `×2` at 4 bars. *(First visible behavior.)*
5. **Playhead** — modal grid lights only when the playing step is on the displayed page
   (`Math.floor(currentStep / STEPS) === currentBar`); page dots reflect viewing vs playing.
6. **Bottom mini-grid** — follow the playing bar during playback; the marquee's
   `restoreBarFromPattern` must restore the correct page's slice.
7. **Export + MIDI** — render real `numBars`; update "4-bar" wording + filename.
8. **Tests** — add coverage (double → 2 dots / halve → back to 1 / no console errors), run
   `npm test`, verify both viewports, then commit.

The prior agent suggested **one focused commit at the end** (after tests + visual verification on
mobile and desktop) rather than micro-commits — confirm the user's preference.

---

## Integration points & risks against CURRENT code (verify, don't trust line numbers)

- **`tests/sequencer.spec.js` selects acid steps by `data-step="0"`** (e.g.
  `.step.step-pitch[data-track="acid"][data-step="0"]`). If you change what `data-step` means or
  make it page-relative, **these selectors must still resolve on the default 1-bar view** — keep
  `data-step` as the visual 0–15 index so existing tests pass unchanged.
- **11 tests currently pass** (smoke + sequencer). Pages work must keep them green; spacebar
  transport, BPM clamp, mute/solo, right-click guard, FM popup are all asserted.
- **Audio index audit** is the main risk: confirm every `% STEPS` / `% ACID_NOTES.length` /
  `% ACID_ACCENT.length` still indexes correctly once arrays are length `totalSteps()`. With
  full-length arrays the `% length` becomes an identity, but double-check each voice + the export
  loop (`renderLoop` uses `sIdx = step % STEPS` — that becomes `step % totalSteps()` or just `step`).
- **Bottom mini-grid + marquee**: `renderMarqueeFrame` / `restoreBarFromPattern` (grep
  `idle MOD.WAV marquee` banner) assume a single 16-step bar. Make restore page-aware.
- **Circuit-diagram SVG** coordinates were rescaled by other sessions — irrelevant to pages, just
  don't be surprised by unfamiliar numbers.

## Already done (do NOT redo)

- **Acid pitch-slide (glide) was fully removed** (commit `188f250`): the `sliding` param is gone
  from `playAcid`/`playFM`, both glide branches and all `acidLastFreq` state are deleted, and the
  voice signature is now `playAcid(ctx, t, stepIndex, dest)`. No test asserted slide.

## Workflow reminders (also in CLAUDE.md)

- **Run `npm test` before committing** any change to `index.html` / `styles.css` / `app.js`. Must pass.
- **Don't use agentic Chrome / computer-use** to verify — Playwright is the path; preview server +
  screenshots are fine for iterating, but `npm test` is the gate. Check mobile + desktop (720px flip).
- Push to main directly; end commits with the `Co-Authored-By` trailer.
