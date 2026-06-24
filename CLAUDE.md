# Mod.wav

A single-page site for **Mod.wav** — an SF community hardware/synth jam ("Patch & Play").
It's both an event page and a playable artifact: a built-in 4-track / 16-step sequencer
with a drum + acid voice, FX, and offline export to WAV stems / full mix / MIDI.

---

## Philosophy (internal — never quote this in site copy)

These ideas drive design and product decisions. They are the *why*. They must never
appear as literal text on the page — stated outright they read as over-earnest. Let them
show through choices, not words.

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
  `playAcid(ctx, t, stepIndex, sliding, dest)`, etc. — so the same code renders live and in an
  `OfflineAudioContext` for export. Preserve this signature.
- **Circuit background** is a hand-placed inline `<svg>` in `index.html` (coordinates are manual).
  Editing it means moving real numbers; there's no generator.

## Navigating the code (read before searching)

`app.js` and `styles.css` are sectioned with `/* ---- name ---- */` banners. **Grep the banners
for a live table of contents instead of scanning a whole file** — e.g. `grep -n '/\* -' app.js`
gives every section with current line numbers (self-updating, never stale). Then read just that
section's ~80-line region.

Concept → banner (search the banner string, not a line number — line numbers drift):
- Stem / mix / MIDI export, WAV/ZIP/CRC32 codecs → `app.js` `export: 4-bar stems + mix + MIDI`
- Step toggling, acid pitch-drag, mute/solo, pattern state → `app.js` `step sequencer`
- Idle MOD.WAV pixel marquee on the bottom-bar grid → `app.js` `idle MOD.WAV marquee`
- Play/stop transport (`setPlayingState`) → `app.js`, just above the `idle MOD.WAV marquee` banner
- Modal open/close → `app.js` `modal open/close`
- Per-step FM parameter popup → `app.js` `FM per-step popup`
- Oscilloscope / waveform draw + `resizeCanvas` → `app.js` `oscilloscope draw`
- Bottom bar + grid styles → `styles.css` `floating bottom bar`
- Sequencer modal / panel styles → `styles.css` `synth modal`, `synth panel (inside modal)`
- Hero, nav, sections, layout → `styles.css` `hero` / `nav` / `sections` / `layout shells`

**Keep banners and their associated code intact — this is a token-cost guideline, not just style.**
The whole point of the sectioning is to bound how much an agent has to read. So:
- Don't rename or churn banners casually; the concept→banner map above and muscle-memory greps
  depend on stable names. A rename forces re-reading to re-find things (token-heavy drift).
- Keep a behavior's code under its existing banner rather than scattering it; prefer editing in
  place over relocating code across sections (relocation = large diffs + re-verification).
- Only add a *new* banner when introducing a genuinely new behavior — then add one line to the
  concept map above in the same commit.

## Workflow

- **You MUST run the smoke tests before committing any change to `index.html`, `styles.css`,
  or `app.js`.** Run `npm test` (one-time setup: `npm install && npx playwright install chromium`).
  All tests must pass before you commit. They cover both viewports, guard against console errors
  (a stray null lookup once silently halted all JS), and confirm the sequencer grid + scope render
  and the modal opens. If a change legitimately alters behavior the tests assert, update the tests
  in the same commit — never delete an assertion to make it pass.
- **Do NOT use agentic Chrome / browser-automation integrations** (e.g. claude-in-chrome,
  computer-use) for verifying this site. The Playwright smoke tests are the verification path and
  should suffice. Only reach for a live browser integration if the smoke-test framework genuinely
  can't express what's being checked — and if that happens, prefer adding a Playwright assertion.
- The preview server + screenshots are fine for *iterating* on visuals, but `npm test` is the
  gate before commit. **Always check both mobile and desktop** (the 720px breakpoint flips layout).
- **Push to main directly.** Commit and push straight to main; no PR/branch unless asked.
- End commit messages with the standard `Co-Authored-By` trailer.
