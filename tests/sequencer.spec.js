// E2E smoke tests for sequencer behavior.
// Each test guards a specific snag we hit while building the sequencer
// (commit hashes noted). DOM-observable behavior only — audio routing,
// iOS unlock, touch-hover CSS, and FM-slide scheduling aren't checked here
// because they can't be observed reliably in headless Chromium.
// Run: npm test  (one-time: npx playwright install chromium)
const { test, expect } = require('@playwright/test');

// Desktop viewport: the acid row isn't horizontally scrolled, so pointer-drag
// math is stable.
test.use({ viewport: { width: 1280, height: 800 } });

const ON = /\bon\b/;
const ACTIVE = /\bactive\b/;
const LIVE = /\blive\b/;

async function open(page) {
  await page.goto('/index.html', { waitUntil: 'networkidle' });
  // open the modal via the floating synth bar (avoid the play button at 5,5)
  await page.locator('#synthBar').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#synthOverlay')).toHaveClass(/\bopen\b/);
  await expect(page.locator('#seq .step').first()).toBeVisible();
}

const hasOn = (loc) => loc.evaluate((el) => el.classList.contains('on'));

// 1 — step toggle mirrors to the bottom-bar grid (app.js toggleStep, :257)
test('clicking a step toggles it and mirrors to the bottom bar', async ({ page }) => {
  await open(page);
  const step = page.locator('.step[data-track="kick"][data-step="1"]');
  const mirror = page.locator('.bar-step[data-track="kick"][data-step="1"]');
  const before = await hasOn(step);
  await step.click();
  await expect.poll(() => hasOn(step)).toBe(!before);
  expect(await hasOn(mirror)).toBe(!before);
});

// 2 — acid pitch-drag axis lock (2b3363e): tap toggles, vertical drag retunes,
// horizontal drag neither retunes nor toggles (it hands off to row scroll).
test('acid step: tap toggles, vertical drag retunes, horizontal drag does neither', async ({ page }) => {
  await open(page);
  const step = page.locator('.step.step-pitch[data-track="acid"][data-step="0"]');
  const note = step.locator('.note-name');
  const box = await step.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // tap (no movement) → toggles on/off
  const beforeOn = await hasOn(step);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => hasOn(step)).toBe(!beforeOn);

  // vertical drag up → note changes (and does not toggle the step)
  const onAfterTap = await hasOn(step);
  const noteBefore = await note.textContent();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 24, { steps: 6 });
  await page.mouse.up();
  await expect(note).not.toHaveText(noteBefore);
  expect(await hasOn(step)).toBe(onAfterTap); // drag didn't toggle

  // horizontal drag → note unchanged AND step not toggled
  const noteAfterDrag = await note.textContent();
  const onBeforeHoriz = await hasOn(step);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 48, cy, { steps: 6 });
  await page.mouse.up();
  await expect(note).toHaveText(noteAfterDrag);
  expect(await hasOn(step)).toBe(onBeforeHoriz);
});

// 3 — right-click never toggles an acid step, in either instrument mode
// (1c08031 guarded pointerdown; the pointerup guard finished the job).
test('right-click never toggles an acid step (ACID + FM modes)', async ({ page }) => {
  await open(page);
  const acidStep = page.locator('.step.step-pitch[data-track="acid"][data-step="0"]');
  const fmBtn = page.locator('.inst-btn').nth(1);

  // ACID selected (default): right-click must not flip the step.
  const onBefore = await hasOn(acidStep);
  await acidStep.click({ button: 'right' });
  expect(await hasOn(acidStep)).toBe(onBefore);

  // FM selected: right-click opens the popup but still must not flip the step.
  await fmBtn.click();
  await acidStep.click({ button: 'right' });
  expect(await hasOn(acidStep)).toBe(onBefore);
});

// 4 — FM popup is gated to FM mode and closes on switch back to ACID (bd1d728).
test('FM popup: hidden in ACID mode, opens in FM mode, closes on switch back', async ({ page }) => {
  await open(page);
  const acidStep = page.locator('.step.step-pitch[data-track="acid"][data-step="0"]');
  const popup = page.locator('#fmPopup');
  const acidBtn = page.locator('.inst-btn').nth(0);
  const fmBtn = page.locator('.inst-btn').nth(1);

  // ACID mode: right-click does NOT open the popup.
  await acidStep.click({ button: 'right' });
  await expect(popup).toBeHidden();

  // FM mode: right-click opens it.
  await fmBtn.click();
  await acidStep.click({ button: 'right' });
  await expect(popup).toBeVisible();

  // switching back to ACID closes it. Dispatch directly: the open popup
  // overlaps the ACID button, and we're testing the handler, not the hit-test.
  await acidBtn.dispatchEvent('click');
  await expect(popup).toBeHidden();
});

