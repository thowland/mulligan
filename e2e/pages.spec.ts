import { expect, imageFile, test, upload } from './helpers.ts';

test('Help and About open over the workspace and return to it intact', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'screenshot', [imageFile('home.png', 'images/exact-size/source.png')]);
  await expect(page.getByText('home.png', { exact: true })).toBeVisible();

  const pages = page.getByRole('navigation', { name: 'Pages' });
  await pages.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Help' })).toBeFocused();
  await expect(page.getByRole('rowheader', { name: 'Google Play feature graphic' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Where your work is kept' })).toContainText(
    '30 days',
  );
  await page.getByRole('link', { name: 'Resetting your work' }).click();
  await expect(page.getByRole('heading', { name: 'Resetting your work' })).toBeInViewport();

  await pages.getByRole('button', { name: 'About' }).click();
  await expect(page.getByRole('link', { name: 'th@wdogsystems.com' })).toHaveAttribute(
    'href',
    'mailto:th@wdogsystems.com',
  );
  await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/thowland/mulligan',
  );

  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await expect(page.getByText('home.png', { exact: true })).toBeVisible();
  await expect(pages.getByRole('button', { name: 'About' })).toBeFocused();
});
