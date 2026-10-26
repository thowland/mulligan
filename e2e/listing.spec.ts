// Sprint 3 listing scenarios (checklist from Workstream B), under the production headers.
import type { Locator, Page } from '@playwright/test';
import { expect, fixture, test } from './helpers.ts';

const field = (page: Page, label: string) =>
  page.getByRole('article', { name: label, exact: true });
const cleaned = (article: Locator, label: string) =>
  article.getByRole('region', { name: `Cleaned ${label}` });

/** Dispatches a rich paste (text/html and text/plain) the way Word and Google Docs supply it. */
async function pasteRich(target: Locator, html: string) {
  const text = html.replace(/<[^>]*>/g, ' ');
  await target.evaluate(
    (element, data) => {
      const transfer = new DataTransfer();
      transfer.setData('text/html', data.html);
      transfer.setData('text/plain', data.text);
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
    },
    { html, text },
  );
}

const wordHtml = () => fixture('text/word-description-bullets/input.html').toString('utf8');
const docsHtml = () => fixture('text/google-docs-paste/input.html').toString('utf8');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Listing' }).click();
});

test('Word paste into Apple Description: lists, NBSP and change summary', async ({ page }) => {
  const description = field(page, 'Description');
  await pasteRich(description.getByRole('textbox'), wordHtml());
  await expect(description).toContainText(
    'Pasted with formatting. Paragraphs and lists were converted to text.',
  );
  const output = cleaned(description, 'Description');
  await expect(output).toContainText('– Log symptoms in seconds');
  await expect(output).toContainText('– Set medication reminders that fit your routine');
  await expect(output).toContainText('– Export a summary for your doctor');
  expect(await output.innerText()).not.toContain(' ');
  await expect(description).toContainText('Changes made:');
  await expect(description).toContainText('List item converted to a bullet line ×3');
  await expect(description).toContainText('Unusual space replaced');
});

test('Google Docs paste into Play Full description collapses blank lines', async ({ page }) => {
  const full = field(page, 'Full description');
  await pasteRich(full.getByRole('textbox'), docsHtml());
  const output = cleaned(full, 'Full description');
  await expect(output).toContainText('– Keep a daily symptom diary');
  expect(await output.innerText()).not.toMatch(/\n\s*\n\s*\n/);
  await expect(full).toContainText('Blank lines collapsed');
});

test('89 characters in Play Short description: 9 over, marked, not truncated', async ({ page }) => {
  const short = field(page, 'Short description');
  const text =
    'Track symptoms, medications and appointments, then share a clear summary with your doctor';
  expect(text).toHaveLength(89);
  await short.getByRole('textbox').fill(text);
  await expect(short).toContainText('89 / 80 characters, 9 over');
  const output = cleaned(short, 'Short description');
  await expect(output.locator('mark')).toHaveText(text.slice(80));
  await expect(output).toHaveText(text);
  await expect(short).toContainText('Fails checks');
});

test('Copy from iOS fills Play fields; Google limits apply', async ({ page }) => {
  const promo =
    'Track symptoms, medications and appointments, then share a clear summary with your doctor';
  await field(page, 'Promotional text').getByRole('textbox').fill(promo);
  await field(page, 'App name').getByRole('textbox').fill('Daylog');

  const short = field(page, 'Short description');
  await short.getByRole('button', { name: 'Copy from iOS Promotional text' }).click();
  await expect(short.getByRole('textbox')).toHaveValue(promo);
  await expect(short).toContainText('89 / 80 characters, 9 over');

  const title = field(page, 'App title');
  await title.getByRole('textbox').fill('Old title');
  await title.getByRole('button', { name: 'Copy from iOS App name' }).click();
  await title.getByRole('button', { name: 'Replace' }).click();
  await expect(title.getByRole('textbox')).toHaveValue('Daylog');
});

test('Keywords: byte limit failure, duplicate and name-overlap warnings', async ({ page }) => {
  await field(page, 'App name').getByRole('textbox').fill('Example Health');
  const keywords = field(page, 'Keywords');
  const input =
    'health , café, cafe , 日本語の健康管理アプリ, 睡眠と気分の記録アプリ, symptom tracker, medication reminders';
  expect(new TextEncoder().encode(input).length).toBeGreaterThan(100);
  await keywords.getByRole('textbox').fill(input);
  const output = cleaned(keywords, 'Keywords');
  await expect(output).toContainText('health,café,cafe,日本語の健康管理アプリ');
  await expect(keywords).toContainText(/\d+ \/ 100 bytes, \d+ over/);
  await expect(keywords).toContainText('Fails checks');
  const findings = keywords.getByRole('list', { name: 'Keywords findings' });
  await expect(findings).toContainText('Duplicate keywords');
  await expect(findings).toContainText('Keywords repeating words from the');
});

test('Straighten curly quotes updates the output', async ({ page }) => {
  const promo = field(page, 'Promotional text');
  await promo.getByRole('textbox').fill('“Track it” – it’s quick');
  const output = cleaned(promo, 'Promotional text');
  await expect(output).toHaveText('“Track it” – it’s quick');
  await promo.getByRole('checkbox', { name: 'Straighten curly quotes' }).check();
  await expect(output).toHaveText('"Track it" – it\'s quick');
});

test('Copy puts the cleaned text on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const name = field(page, 'App name');
  await name.getByRole('textbox').fill('  Example Health  ');
  await expect(cleaned(name, 'App name')).toHaveText('Example Health');
  await name.getByRole('button', { name: 'Copy cleaned App name' }).click();
  await expect(name.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();

  // Mulligan's Permissions-Policy forbids clipboard reads on its own origin (spec §10.3), so read
  // the clipboard back from a separate secure page in the same browser.
  const reader = await context.newPage();
  await reader.route('https://clipboard-reader.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>reader</title>' }),
  );
  await reader.goto('https://clipboard-reader.test/');
  await context.grantPermissions(['clipboard-read'], { origin: 'https://clipboard-reader.test' });
  expect(await reader.evaluate(() => navigator.clipboard.readText())).toBe('Example Health');
  await reader.close();
});

test('rich paste, Edit as plain text, Discard formatting: a textarea with the text', async ({
  page,
}) => {
  const description = field(page, 'Description');
  await pasteRich(description.getByRole('textbox'), wordHtml());
  await expect(description.getByRole('textbox')).toHaveCount(0);
  await description.getByRole('button', { name: 'Edit as plain text' }).click();
  await description.getByRole('button', { name: 'Discard formatting' }).click();
  const textarea = description.getByRole('textbox');
  await expect(textarea).toBeVisible();
  const value = await textarea.inputValue();
  expect(value).toContain('Log symptoms in seconds');
  expect(value).not.toContain('<');
});

test('typed input survives switching tabs', async ({ page }) => {
  await field(page, 'Subtitle').getByRole('textbox').fill('Symptom and mood tracker');
  await page.getByRole('tab', { name: 'Images' }).click();
  await page.getByRole('tab', { name: 'Package' }).click();
  await page.getByRole('tab', { name: 'Listing' }).click();
  await expect(field(page, 'Subtitle').getByRole('textbox')).toHaveValue(
    'Symptom and mood tracker',
  );
});