// 5 — spacebar toggles transport, prevents page scroll, ignored while editing BPM
// (82ee9bd, f3d3d8f, document-level capture guard)
test('spacebar toggles transport without scrolling the page', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.keyboard.press('Space');
  await expect(page.locator('#statusDot')).toHaveClass(LIVE);
  await expect(page.locator('#barPlayBtn')).toHaveText('◼');
  expect(await page.evaluate(() => window.scrollY)).toBe(0); // preventDefault held

  await page.keyboard.press('Space');
  await expect(page.locator('#statusDot')).not.toHaveClass(LIVE);
});

test('spacebar is ignored while typing in the BPM field', async ({ page }) => {
  await open(page);
  await page.locator('#bpmAmt').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#statusDot')).not.toHaveClass(LIVE);
});

// 6 — play/stop state stays in sync across the bottom bar and modal (setPlayingState)
test('play state syncs bottom bar and modal indicators', async ({ page }) => {
  await open(page);
  // drive the modal's play button (the open overlay covers the bottom-bar one);
  // setPlayingState must still update both regardless of which was clicked.
  await page.locator('#synthToggle').click();
  await expect(page.locator('#statusText')).toHaveText('PLAYING');
  await expect(page.locator('#statusDot')).toHaveClass(LIVE);
  await expect(page.locator('#modalDot')).toHaveClass(LIVE);
  await expect(page.locator('#barPlayBtn')).toHaveText('◼');
  await expect(page.locator('#synthToggle')).toHaveText('◼');

  await page.locator('#synthToggle').click();
  await expect(page.locator('#statusText')).toHaveText('STOPPED');
  await expect(page.locator('#statusDot')).not.toHaveClass(LIVE);
  await expect(page.locator('#barPlayBtn')).toHaveText('▶');
});

// 7 — mute/solo set .active; Unmute-all clears mutes but leaves solos (ea5f020).
// (The "solo overrides mute" audio routing isn't observable headless.)
test('unmute-all clears mutes but leaves solos', async ({ page }) => {
  await open(page);
  const kickMute = page.locator('.track-ctrl-btn.mute').nth(0);
  const kickSolo = page.locator('.track-ctrl-btn.solo').nth(0);

  await kickMute.click();
  await expect(kickMute).toHaveClass(ACTIVE);
  await kickSolo.click();
  await expect(kickSolo).toHaveClass(ACTIVE);

  await page.locator('#unmuteAllBtn').click();
  await expect(kickMute).not.toHaveClass(ACTIVE); // mute cleared
  await expect(kickSolo).toHaveClass(ACTIVE); // solo untouched
});

// 8 — BPM clamps to 60–180 (98a5fa5, setTempo)
test('BPM input clamps to 60–180', async ({ page }) => {
  await open(page);
  const bpm = page.locator('#bpmAmt');
  await bpm.fill('999');
  await expect(bpm).toHaveValue('180');
  await bpm.fill('10');
  await expect(bpm).toHaveValue('60');
});

// 9 — pages: ×2 / ÷2 change length (1↔2↔4 only), dots reflect it, bounds disabled,
// and no console errors through the cycle.
test('pages: double/halve drives 1↔2↔4 with bounded buttons', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await open(page);
  const dots = page.locator('#pageDots .page-dot');
  await expect(dots).toHaveCount(1);
  await expect(page.locator('#halveBtn')).toBeDisabled(); // can't go below 1 bar

  await page.locator('#doubleBtn').click();
  await expect(dots).toHaveCount(2);
  await page.locator('#doubleBtn').click();
  await expect(dots).toHaveCount(4);
  await expect(page.locator('#doubleBtn')).toBeDisabled(); // can't exceed 4 bars

  await page.locator('#halveBtn').click();
  await expect(dots).toHaveCount(2);
  await page.locator('#halveBtn').click();
  await expect(dots).toHaveCount(1);
  await expect(page.locator('#halveBtn')).toBeDisabled();

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});

