// Regenerates the README screenshots in docs/images/ from the production build:
//   pnpm build && pnpm readme:screenshots
// The demo assets (a made-up symptom-tracker app, "Daylog") are drawn here with HTML, at the sizes
// an agency typically delivers, so the screenshots show real crops, warnings and cleanup.
/* global DataTransfer, ClipboardEvent */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PORT = 4178;
const root = fileURLToPath(new URL('../..', import.meta.url));
const out = `${root}docs/images`;

const screen = (title, body, extra = '') => `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  body { font: 17px/1.4 -apple-system, system-ui, sans-serif; background: #f4f1ea; color: #1d2b2a; }
  .status { height: 54px; } header { padding: 8px 22px 14px; }
  h1 { font-size: 32px; } .sub { color: #5d6b69; margin-top: 4px; }
  .card { background: #fff; border-radius: 18px; margin: 12px 18px; padding: 16px 18px;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }
  .row { display: flex; justify-content: space-between; align-items: center; }
  .pill { background: #2f7d6b; color: #fff; border-radius: 999px; padding: 4px 12px; font-size: 14px; }
  .bar { height: 10px; border-radius: 5px; background: #e3ece9; margin-top: 10px; }
  .bar i { display: block; height: 100%; border-radius: 5px; background: #2f7d6b; }
  .big { font-size: 44px; font-weight: 700; } .muted { color: #5d6b69; font-size: 15px; }
  ${extra}
</style></head><body><div class="status"></div><header><h1>${title}</h1></header>${body}</body></html>`;

const card = (title, detail, pct) =>
  `<div class="card"><div class="row"><strong>${title}</strong><span class="pill">${pct}%</span></div>
   <div class="muted">${detail}</div><div class="bar"><i style="width:${pct}%"></i></div></div>`;

const SCREENS = [
  [
    '1 Today.png',
    screen(
      'Today',
      `<div class="card"><div class="muted">Symptom score</div><div class="big">3 / 10</div>
       <div class="muted">Down from 5 yesterday</div></div>
       ${card('Morning medication', 'Taken at 8:05', 100)}
       ${card('Hydration', '5 of 8 glasses', 62)}
       ${card('Sleep', '6 h 40 min', 83)}
       ${card('Steps', '4,210 of 7,000', 60)}`,
    ),
  ],
  [
    '2 Log a symptom.png',
    screen(
      'Log a symptom',
      ['Headache', 'Fatigue', 'Nausea', 'Joint pain', 'Dizziness', 'Brain fog']
        .map((s, i) => card(s, i % 2 ? 'Mild · this morning' : 'Moderate · yesterday', 20 + i * 13))
        .join(''),
    ),
  ],
  [
    '3 Share with your doctor.png',
    screen(
      'Share',
      `<div class="card"><strong>Summary for Dr. Patel</strong>
       <div class="muted" style="margin-top:8px">Last 30 days · symptoms, medications, sleep</div></div>
       ${card('Symptoms logged', '41 entries', 82)}
       ${card('Medication adherence', '28 of 30 days', 93)}
       <div class="card" style="text-align:center"><span class="pill">Create PDF</span></div>`,
    ),
  ],
  [
    // A full-page capture of a scrolling screen: much taller than any preset.
    '4 History (full page).png',
    screen(
      'History',
      Array.from({ length: 24 }, (_, i) =>
        card(`October ${26 - i}`, `${(i % 4) + 1} symptoms logged`, 30 + ((i * 17) % 60)),
      ).join(''),
    ),
  ],
];

const BANNER = `<!doctype html><html><head><style>
  body { margin: 0; width: 1200px; height: 628px; display: flex; align-items: center; gap: 48px;
    padding: 0 90px; box-sizing: border-box; font-family: -apple-system, system-ui, sans-serif;
    background: linear-gradient(120deg, #2f7d6b, #1d4f5c); color: #fff; }
  .logo { width: 180px; height: 180px; border-radius: 40px; background: #f4f1ea; display: grid;
    place-items: center; font-size: 110px; font-weight: 800; color: #2f7d6b; }
  h1 { font-size: 84px; margin: 0; } p { font-size: 34px; margin: 10px 0 0; opacity: 0.9; }
</style></head><body><div class="logo">D</div><div><h1>Daylog</h1>
<p>Track symptoms. Share with your doctor.</p></div></body></html>`;

const ICON = `<!doctype html><html><head><style>
  html, body { margin: 0; background: transparent; }
  div { width: 1024px; height: 1024px; border-radius: 230px; display: grid; place-items: center;
    background: linear-gradient(140deg, #3a9a83, #1d4f5c); color: #f4f1ea;
    font: 800 620px/1 -apple-system, system-ui, sans-serif; }
</style></head><body><div>D</div></body></html>`;

