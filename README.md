# mod.wav

Site for **Mod.wav**, a hardware-centric performance + workshop night in San Francisco.

Live: https://jerald-liu.github.io/modwav-web/

## What's in the repo

Three static files, served as-is — `index.html` (markup + the inline circuit SVG), `styles.css`, and `app.js`. No build step, no framework, no runtime dependencies.

The synth is a four-track step sequencer (kick / snare / hat / acid) with:
- Multi-bar pages: 1 / 2 / 4 bars (÷2 / ×2), with live length changes deferred to the next bar boundary
- Per-step pitch lock on the acid line (drag a step vertically to retune)
- An FM instrument option on the acid track (per-step ratio / index via a popup)
- Per-track delay + reverb send knobs
- Draggable / editable BPM control (60–180)
- Global delay and reverb return buses with feedback delay and a synthetic impulse response — right-click the FX bus knobs for internal params (FB/TIME/TONE, SIZE/DECAY)

Drum voices are modeled on the 909 (oscillator + envelope, not samples). Acid is a sawtooth into a resonant lowpass with per-step accent and pitch.

## Local dev

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

`file://` works for most things but Web Audio is happier over `http://`.

## Smoke tests

Dev-only [Playwright](https://playwright.dev) smoke tests guard against regressions.
Two specs:
- `tests/smoke.spec.js` — load/render: console errors on load, the bottom-bar grid +
  oscilloscope rendering, the sequencer modal opening. Runs at 375px (mobile) and
  1280px (desktop) since the 720px breakpoint flips layout.
- `tests/sequencer.spec.js` — sequencer interactions, each guarding a specific snag
  from development: step toggle + bottom-bar mirror, acid pitch-drag axis lock
  (tap/vertical/horizontal), right-click never toggling a step, FM-popup gating,
  spacebar transport (no page scroll, ignored while editing BPM), play-state sync,
  mute/solo/unmute-all, BPM clamping, multi-bar pages (÷2/×2 bounded buttons,
  per-bar edits, stop→play always restarts at bar 1, mini-grid follows the
  playhead not the viewed bar), live mid-play halve queues + applies at the
  next bar boundary, and the FX bus right-click popups (defaults render and
  the popup stays inside the modal — guards a `body { zoom: 1.25 }` overflow
  bug class).

**These deps live in `devDependencies` only — the shipped site stays zero-dependency.**

```sh
npm install                      # one-time
npx playwright install chromium  # one-time, fetches the browser
npm test
```

The config auto-starts `python3 -m http.server` and tears it down. Screenshots
(landing + open modal, both viewports) land in `test-results/`.

## Deploy

Pushes to `main` auto-deploy via GitHub Pages (source: `main` / root). Wait ~1 minute after pushing.

Check build status:

```sh
gh api repos/jerald-liu/modwav-web/pages/builds/latest -q '.status'
```
