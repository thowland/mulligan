// Sprint 5 scenarios: session persistence in IndexedDB, Clear session, in-memory fallback,
// render failures amid good files, and the download confirmation, under the production headers.
import { chromium, type Locator, type Page } from '@playwright/test';
import {
  crc32,
  downloadPackage,
  expect,
  fixture,
  imageFile,
  test,
  unzipDownload,
  upload,
  waitForRenders,
  type UploadFile,
} from './helpers.ts';

const decode = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);
const field = (page: Page, label: string) =>
  page.getByRole('article', { name: label, exact: true });
const sourceNames = (page: Page) =>
  page
    .getByRole('list')
    .filter({ has: page.getByRole('button', { name: /^Reorder / }) })
    .getByRole('listitem')
    .locator('strong')
    .allTextContents();
/** Longer than the 500 ms save debounce, so the session record has been written. */
const settle = (page: Page) => page.waitForTimeout(800);

const screenshot = (name: string) => imageFile(name, 'images/exact-size/source.png');

/**
 * A PNG whose structure and checksums are valid but whose image data is not, so it passes
 * intake (header and completeness) and fails only when the renderer decodes it.
 */
function undecodablePng(name: string): UploadFile {
  const png = Buffer.from(fixture('images/exact-size/source.png'));
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    if (png.toString('latin1', offset + 4, offset + 8) === 'IDAT') {
      png.fill(0xff, offset + 8, offset + 8 + length);
      png.writeUInt32BE(crc32(png.subarray(offset + 4, offset + 8 + length)), offset + 8 + length);
    }
    offset += 12 + length;
  }
  return { name, mimeType: 'image/png', buffer: png };
}

async function review(article: Locator) {
  await article.getByRole('button', { name: /^Review changes/ }).click();
  return article.getByRole('group', { name: /changes$/ });
}

test('a reload restores order, selections, listing copy and reverts; Clear session empties it', async ({
  page,
}) => {
  await page.goto('/');
  await upload(page, 'screenshot', [screenshot('a.png'), screenshot('b.png'), screenshot('c.png')]);
  await expect.poll(() => sourceNames(page)).toEqual(['a.png', 'b.png', 'c.png']);
  await page.getByRole('button', { name: 'Move c.png up' }).click();
  await expect.poll(() => sourceNames(page)).toEqual(['a.png', 'c.png', 'b.png']);
  await page.getByRole('checkbox', { name: /Android phone screenshot/ }).uncheck();
  await page.getByRole('checkbox', { name: /iPad 13" screenshot/ }).check();
  await waitForRenders(page, 6);

  await page.getByRole('tab', { name: 'Listing' }).click();
  const description = field(page, 'Description');
  await description.getByRole('textbox').fill('Track symptoms and share\nreports.');
  const changes = await review(description);
  await changes.getByRole('button', { name: 'Revert' }).click();
  await expect(changes.getByRole('listitem')).toContainText('Reverted');

  // The one-time notice appears after the first save; dismissing it is remembered.
  const saved = page.getByText(/Your work is kept in this browser until you clear it/);
  await expect(saved).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await settle(page);

  await page.reload();
  await expect.poll(() => sourceNames(page)).toEqual(['a.png', 'c.png', 'b.png']);
  await expect(page.getByRole('checkbox', { name: /Android phone screenshot/ })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /iPad 13" screenshot/ })).toBeChecked();
  await waitForRenders(page, 6);
  await page.getByRole('tab', { name: 'Listing' }).click();
  await expect(field(page, 'Description').getByRole('textbox')).toHaveValue(
    'Track symptoms and share\nreports.',
  );
  const restored = await review(field(page, 'Description'));
  await expect(restored.getByRole('listitem')).toContainText('Reverted');
  await expect(restored.getByRole('button', { name: 'Restore' })).toBeVisible();
  await expect(saved).toHaveCount(0);

  // Clear session asks first, then removes everything, also from the browser.
  await page.getByRole('button', { name: 'Clear session' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Clear this session?' });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(field(page, 'Description').getByRole('textbox')).toHaveValue(
    'Track symptoms and share\nreports.',
  );
  await page.getByRole('button', { name: 'Clear session' }).click();
  await confirm.getByRole('button', { name: 'Clear session' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(field(page, 'Description').getByRole('textbox')).toHaveValue('');
  await page.getByRole('tab', { name: 'Images' }).click();
  await expect(page.getByRole('button', { name: /^Reorder / })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('button', { name: /^Reorder / })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Listing' }).click();
  await expect(field(page, 'Description').getByRole('textbox')).toHaveValue('');
  // The preset selection is back to the defaults.
  await page.getByRole('tab', { name: 'Images' }).click();
  await expect(page.getByRole('checkbox', { name: /Android phone screenshot/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /iPad 13" screenshot/ })).not.toBeChecked();
});

test('exit criterion: closing the browser mid-session loses at most the last 500 ms of input', async ({
  baseURL,
}, testInfo) => {
  const profile = testInfo.outputPath('profile');
  const open = async () => {
    const context = await chromium.launchPersistentContext(profile, { baseURL: baseURL! });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('/');
    return { context, page };
  };

  const first = await open();
  await upload(first.page, 'screenshot', [screenshot('home.png')]);
  await first.page.getByRole('tab', { name: 'Listing' }).click();
  await field(first.page, 'App name').getByRole('textbox').fill('Example Health');
  const typedAt = Date.now();
  // Wait out the save debounce, then type more and close the browser at once.
  await first.page.waitForTimeout(600);
  await field(first.page, 'Subtitle').getByRole('textbox').fill('Typed just before closing');
  await first.context.close();
  expect(Date.now() - typedAt).toBeGreaterThanOrEqual(600);

  const second = await open();
  try {
    await expect.poll(() => sourceNames(second.page)).toEqual(['home.png']);
    await waitForRenders(second.page, 2);
    await second.page.getByRole('tab', { name: 'Listing' }).click();
    await expect(field(second.page, 'App name').getByRole('textbox')).toHaveValue('Example Health');
    // Input from the last 500 ms may or may not have been saved; nothing older is lost.
    const subtitle = await field(second.page, 'Subtitle').getByRole('textbox').inputValue();
    expect(['', 'Typed just before closing']).toContain(subtitle);
  } finally {
    await second.context.close();
  }
});

test('an undecodable image amid good ones: the rest still package and the manifest says why', async ({
  page,
}) => {
  await page.goto('/');
  await upload(page, 'screenshot', [
    screenshot('good-a.png'),
    undecodablePng('broken.png'),
    screenshot('good-b.png'),
  ]);
  const broken = page.getByRole('article', { name: /, broken\.png$/ });
  await expect(broken).toHaveCount(2);
  await expect(broken.first().getByRole('status')).toHaveText('Failed', { timeout: 60_000 });
  await expect(broken.first()).toContainText('Failure');
  await waitForRenders(page, 6);
  await expect(page.locator('footer [role="status"]')).toContainText('failure');

  await page.getByRole('tab', { name: 'Package' }).click();
  const findings = page.getByRole('table', { name: 'Findings' });
  await expect(findings).toContainText('broken.png');
  await expect(findings).toContainText('Image could not be decoded');

  const files = await unzipDownload(await downloadPackage(page, { failures: true }));
  expect(Object.keys(files).sort()).toEqual([
    'android-phone/01_good-a.png',
    'android-phone/03_good-b.png',
    'iphone-6.3/01_good-a.png',
    'iphone-6.3/03_good-b.png',
    'manifest.json',
  ]);
  const manifest = JSON.parse(decode(files['manifest.json']));
  expect(manifest.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'image.decode-failed',
        severity: 'failure',
        subject: expect.objectContaining({ fileName: 'broken.png' }),
      }),
    ]),
  );
  expect(manifest.summary.worst).toBe('failure');
});

test('an over-limit field asks before downloading, and the manifest records the failure', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Listing' }).click();
  await field(page, 'App name').getByRole('textbox').fill('Example Health Tracker For Every Day');

  await page.getByRole('tab', { name: 'Package' }).click();
  await page.getByRole('button', { name: 'Download package' }).click();
  const confirm = page.getByRole('alertdialog', {
    name: /^Download a package with \d+ failures?\?$/,
  });
  await expect(confirm).toContainText('Apple App Store · App name');
  await expect(confirm).toContainText('over the limit');
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);

  const files = await unzipDownload(await downloadPackage(page, { failures: true }));
  const manifest = JSON.parse(decode(files['manifest.json']));
  expect(manifest.listing).toEqual({ path: 'listing/listing.json', status: 'failure' });
  expect(manifest.summary.failure).toBeGreaterThan(0);
  const listing = JSON.parse(decode(files['listing/listing.json']));
  expect(listing.fields['apple.name'].findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ruleId: 'text.limit.max', severity: 'failure' }),
    ]),
  );
});