const WORD_DESCRIPTION = `<p class=MsoNormal>Daylog&nbsp;helps you keep track of how you feel, day by day, and turns it
into a clear summary&nbsp;you can share with your doctor 🩺.</p>
<p class=MsoNormal>KEY FEATURES</p>
<ul><li>Log symptoms in a few taps, with severity and notes</li>
<li>Medication reminders that fit your&nbsp;schedule</li>
<li>Sleep, hydration and activity in one place</li>
<li>A one-page PDF summary for your next appointment</li></ul>
<p class=MsoNormal>Your data stays on your phone unless you choose to share it.</p>`;

async function render(browser, html, width, height, scale = 1, transparent = false) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.setContent(html);
  const buffer = await page.screenshot({ fullPage: true, omitBackground: transparent });
  await page.close();
  return buffer;
}

async function pasteRich(locator, html) {
  await locator.evaluate(
    (element, data) => {
      const transfer = new DataTransfer();
      transfer.setData('text/html', data.html);
      transfer.setData('text/plain', data.text);
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
    },
    { html, text: html.replace(/<[^>]*>/g, ' ') },
  );
}

const server = spawn(
  'pnpm',
  ['--filter', '@mulligan/web', 'exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: root, stdio: 'ignore' },
);
const browser = await chromium.launch();
try {
  mkdirSync(out, { recursive: true });
  // iPhone 15 Pro Max captures: 430 × 932 points at 3× is 1290 × 2796.
  const screens = [];
  for (const [name, html] of SCREENS) {
    screens.push({
      name,
      mimeType: 'image/png',
      buffer: await render(browser, html, 430, 932, 3),
    });
  }
  const banner = await render(browser, BANNER, 1200, 628);
  const icon = await render(browser, ICON, 1024, 1024, 1, true);

  const page = await browser.newPage({
    viewport: { width: 1440, height: 1400 },
    deviceScaleFactor: 2,
  });
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.goto(`http://localhost:${PORT}/`);
      break;
    } catch (error) {
      if (attempt > 20) throw error;
      await page.waitForTimeout(500);
    }
  }
  const shot = (name, options = {}) => page.screenshot({ path: `${out}/${name}.png`, ...options });
  const settle = async () => {
    await page.locator('article [role="status"]', { hasText: 'Rendering…' }).first().waitFor({
      state: 'detached',
      timeout: 60_000,
    });
    await page.waitForTimeout(500);
  };

  // Images
  await page.getByTestId('file-input-screenshot').setInputFiles(screens);
  await page
    .getByTestId('file-input-feature-graphic')
    .setInputFiles({ name: 'Daylog banner 1200x628.png', mimeType: 'image/png', buffer: banner });
  await page
    .getByTestId('file-input-icon')
    .setInputFiles({ name: 'Daylog icon.png', mimeType: 'image/png', buffer: icon });
  await settle();
  // The first save shows a one-off notice; dismiss it so it is not in every screenshot.
  await page.getByRole('button', { name: 'Got it' }).click();
  await shot('images');
  await page
    .getByRole('heading', { name: 'Feature graphic', exact: true })
    .scrollIntoViewIfNeeded();
  await settle();
  await shot('images-artwork');

  // Listing
  await page.getByRole('tab', { name: 'Listing' }).click();
  const field = (label) => page.getByRole('article', { name: label, exact: true });
  await field('App name').getByRole('textbox').fill('Daylog: Symptom Tracker');
  await field('Subtitle').getByRole('textbox').fill('Track how you feel, day by day');
  await field('Promotional text')
    .getByRole('textbox')
    .fill('NEW: share a one-page summary with your doctor!! Now with medication reminders 💊');
  await pasteRich(field('Description').getByRole('textbox'), WORD_DESCRIPTION);
  await field('Keywords')
    .getByRole('textbox')
    .fill('symptom tracker, health diary, medication reminder, Daylog, migraine; fatigue');
  for (const label of ['App title', 'Short description', 'Full description']) {
    await field(label)
      .getByRole('button', { name: /^Copy from iOS/ })
      .click();
  }
  await page.waitForTimeout(400);
  await field('Description')
    .getByRole('button', { name: /^Review changes/ })
    .click();
  await field('Description').evaluate((article) => article.scrollIntoView({ block: 'start' }));
  await shot('listing-review');
  await page
    .getByRole('heading', { name: 'Google Play', exact: true })
    .evaluate((heading) => heading.scrollIntoView({ block: 'start' }));
  await shot('listing-google');

  // Package
  await page.getByRole('tab', { name: 'Package' }).click();
  await page.waitForTimeout(500);
  await shot('package');

  // Help
  await page
    .getByRole('navigation', { name: 'Pages' })
    .getByRole('button', { name: 'Help' })
    .click();
  await page
    .getByRole('heading', { name: 'Listing fields' })
    .evaluate((heading) => heading.scrollIntoView({ block: 'start' }));
  await shot('help');
  console.log(`wrote screenshots to ${out}`);
} finally {
  await browser.close();
  server.kill();
}
