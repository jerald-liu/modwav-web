# mod.wav

Site for **Mod.wav**, a hardware-centric performance + workshop night in San Francisco.

Live: https://jerald-liu.github.io/modwav-web/

## What's in the repo

A single static `index.html` — content, styles, and the interactive synth all in one file. No build step.

The synth is a four-track step sequencer (kick / snare / hat / acid) with:
- Per-step pitch lock on the acid line (drag a step vertically to retune)
- Per-track delay + reverb sends
- Draggable / editable BPM control (60–180)
- Global delay and reverb buses with feedback delay and a synthetic impulse response

Drum voices are modeled on the 909 (oscillator + envelope, not samples). Acid is a sawtooth into a resonant lowpass with per-step accent + auto-slide on consecutive active steps.

## Local dev

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

`file://` works for most things but Web Audio is happier over `http://`.

## Smoke tests

Dev-only [Playwright](https://playwright.dev) smoke tests guard against regressions
(console errors on load, the bottom-bar grid + oscilloscope not rendering, the
sequencer modal not opening). They run at 375px (mobile) and 1280px (desktop) since
the 720px breakpoint flips layout. **These deps live in `devDependencies` only — the
shipped `index.html` stays zero-dependency.**

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
