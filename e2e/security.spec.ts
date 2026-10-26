import { expect, test } from './helpers.ts';

// Self-test for the violation collector every test relies on: a blocked inline script must be
// caught, which makes this test fail as expected.
test('the violation collector catches a Trusted Types violation', async ({ page }) => {
  test.fail();
  await page.goto('/');
  await page.evaluate(() => {
    try {
      const script = document.createElement('script');
      script.textContent = 'void 0';
      document.head.append(script);
    } catch {
      // Trusted Types throws; the violation is still reported.
    }
  });
  await expect(page.getByRole('heading', { name: 'Mulligan' })).toBeVisible();
});
