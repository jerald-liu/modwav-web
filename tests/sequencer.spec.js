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

// 3 + 4 — right-click never toggles an acid step (1c08031), and the FM popup
// is gated to FM mode and closes on switch back to ACID (bd1d728).
test('FM popup: gated to FM mode, opens on right-click, closes on switch to ACID', async ({ page }) => {
  await open(page);
  const acidStep = page.locator('.step.step-pitch[data-track="acid"][data-step="0"]');
  const popup = page.locator('#fmPopup');
  const acidBtn = page.locator('.inst-btn').nth(0);
  const fmBtn = page.locator('.inst-btn').nth(1);

  // ACID mode: right-click must NOT open the popup and must NOT toggle the step
  const onBefore = await hasOn(acidStep);
  await acidStep.click({ button: 'right' });
  await expect(popup).toBeHidden();
  expect(await hasOn(acidStep)).toBe(onBefore);

  // FM mode: right-click opens the popup
  await fmBtn.click();
  await acidStep.click({ button: 'right' });
  await expect(popup).toBeVisible();
  expect(await hasOn(acidStep)).toBe(onBefore); // still didn't toggle

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
