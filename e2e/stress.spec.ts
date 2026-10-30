// Automated proxy for the Sprint 2 manual exit criterion: ten 1290 × 12000 screenshots across all
// six screenshot presets complete without the tab crashing. The manual check on the reference
// Windows machine (Chrome/Edge) still has to be done by a person.
import {
  downloadPackage,
  expect,
  fixture,
  pngHeader,
  pngVariant,
  test,
  unzipDownload,
  upload,
  waitForRenders,
} from './helpers.ts';

test('ten 1290 × 12000 captures × six screenshot presets', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  const capture = fixture('images/long-capture/source.png');
  await upload(
    page,
    'screenshot',
    Array.from({ length: 10 }, (_, i) => ({
      name: `capture-${String(i + 1).padStart(2, '0')}.png`,
      mimeType: 'image/png',
      buffer: pngVariant(capture, `capture ${i + 1}`),
    })),
  );
  for (const name of [/iPhone 6\.1"/, /iPad 13"/, /Android 7"/, /Android 10"/]) {
    await page.getByRole('checkbox', { name }).check();
  }
  await waitForRenders(page, 60, 480_000);

  const files = await unzipDownload(await downloadPackage(page, { timeout: 480_000 }));
  const images = Object.keys(files).filter((p) => p.endsWith('.png'));
  expect(images).toHaveLength(60);
  expect(pngHeader(files['iphone-6.3/10_capture-10.png']!)).toMatchObject({
    width: 1206,
    height: 2622,
  });
  expect(pngHeader(files['android-tablet-10/01_capture-01.png']!)).toMatchObject({
    width: 1600,
    height: 2560,
  });
});
