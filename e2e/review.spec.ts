// Sprint 4 scenarios: listing review and reverts, template import, the listing in the package,
// and the workspace status, under the production headers.
import type { Locator, Page } from '@playwright/test';
import {
  downloadPackage,
  expect,
  fixture,
  imageFile,
  test,
  unzipDownload,
  upload,
  waitForRenders,
} from './helpers.ts';

const field = (page: Page, label: string) =>
  page.getByRole('article', { name: label, exact: true });
const cleaned = (article: Locator, label: string) =>
  article.getByRole('region', { name: `Cleaned ${label}` });
const statusBar = (page: Page) => page.locator('footer [role="status"]');

const decode = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

async function pasteRich(target: Locator, html: string) {
  await target.evaluate((element, data) => {
    const transfer = new DataTransfer();
    transfer.setData('text/html', data);
    transfer.setData('text/plain', data.replace(/<[^>]*>/g, ' '));
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  }, html);
}

async function importTemplate(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.getByTestId('listing-import-input').setInputFiles({ name, mimeType, buffer });
}

/** A complete listing that passes every check. */
const COMPLETE_LISTING = {
  mulliganTemplate: 1,
  fields: {
    'apple.name': 'Example Health',
    'apple.subtitle': 'Track symptoms daily',
    'apple.promotional-text': 'Now with medication reminders.',
    'apple.description':
      'Example Health helps you track symptoms and medications.\n\n– Log symptoms in seconds\n– Share a summary with your doctor',
    'apple.keywords': 'diary,medication,reminders,doctor',
    'apple.whats-new': 'Medication reminders and faster sync.',
    'google.title': 'Example Health',
    'google.short-description': 'Track symptoms and share clear reports with your care team.',
    'google.full-description':
      'Example Health helps you track symptoms and medications.\n\n– Keep a daily diary\n– Get reminders',
    'google.release-notes': 'Medication reminders and faster sync.',
  },
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('review: revert a rejoin, keep the break, and record it in listing.json', async ({ page }) => {
  await page.getByRole('tab', { name: 'Listing' }).click();
  const description = field(page, 'Description');
  await description
    .getByRole('textbox')
    .fill('Track symptoms and share\nreports with your doctor.');
  const output = cleaned(description, 'Description');
  await expect(output).toHaveText('Track symptoms and share reports with your doctor.');

  await description.getByRole('button', { name: 'Review changes (1)' }).click();
  await expect(description.getByRole('region', { name: 'Original' })).toHaveText(
    'Track symptoms and share\nreports with your doctor.',
  );
  const changes = description.getByRole('group', { name: 'Description changes' });
  await expect(changes).toContainText('Hard-wrapped line rejoined (1)');
  const revert = changes.getByRole('button', { name: 'Revert' });
  await expect(changes.getByRole('listitem')).toContainText('Applied');
  await revert.hover();
  await expect(description.locator('mark[data-active]')).toHaveCount(2);
  await revert.click();
  await expect(changes.getByRole('listitem')).toContainText('Reverted');
  await expect(changes.getByRole('button', { name: 'Restore' })).toBeVisible();
  await expect(output).toHaveText('Track symptoms and share\nreports with your doctor.');
  await expect(description).toContainText('1 reverted change');

  // Only one field is filled, so required fields fail and the download asks first.
  const files = await unzipDownload(await downloadPackage(page, { failures: true }));
  expect(Object.keys(files).sort()).toEqual([
    'listing/listing.json',
    'listing/listing.txt',
    'manifest.json',
  ]);
  const listing = JSON.parse(decode(files['listing/listing.json']));
  expect(listing.fields['apple.description']).toMatchObject({
    value: 'Track symptoms and share\nreports with your doctor.',
    changes: [{ ruleId: 'lines.rejoin', reverted: true }],
  });
  expect(decode(files['listing/listing.txt'])).toContain(
    '== Apple App Store · Description (50/4000 chars) ==\nTrack symptoms and share\nreports with your doctor.\n',
  );
  const manifest = JSON.parse(decode(files['manifest.json']));
  expect(manifest.listing).toEqual({ path: 'listing/listing.json', status: 'failure' });
});

test('review: editing the source clears reverts and says so', async ({ page }) => {
  await page.getByRole('tab', { name: 'Listing' }).click();
  const description = field(page, 'Description');
  const source = description.getByRole('textbox');
  await source.fill('Track symptoms and share\nreports.');
  await description.getByRole('button', { name: 'Review changes (1)' }).click();
  await description.getByRole('button', { name: 'Revert' }).click();
  await source.fill('Track symptoms and share\nreports today.');
  await expect(
    description.getByText(
      'Editing the source cleared 1 reverted change; review the changes again.',
    ),
  ).toBeVisible();
  await expect(cleaned(description, 'Description')).toHaveText(
    'Track symptoms and share reports today.',
  );
});

test('review: a Word paste shows linked highlights and the raw HTML on request', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Listing' }).click();
  const description = field(page, 'Description');
  const html = fixture('text/word-description-bullets/input.html').toString('utf8');
  await pasteRich(description.getByRole('textbox'), html);
  await description.getByRole('button', { name: /^Review changes \(\d+\)$/ }).click();
  await expect(description).toContainText('HTML converted to text');
  await expect(description.getByRole('group', { name: 'Description changes' })).toContainText(
    'Unusual space replaced',
  );
  await expect(description.locator('mark').first()).toBeVisible();

  const raw = description.getByRole('button', { name: 'View raw HTML' });
  await raw.click();
  await expect(description.locator('pre')).toContainText('<p');
  await description.getByRole('button', { name: 'Hide raw HTML' }).click();
  await expect(description.locator('pre')).toBeHidden();
});

