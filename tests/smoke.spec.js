// Smoke tests for the Mod.wav static site.
// Repeatable mobile + desktop verification — replaces hand-driving a preview server.
// Run: npm test  (one-time: npx playwright install chromium)
const { test, expect } = require('@playwright/test');

// The 720px CLAUDE.md breakpoint flips layout, so cover both sides of it.
const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
};

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`${name} (${viewport.width}px)`, () => {
    test.use({ viewport });

    test('loads clean, renders sequencer + scope, opens modal', async ({ page }) => {
      // Regression guard: a stray null lookup once silently halted all JS,
      // killing the waveform + bottom-bar grid. Fail on ANY console error.
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));

      await page.goto('/index.html', { waitUntil: 'networkidle' });

      expect(consoleErrors, `console errors on load:\n${consoleErrors.join('\n')}`).toEqual([]);

      // Bottom-bar sequencer rendered its 4 tracks x 16 steps = 64 cells.
      const barSeq = page.locator('#barSeq');
      await expect(barSeq).toBeVisible();
      await expect(barSeq.locator('.bar-seq-row')).toHaveCount(4);
      await expect(barSeq.locator('.bar-step')).toHaveCount(64);

      // Background oscilloscope canvas got sized to its rendered box (resizeCanvas ran),
      // rather than left at the stale intrinsic size.
      const scope = await page.locator('#bgScope').evaluate((c) => ({
        width: c.width,
        clientWidth: c.clientWidth,
        dpr: window.devicePixelRatio || 1,
      }));
      expect(scope.clientWidth).toBeGreaterThan(0);
      expect(scope.width).toBe(Math.round(scope.clientWidth * scope.dpr));

      // Landing screenshot.
      await page.screenshot({ path: `test-results/landing-${name}.png`, fullPage: true });

      // Open the sequencer modal via the floating synth bar (not the play button).
      await page.locator('#synthBar').click({ position: { x: 5, y: 5 } });
      const overlay = page.locator('#synthOverlay');
      await expect(overlay).toHaveClass(/\bopen\b/);
      await expect(page.locator('#seq').locator('> *')).not.toHaveCount(0);
      // Wait out the 0.3s opacity fade-in so the screenshot shows the modal, not
      // the page bleeding through a half-transparent overlay.
      await expect(overlay).toHaveCSS('opacity', '1');

      // Open-modal screenshot. Viewport-only: the modal is a fixed overlay, so a
      // fullPage shot would render it over only the first screen with the long
      // page scrolling past underneath.
      await page.screenshot({ path: `test-results/modal-${name}.png` });
    });
  });
}