// 10 — doubling copies bar 1 into bar 2, and edits are per-bar (independent).
test('pages: double duplicates the bar, edits stay per-bar', async ({ page }) => {
  await open(page);
  const dot = (i) => page.locator('#pageDots .page-dot').nth(i);
  const hat1 = page.locator('.step[data-track="hat"][data-step="1"]');
  const isOn = (loc) => loc.evaluate((e) => e.classList.contains('on'));

  await page.locator('#doubleBtn').click();         // bar 2 = copy of bar 1
  await dot(1).click();                              // view bar 2
  await expect(dot(1)).toHaveClass(/\bviewing\b/);
  const copied = await isOn(hat1);                   // bar 2's value (= bar 1's)

  await hat1.click();                                // edit only bar 2
  expect(await isOn(hat1)).toBe(!copied);

  await dot(0).click();                              // back to bar 1
  expect(await isOn(hat1)).toBe(copied);             // bar 1 untouched by the bar-2 edit
});

// 11 — stop always resets playback position. Regardless of where the playhead
// was when stopped or which bar is being viewed, the next play restarts at
// bar 1 step 1 (startSequencer sets the absolute currentStep to 0).
test('pages: stop → next play always restarts at bar 1', async ({ page }) => {
  await open(page);
  // 2 bars, viewing bar 2 — so we can prove playback ignores the viewed bar.
  await page.locator('#doubleBtn').click();
  const dot = (i) => page.locator('#pageDots .page-dot').nth(i);
  await dot(1).click();
  await expect(dot(1)).toHaveClass(/\bviewing\b/);

  const playingBar = () => page.evaluate(() => {
    const dots = document.querySelectorAll('#pageDots .page-dot');
    for (let i = 0; i < dots.length; i++) if (dots[i].classList.contains('playing')) return i;
    return -1;
  });

  // First playback: let it advance into bar 2 (at 140bpm a bar is ~1.7s).
  await page.locator('#synthToggle').click();
  await expect.poll(playingBar, { timeout: 4000, intervals: [100] }).toBe(1);

  // Stop, then play again — playback must restart at bar 1.
  await page.locator('#synthToggle').click(); // stop
  await expect.poll(playingBar).toBe(-1);
  await page.locator('#synthToggle').click(); // play
  await expect.poll(playingBar, { timeout: 2000, intervals: [50] }).toBe(0);
  // viewing was never touched — still on bar 2.
  await expect(dot(1)).toHaveClass(/\bviewing\b/);

  await page.locator('#synthToggle').click(); // clean up
});

// 12 — mini-grid is a passive display of the bar the playhead is in.
// Modal controls the playhead (stop resets it to bar 0); mini-grid follows.
// Viewing a different bar via the page dots must NOT move the mini-grid.
test('pages: mini-grid follows the playhead, not the viewed bar', async ({ page }) => {
  await open(page);
  // Set up a discriminator: edit bar 2's kick step 1 so it differs from bar 1's.
  await page.locator('#doubleBtn').click();                  // 2 bars
  const dot = (i) => page.locator('#pageDots .page-dot').nth(i);
  await dot(1).click();                                       // view bar 2
  await page.locator('.step[data-track="kick"][data-step="1"]').click(); // bar 2's kick[1] = 1

  // bar-step that mirrors kick step 1: on → bar 2 is shown; off → bar 1.
  const miniKick1On = () =>
    page.locator('#barSeq .bar-step[data-track="kick"][data-step="1"]')
      .evaluate((e) => e.classList.contains('on'));

  // Before any playback: mini-grid is on bar 1 even though we're viewing bar 2.
  expect(await miniKick1On()).toBe(false);

  // Play into bar 2; mini-grid follows.
  await page.locator('#synthToggle').click();
  await expect.poll(miniKick1On, { timeout: 4000, intervals: [100] }).toBe(true);

  // Stop snaps the playhead (and mini-grid) back to bar 1.
  await page.locator('#synthToggle').click();
  await expect.poll(miniKick1On, { timeout: 1000 }).toBe(false);

  // Viewing bar 2 again does NOT move the mini-grid.
  await dot(1).click();
  expect(await miniKick1On()).toBe(false);
});

