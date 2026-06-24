# Mod.wav

A single-page site for **Mod.wav** — an SF community hardware/synth jam ("Patch & Play").
It's both an event page and a playable artifact: a built-in 4-track / 16-step sequencer
with a drum + acid voice, FX, and offline export to WAV stems / full mix / MIDI.

---

## Philosophy (internal — never quote this in site copy)

The *why* behind design/product decisions. Never put these as literal text on the page —
stated outright they read as over-earnest. Let them show through choices, not words.

- **Creativity is treated as sacred.** Expectations for the event are firm, but framed so
  people are *excited* to be part of it — never gatekept, never a chore.
- **No "brilliant assholes."** The space is for the genuinely curious and generous, not
  self-promoters. Copy and framing should quietly select for that.
- **Invert the stage** (literal and figurative): anyone curious is included. The barrier
  between performer and audience is intentionally low.
- **The built-in synth is an invitation, not a pitch.** It encourages people into synthesis
  by giving them the *choice* to explore — never thrusting it on them. Building and sharing
  a usable instrument on the page is itself a meta-demonstration of the event's act:
  create, then share.
- **Artifacts of creative gestures.** A visitor can make a pattern and download MIDI + audio
  stems to carry into a DAW and keep creating. The site is a starting point, not an endpoint.
- **Benevolent technology.** Tech is present but never intimidating — it's there to help you.
  The blurred circuit diagram represents components of a larger, benevolent system; it maps
  directly to the real sequencer (what it would be as physical electronics) and to the tools
  underlying modern music-making. The blur says "part of a bigger picture," not "blueprint."

## Visual language

- Raw, minimal, DIY — not corporate-slick. Light font weights, no heavy boxing, generous space.
- Pixel / CRT / zine texture: VT323 + Silkscreen for display type; JetBrains Mono for system text.
  Italic Arial Narrow for the "Mod.wav presents:" preamble as a typographic counterweight.
- Hardware/analog references are load-bearing, not decorative: the scrolling circuit schematic,
  the sequencer, the glowing oscilloscope waveform. They carry meaning (see Philosophy).
- Technology rendered as approachable, not as a flex. When adding visuals, borrow from this —
  represent the system in a way that helps and invites rather than intimidates.

## Copy / voice

- Firm on what the event is; warm and exciting in how it's said.
- Community-first and simple. Explain what something is without over-explaining it.
- Understated, never markety, never waxing poetic. No direct references to the philosophy above.

---

## Scope / direction

The site is an evolving creative space, not a fixed landing page. Treat it as something that
will be extended in undefined creative directions — don't assume "just an event page."

Known intent (not yet built):
- Booking artists, and featuring residents / volunteers.
- Their bios should be **personalized** — demonstrating care and mindfulness, with per-person
  UX/UI choices that represent each individual respectfully rather than a uniform template.

---

## Tech & constraints

- **Zero-build, no framework, no runtime dependencies.** The site ships three static files:
  `index.html` (markup + the inline circuit `<svg>`), `styles.css`, and `app.js` (linked via
  `<link>` and `<script src="app.js" defer>`). No bundler — the browser loads them directly.
  The WAV/ZIP/CRC32/MIDI export is hand-rolled on purpose. Keep the shipped site dependency-free.
  (The Playwright tooling in `package.json` is dev-only and never served — see Workflow.)
- **Deploy:** GitHub Pages serves `main` branch root. Merging/pushing to `main` publishes live
  at https://jerald-liu.github.io/modwav-web/ (~30s rebuild).
- **Audio:** voice functions take an explicit `AudioContext` first arg — `playKick(ctx, t, dest)`,
  `playAcid(ctx, t, stepIndex, dest)`, etc. — so the same code renders live and in an
  `OfflineAudioContext` for export. Preserve this signature.
- **Circuit background** is a hand-placed inline `<svg>` in `index.html` (coordinates are manual).
  Editing it means moving real numbers; there's no generator.

## Navigating the code (before reading whole files)

`app.js` and `styles.css` use `/* ---- name ---- */` banners. Grep them for a live, never-stale
ToC — `grep -n '/\* -' app.js` — then read only that ~80-line region. Search the banner *name*,
never a line number (they drift). Fuzzy → banner:
- export / WAV / ZIP / MIDI → `app.js` `export: stems`
- step toggle, acid pitch-drag, mute/solo, pattern state → `app.js` `step sequencer`
- multi-bar pages (1/2/4, page dots, ÷2/×2) → `app.js` `pages:`; per-step arrays grow to `STEPS * numBars`
- bottom-grid pixel marquee → `app.js` `idle MOD.WAV marquee`; play/stop (`setPlayingState`) sits just above it
- modal open/close → `app.js` `modal open/close`; FM popup → `FM per-step popup`; waveform/`resizeCanvas` → `oscilloscope draw`
- bottom-bar CSS → `styles.css` `floating bottom bar`; modal CSS → `synth modal` / `synth panel`; page CSS → `hero` / `nav` / `sections` / `layout shells`

**Keep banners + their code stable (token-cost, not style):** don't rename/churn banners or scatter
a behavior across sections — both force re-reading and big diffs. Add a new banner only for genuinely
new behavior, updating the map above in the same commit.

## Workflow

- **Run `npm test` before committing any change to `index.html` / `styles.css` / `app.js`** (one-time:
  `npm install && npx playwright install chromium`). Must pass. Covers both viewports, a console-error
  guard (a stray null lookup once silently halted all JS), and modal/grid/scope render. If a change
  legitimately alters asserted behavior, update the test in the same commit — never delete an assertion to pass.
- **Don't use agentic Chrome / computer-use to verify this site** — Playwright is the path. Only if it
  genuinely can't express the check, and then prefer adding an assertion. Preview server + screenshots
  are fine for *iterating*; `npm test` is the commit gate. Always check mobile + desktop (720px flips layout).
- **Push to main directly** (no PR/branch unless asked). End commit messages with the `Co-Authored-By` trailer.
