import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  downloadPackage,
  expect,
  imageFile,
  pngHeader,
  test,
  unzipDownload,
  upload,
  waitForRenders,
} from './helpers.ts';

const headers = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../apps/web/security/headers.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, string>;
// The preview server is plain HTTP, so it leaves out the HTTPS-only upgrades (spec §10.3).
const previewHeaders = { ...headers };
delete previewHeaders['Strict-Transport-Security'];
previewHeaders['Content-Security-Policy'] = headers['Content-Security-Policy']!.replace(
  '; upgrade-insecure-requests',
  '',
);

const SIX = [
  imageFile('3-settings.png', 'images/landscape/source.png'),
  imageFile('1-home.png', 'images/long-capture/source.png'),
  imageFile('6-share.jpg', 'images/exif-rotated/source.jpg'),
  imageFile('2-dashboard.png', 'images/exact-size/source.png'),
  imageFile('5-history.jpg', 'images/photo/source.jpg'),
  imageFile('4-reminders.png', 'images/sixteen-bit/source.png'),
];

const DIMENSIONS: Record<string, [number, number]> = {
  'iphone-6.3': [1206, 2622],
  'android-phone': [1080, 1920],
  'ipad-13': [2064, 2752],
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('serves the production security headers, minus the HTTPS upgrades', async ({
  page,
  request,
}) => {
  for (const path of ['/', await page.locator('script[type="module"]').getAttribute('src')]) {
    const response = await request.get(path!);
    for (const [name, value] of Object.entries(previewHeaders)) {
      expect(response.headers()[name.toLowerCase()], `${name} on ${path}`).toBe(value);
    }
    expect(response.headers()['strict-transport-security']).toBeUndefined();

    // A revalidation's 304 carries them too: WebKit checks COEP against it when loading a worker.
    const revalidated = await request.get(path!, {
      headers: { 'If-None-Match': response.headers()['etag']! },
    });
    expect(revalidated.status(), `revalidating ${path}`).toBe(304);
    for (const [name, value] of Object.entries(previewHeaders)) {
      expect(revalidated.headers()[name.toLowerCase()], `${name} on 304 ${path}`).toBe(value);
    }
  }
});

test('six screenshots, reordered, three presets: 18 files and a manifest', async ({ page }) => {
  await upload(page, 'screenshot', SIX);
  const list = page
    .getByRole('list')
    .filter({ has: page.getByRole('button', { name: /^Reorder / }) });
  await expect(list.getByRole('listitem')).toHaveCount(6);

  // Received order is kept; reorder to 1…6 with the keyboard (dnd-kit), the mouse and buttons.
  const names = () => list.getByRole('listitem').locator('strong').allTextContents();
  await expect.poll(names).toEqual(SIX.map((f) => f.name));

  // Keyboard: pick up 1-home (position 2), move up, drop.
  // dnd-kit attaches its keyboard listeners a tick after pick-up, so pause between keys.
  await page.getByRole('button', { name: 'Reorder 1-home.png' }).focus();
  for (const key of ['Space', 'ArrowUp', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await expect
    .poll(names)
    .toEqual([
      '1-home.png',
      '3-settings.png',
      '6-share.jpg',
      '2-dashboard.png',
      '5-history.jpg',
      '4-reminders.png',
    ]);

  // Mouse: drag 2-dashboard (position 4) onto position 2.
  const handle = page.getByRole('button', { name: 'Reorder 2-dashboard.png' });
  const target = page.getByRole('button', { name: 'Reorder 3-settings.png' });
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 4, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(names)
    .toEqual([
      '1-home.png',
      '2-dashboard.png',
      '3-settings.png',
      '6-share.jpg',
      '5-history.jpg',
      '4-reminders.png',
    ]);
  // dnd-kit swallows clicks for 50 ms after a drop (so a drop is not also a click).
  await page.waitForTimeout(100);

  // Buttons for the rest, waiting for each move (and its animation) to settle.
  const ordered = [
    '1-home.png',
    '2-dashboard.png',
    '3-settings.png',
    '4-reminders.png',
    '5-history.jpg',
    '6-share.jpg',
  ];
  for (const [button, after] of [
    [
      'Move 4-reminders.png up',
      [
        '1-home.png',
        '2-dashboard.png',
        '3-settings.png',
        '6-share.jpg',
        '4-reminders.png',
        '5-history.jpg',
      ],
    ],
    [
      'Move 4-reminders.png up',
      [
        '1-home.png',
        '2-dashboard.png',
        '3-settings.png',
        '4-reminders.png',
        '6-share.jpg',
        '5-history.jpg',
      ],
    ],
    ['Move 5-history.jpg up', ordered],
  ] as const) {
    await page.getByRole('button', { name: button }).click();
    await expect.poll(names).toEqual(after);
  }

  // iPhone 6.3" and Android phone are selected by default; add iPad 13".
  await page.getByRole('checkbox', { name: /iPad 13" screenshot/ }).check();
  await waitForRenders(page, 18);

  const files = await unzipDownload(await downloadPackage(page));
  const imagePaths = Object.keys(files)
    .filter((p) => p.endsWith('.png'))
    .sort();
  const slugs = ordered.map(
    (n, i) => `${String(i + 1).padStart(2, '0')}_${n.replace(/\.(png|jpg)$/, '')}`,
  );
  const expected = Object.keys(DIMENSIONS)
    .flatMap((folder) => slugs.map((s) => `${folder}/${s}.png`))
    .sort();
  expect(imagePaths).toEqual(expected);

  for (const path of imagePaths) {
    const [width, height] = DIMENSIONS[path.slice(0, path.indexOf('/'))]!;
    expect(pngHeader(files[path]!), path).toMatchObject({
      width,
      height,
      colorType: 2,
      hasTrns: false,
    });
  }

  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
  expect(manifest).toMatchObject({ mulliganManifest: 1, app: { name: 'mulligan-web' } });
  expect(
    manifest.sources.map((s: { seq: number; fileName: string }) => [s.seq, s.fileName]),
  ).toEqual(ordered.map((name, i) => [i + 1, name]));
  expect(manifest.outputs).toHaveLength(18);
  expect(manifest.outputs.map((o: { path: string }) => o.path).sort()).toEqual(expected);
  expect(Object.keys(files)).toHaveLength(19);
});

test('icons: Apple icon without alpha, Play icon under 1 MB', async ({ page }) => {
  await upload(page, 'icon', [imageFile('App Icon.png', 'images/small-icon/source.png')]);
  await waitForRenders(page, 2);
  const files = await unzipDownload(await downloadPackage(page));
  const apple = files['icons/01_app-icon_apple-1024.png']!;
  const play = files['icons/01_app-icon_play-512.png']!;
  expect(pngHeader(apple)).toEqual({ width: 1024, height: 1024, colorType: 2, hasTrns: false });
  expect(pngHeader(play)).toMatchObject({ width: 512, height: 512, colorType: 6 });
  expect(play.length).toBeLessThan(1024 * 1024);
});

test('unreadable and unsupported files are reported and left out of the package', async ({
  page,
}) => {
  await upload(page, 'screenshot', [
    imageFile('page.png', 'images/not-an-image/source.png'),
    imageFile('good.png', 'images/exact-size/source.png'),
    imageFile('broken.png', 'images/corrupt/source.png'),
  ]);
  const notices = page.getByRole('alert');
  await expect(notices).toContainText('page.png was not added. Not a PNG or JPEG file.');
  await expect(notices).toContainText('broken.png was not added. PNG file is truncated.');
  await waitForRenders(page, 2);

  const files = await unzipDownload(await downloadPackage(page));
  expect(Object.keys(files).sort()).toEqual([
    'android-phone/01_good.png',
    'iphone-6.3/01_good.png',
    'manifest.json',
  ]);
});

test('a dropped feature graphic selects its preset and is packaged', async ({ page }) => {
  await upload(page, 'feature-graphic', [imageFile('banner.png', 'images/landscape/source.png')]);
  await waitForRenders(page, 1);
  const files = await unzipDownload(await downloadPackage(page));
  const banners = Object.keys(files).filter((path) => path.startsWith('play-feature-graphic/'));
  expect(banners).toHaveLength(1);
  expect(pngHeader(files[banners[0]!]!)).toMatchObject({ width: 1024, height: 500 });
});

test('a single-file zone asks before replacing its file', async ({ page }) => {
  await upload(page, 'feature-graphic', [imageFile('banner.png', 'images/landscape/source.png')]);
  await expect(page.getByText('banner.png', { exact: true })).toBeVisible();
  await upload(page, 'feature-graphic', [
    imageFile('new-banner.png', 'images/exact-size/source.png'),
  ]);
  const prompt = page.getByRole('alertdialog');
  await expect(prompt).toContainText('Replace banner.png with new-banner.png?');
  await prompt.getByRole('button', { name: 'Keep current' }).click();
  await expect(page.getByText('banner.png', { exact: true })).toBeVisible();
  await upload(page, 'feature-graphic', [
    imageFile('new-banner.png', 'images/exact-size/source.png'),
  ]);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replace' }).click();
  await expect(page.getByText('new-banner.png', { exact: true })).toBeVisible();
  await expect(page.getByText('banner.png', { exact: true })).toHaveCount(0);
});

test('images and previews survive switching tabs', async ({ page }) => {
  await upload(page, 'screenshot', [imageFile('home.png', 'images/exact-size/source.png')]);
  await waitForRenders(page, 2);
  await page.getByRole('tab', { name: 'Listing' }).click();
  await page.getByRole('tab', { name: 'Package' }).click();
  await expect(page.getByRole('row', { name: /iphone-6\.3\// })).toContainText('1');
  await page.getByRole('tab', { name: 'Images' }).click();
  await expect(page.getByText('home.png', { exact: true })).toBeVisible();
  await waitForRenders(page, 2);
  await expect(page.getByRole('img', { name: /result for home\.png/ })).toHaveCount(2);
});

test('link and HTML drags never import or navigate', async ({ page }) => {
  const zone = page.locator('[data-dropzone]').first();
  for (const type of ['text/uri-list', 'text/html']) {
    await zone.evaluate((element, mime) => {
      const data = new DataTransfer();
      data.setData(
        mime,
        mime === 'text/html'
          ? '<img src="https://example.com/x.png">'
          : 'https://example.com/x.png',
      );
      element.dispatchEvent(
        new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }),
      );
      element.dispatchEvent(
        new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
      );
      document.body.dispatchEvent(
        new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
      );
    }, type);
  }
  await expect(page).toHaveURL(/localhost:4174\/$/);
  await expect(page.getByRole('button', { name: /^Reorder / })).toHaveCount(0);
});