// 14 — FX bus right-click opens the internal-params popup for the right bus,
// shows defaults (incl. the discrete delay-time label), and the popup stays
// inside the modal. The containment check guards against the `body{zoom:1.25}`
// positioning bug that mixes BCR (scaled) and style.left (unscaled).
test('FX bus: right-click opens param popups with defaults; popup stays inside modal', async ({ page }) => {
  await open(page);
  const delayBus = page.locator('.seq-bus-sends .knob').nth(0);
  const reverbBus = page.locator('.seq-bus-sends .knob').nth(1);
  const delayPop = page.locator('#delayFxPopup');
  const reverbPop = page.locator('#reverbFxPopup');

  // delay bus → delay popup with FB/TIME/TONE defaults
  await delayBus.dispatchEvent('contextmenu');
  await expect(delayPop).toBeVisible();
  await expect(reverbPop).toBeHidden();
  await expect(page.locator('#delayFbVal')).toHaveText('42');
  await expect(page.locator('#delayStepsVal')).toHaveText('3/16');
  await expect(page.locator('#delayToneVal')).toHaveText('3200');

  // reverb bus right-click swaps popups
  await reverbBus.dispatchEvent('contextmenu');
  await expect(delayPop).toBeHidden();
  await expect(reverbPop).toBeVisible();
  await expect(page.locator('#reverbSizeVal')).toHaveText('2.6');
  await expect(page.locator('#reverbDecayVal')).toHaveText('2.8');

  // popup must sit fully inside the modal (the rightmost-knob case is where
  // overflow showed up under body{zoom:1.25}). 1px slack for sub-pixel rounding.
  const containment = await page.evaluate(() => {
    const p = document.getElementById('reverbFxPopup').getBoundingClientRect();
    const m = document.querySelector('.synth-modal').getBoundingClientRect();
    return { fits: p.left >= m.left - 1 && p.right <= m.right + 1, popRight: p.right, modalRight: m.right };
  });
  expect(containment.fits, `popup right ${containment.popRight} > modal right ${containment.modalRight}`).toBe(true);

  // outside-click (modal padding area) closes any open popup
  await page.locator('.synth-modal').click({ position: { x: 5, y: 5 } });
  await expect(reverbPop).toBeHidden();
  await expect(delayPop).toBeHidden();
});

// 15 — ÷2 / ×2 mid-playback: clicking the button while running queues the
// change (button gets .pending), length stays unchanged for the rest of the
// audible bar, then applies at the bar boundary (within ~1 bar at default BPM).
test('pages: halve queued mid-play applies at next bar boundary', async ({ page }) => {
  await open(page);
  await page.locator('#doubleBtn').click();
  await expect(page.locator('#pageDots .page-dot')).toHaveCount(2);

  await page.locator('#synthToggle').click();      // play
  await page.locator('#halveBtn').click();         // queue halve
  await expect(page.locator('#halveBtn')).toHaveClass(/\bpending\b/);
  await expect(page.locator('#pageDots .page-dot')).toHaveCount(2); // not applied yet

  // Within one bar (~1.7 s at 140 bpm) the queued change fires at the boundary.
  await expect(page.locator('#pageDots .page-dot')).toHaveCount(1, { timeout: 4000 });
  await expect(page.locator('#halveBtn')).not.toHaveClass(/\bpending\b/);

  await page.locator('#synthToggle').click();      // stop / cleanup
});

// 16 — synth state persists across page reload via localStorage. Touches a
// representative slice (BPM, a step toggle, length doubled, ACID→FM) and
// asserts every one of those re-renders on reload.
test('settings persist across page reload', async ({ page }) => {
  await open(page);
  await page.locator('#bpmAmt').fill('128');
  await page.locator('#bpmAmt').blur();
  await page.locator('#doubleBtn').click();                                // numBars 1 → 2
  await page.locator('.step[data-track="kick"][data-step="2"]').click();   // bar 1 kick[2] flip
  const kick2Before = await page.locator('.step[data-track="kick"][data-step="2"]').evaluate(e => e.classList.contains('on'));
  await page.locator('.inst-btn').nth(1).click();                          // ACID → FM

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#synthBar').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#bpmAmt')).toHaveValue('128');
  await expect(page.locator('#pageDots .page-dot')).toHaveCount(2);
  await expect(page.locator('.inst-btn').nth(1)).toHaveClass(/\bactive\b/);
  expect(await page.locator('.step[data-track="kick"][data-step="2"]').evaluate(e => e.classList.contains('on'))).toBe(kick2Before);
});
