// Renders the brand mascot (src/assets/brand-icon.svg) to the extension's
// toolbar/store PNGs. Run after changing the SVG: npm run build:brand-icons
//
// The source paints the eyes with `currentColor` so the web surfaces can adapt
// them to the theme. A PNG has no such context and the mascot's face is
// transparent, so dark eyes vanish on dark toolbars and white eyes vanish on
// light ones — the packaged icons use the brand colour, the only value that
// reads on light, Chrome-grey and dark panels alike (verified on a contact
// sheet across all three).

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BRAND = '#3962f1';
const SIZES = [16, 32, 48, 128];
const SRC = path.resolve('src/assets/brand-icon.svg');
const OUT = path.resolve('src/public/icons');

const svg = fs.readFileSync(SRC, 'utf8').replace('<svg ', `<svg color="${BRAND}" `);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<body style="margin:0;background:transparent">
         <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}">
       </body>`,
    );
    await page.screenshot({ path: path.join(OUT, `${size}.png`), omitBackground: true });
  }
  console.log(`[brand] icons ${SIZES.join('/')}px → src/public/icons/`);
} finally {
  await browser.close();
}
