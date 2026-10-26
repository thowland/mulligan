import { expect, imageFile, test, upload } from './helpers.ts';

// Runs in Chromium, Firefox and WebKit: the app loads under the preview headers and renders an
// image in the worker. WebKit once rendered a blank page here (upgrade-insecure-requests on
// localhost), which a Chromium-only suite could not see.
test('loads and renders a screenshot', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mulligan' })).toBeVisible();
  await upload(page, 'screenshot', [imageFile('home.png', 'images/exact-size/source.png')]);
  const cards = page.getByRole('article').filter({ has: page.getByRole('status') });
  await expect(cards.first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('article [role="status"]', { hasText: 'Rendering…' })).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(page.locator('article img').first()).toBeVisible();
});