test('without IndexedDB the app works in memory and says so', async ({ page }) => {
  await page.addInitScript(() => {
    // Simulates a browser that refuses storage (for example some private windows).
    IDBFactory.prototype.open = () => {
      throw new DOMException('Storage is disabled', 'InvalidStateError');
    };
  });
  await page.goto('/');
  const banner = page.getByRole('alert').filter({ hasText: 'Not saved on this device.' });
  await expect(banner).toBeVisible();
  await upload(page, 'screenshot', [screenshot('home.png')]);
  await waitForRenders(page, 2);
  await expect(page.getByText(/kept in this browser until you clear it/)).toHaveCount(0);

  await page.reload();
  await expect(banner).toBeVisible();
  await expect(page.getByRole('button', { name: /^Reorder / })).toHaveCount(0);
});

test('Clear session fails closed when the browser will not remove the saved data', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Both removal routes fail: clearing the stores and deleting the database.
    IDBObjectStore.prototype.clear = () => {
      throw new DOMException('Clearing is broken', 'UnknownError');
    };
    IDBFactory.prototype.deleteDatabase = () => {
      throw new DOMException('Deleting is broken', 'UnknownError');
    };
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Listing' }).click();
  await field(page, 'App name').getByRole('textbox').fill('Example Health');
  await settle(page);

  await page.getByRole('button', { name: 'Clear session' }).click();
  await page
    .getByRole('alertdialog', { name: 'Clear this session?' })
    .getByRole('button', { name: 'Clear session' })
    .click();
  await expect(page.getByRole('alert').filter({ hasText: 'Not cleared.' })).toContainText(
    'could not remove your saved work from this browser',
  );
  await expect(page.getByText('Saved work is still in this browser.')).toBeVisible();
  // No false "cleared" state: the copy is still on screen …
  await expect(field(page, 'App name').getByRole('textbox')).toHaveValue('Example Health');

  // … and, as the notice says, still on disk.
  await page.reload();
  await page.getByRole('tab', { name: 'Listing' }).click();
  await expect(field(page, 'App name').getByRole('textbox')).toHaveValue('Example Health');
});