test('import: a Windows-1252 CSV from Excel fills fields with curly quotes', async ({ page }) => {
  await page.getByRole('tab', { name: 'Listing' }).click();
  const csv = Buffer.concat([
    Buffer.from('field,value\r\napple.subtitle,', 'latin1'),
    Buffer.from([0x93]),
    Buffer.from('Track it', 'latin1'),
    Buffer.from([0x94]),
    Buffer.from('\r\ngoogle.title,Caf\xe9 Health\r\nbogus.field,x\r\n', 'latin1'),
  ]);
  await importTemplate(page, 'agency.csv', 'text/csv', csv);
  await expect(page.getByText('Imported 2 fields from agency.csv (Windows-1252).')).toBeVisible();
  await expect(page.getByText('"bogus.field" is not a listing field')).toBeVisible();
  await expect(field(page, 'Subtitle').getByRole('textbox')).toHaveValue('“Track it”');
  await expect(field(page, 'App title').getByRole('textbox')).toHaveValue('Café Health');
});

test('import: replacing copy already entered asks first', async ({ page }) => {
  await page.getByRole('tab', { name: 'Listing' }).click();
  const name = field(page, 'App name').getByRole('textbox');
  await name.fill('Typed name');
  const json = Buffer.from(
    JSON.stringify({ mulliganTemplate: 1, fields: { 'apple.name': 'Imported name' } }),
  );

  await importTemplate(page, 'listing.json', 'application/json', json);
  const confirm = page.getByRole('group', { name: 'Replace existing copy' });
  await expect(confirm).toContainText('replaces copy already entered in 1 field: App name');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(name).toHaveValue('Typed name');

  await importTemplate(page, 'listing.json', 'application/json', json);
  await page
    .getByRole('group', { name: 'Replace existing copy' })
    .getByRole('button', { name: 'Replace' })
    .click();
  await expect(name).toHaveValue('Imported name');
  await expect(page.getByText('Imported 1 field from listing.json (UTF-8).')).toBeVisible();
});

test('import: a malformed file is reported and changes nothing', async ({ page }) => {
  await page.getByRole('tab', { name: 'Listing' }).click();
  await importTemplate(page, 'notes.csv', 'text/csv', Buffer.from('name,copy\nfoo,bar\n'));
  await expect(page.getByText('notes.csv could not be imported (read as UTF-8).')).toBeVisible();
  await expect(page.getByText('The first row must name the columns')).toBeVisible();
});

