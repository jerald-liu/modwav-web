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

- **Zero-build, single static file.** Everything lives in `index.html` (HTML + inline CSS + JS).
  No bundler, no framework, **no runtime dependencies** — the WAV/ZIP/CRC32/MIDI export is
  hand-rolled on purpose. Keep it dependency-free.
- **Deploy:** GitHub Pages serves `main` branch root. Merging/pushing to `main` publishes live
  at https://jerald-liu.github.io/modwav-web/ (~30s rebuild).
- **Audio:** voice functions take an explicit `AudioContext` first arg — `playKick(ctx, t, dest)`,
  `playAcid(ctx, t, stepIndex, sliding, dest)`, etc. — so the same code renders live and in an
  `OfflineAudioContext` for export. Preserve this signature.
- **Circuit background** is a hand-placed inline `<svg>` (coordinates are manual). Editing it
  means moving real numbers; there's no generator.
- `index.html` is large (~2,800 lines). A future split into `index.html` + `styles.css` +
  `app.js` is on the table to cut read cost — not done yet.

## Workflow

- **Push to main directly.** Commit and push straight to main; no PR/branch unless asked.
- **Verify in preview before committing visual changes** — use the preview server and screenshot.
  **Always check both mobile and desktop** (the 720px breakpoint flips layout); they diverge often.
- End commit messages with the standard `Co-Authored-By` trailer.
- *Considering:* lightweight headless-browser (Playwright) smoke tests for mobile+desktop so
  visual verification isn't manual every time. Not set up yet — adds dev-only tooling (no runtime
  dep impact). Propose before building.