test('templates: both are served with the production headers and import cleanly', async ({
  page,
  request,
}) => {
  for (const name of ['mulligan-listing-template.csv', 'mulligan-listing-template.json']) {
    const response = await request.get(`/templates/${name}`);
    expect(response.status(), name).toBe(200);
    expect(response.headers()['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  }
  await page.getByRole('tab', { name: 'Listing' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('mulligan-listing-template.csv');
  await importTemplate(
    page,
    'mulligan-listing-template.csv',
    'text/csv',
    await (await request.get('/templates/mulligan-listing-template.csv')).body(),
  );
  await expect(
    page.getByText('Imported 0 fields from mulligan-listing-template.csv'),
  ).toBeVisible();
});

test('full package: six screenshots × three presets plus the listing in one ZIP', async ({
  page,
}) => {
  await expect(statusBar(page)).toHaveText('Ready');
  const six = [
    imageFile('1-home.png', 'images/long-capture/source.png'),
    imageFile('2-dashboard.png', 'images/exact-size/source.png'),
    imageFile('3-settings.png', 'images/landscape/source.png'),
    imageFile('4-reminders.png', 'images/sixteen-bit/source.png'),
    imageFile('5-history.jpg', 'images/photo/source.jpg'),
    imageFile('6-share.jpg', 'images/exif-rotated/source.jpg'),
  ];
  await upload(page, 'screenshot', six);
  await page.getByRole('checkbox', { name: /iPad 13" screenshot/ }).check();
  await waitForRenders(page, 18);
  await expect(page.getByText('01 · 1-home.png').first()).toBeVisible();
  await expect(page.getByText('06 · 6-share.jpg').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Listing' }).click();
  await importTemplate(
    page,
    'complete.json',
    'application/json',
    Buffer.from(JSON.stringify(COMPLETE_LISTING)),
  );
  await expect(page.getByText('Imported 10 fields from complete.json (UTF-8).')).toBeVisible();

  await page.getByRole('tab', { name: 'Package' }).click();
  const listingSection = page.getByRole('region', { name: 'Listing' });
  await expect(listingSection).toContainText('Every field passes its checks.');
  await expect(page.getByRole('rowheader', { name: 'listing/' })).toBeVisible();

  const files = await unzipDownload(await downloadPackage(page));
  const paths = Object.keys(files).sort();
  const slugs = six.map((f) => f.name.replace(/\.(png|jpg)$/, ''));
  const images = ['ipad-13', 'iphone-6.9', 'android-phone'].flatMap((folder) =>
    slugs.map((slug, i) => `${folder}/0${i + 1}_${slug}.png`),
  );
  expect(paths).toEqual(
    [...images, 'listing/listing.json', 'listing/listing.txt', 'manifest.json'].sort(),
  );

  const manifest = JSON.parse(decode(files['manifest.json']));
  expect(manifest.outputs).toHaveLength(18);
  expect(manifest.listing).toEqual({ path: 'listing/listing.json', status: 'pass' });
  const listing = JSON.parse(decode(files['listing/listing.json']));
  expect(listing).toMatchObject({ mulliganListing: 1, status: 'pass' });
  expect(listing.fields['apple.keywords'].value).toBe('diary,medication,reminders,doctor');
  expect(decode(files['listing/listing.txt'])).toContain(
    '== Google Play · App title (14/30 chars) ==\nExample Health\n',
  );
});

test('status bar: reflects the worst finding across the workspace', async ({ page }) => {
  await expect(statusBar(page)).toHaveText('Ready');
  await page.getByRole('tab', { name: 'Listing' }).click();
  await field(page, 'App name').getByRole('textbox').fill('BEST App!!');
  await expect(statusBar(page)).toHaveText(/^\d+ failures? · \d+ warnings?$/);
  await expect(statusBar(page)).toHaveAttribute('data-status', 'failure');
});
