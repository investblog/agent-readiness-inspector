// Icon candidates (M1.5 blocker): renders several SVG concepts to the four
// store sizes so the choice is a look, not a description. Nothing here ships
// until one is picked — the winner's SVG becomes src/public/icons/*.png.
//
// Usage: npx tsx scripts/make-icon-candidates.mts
// Output: dev/icons/<name>-<size>.png + dev/icons/contact-sheet.png

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BRAND = '#0055DC'; // 301.st blue (theme.css --blue-700)
const BRAND_LIGHT = '#4DA3FF';
const INK = '#0B1B33';

/** Each candidate is a 128×128 SVG body drawn on a transparent canvas. */
const CANDIDATES: Record<string, string> = {
  // 1. Radar sweep — "we scan", closest to the product's own scan icon
  radar: `
    <circle cx="64" cy="64" r="56" fill="${BRAND}"/>
    <circle cx="64" cy="64" r="40" fill="none" stroke="#fff" stroke-width="6" opacity="0.55"/>
    <circle cx="64" cy="64" r="22" fill="none" stroke="#fff" stroke-width="6" opacity="0.8"/>
    <path d="M64 64 L64 12 A52 52 0 0 1 110 46 Z" fill="#fff" opacity="0.9"/>
    <circle cx="64" cy="64" r="7" fill="#fff"/>`,

  // 2. Document + check — "the machine files are in order"
  doc: `
    <rect x="16" y="10" width="96" height="108" rx="14" fill="${BRAND}"/>
    <rect x="34" y="34" width="60" height="8" rx="4" fill="#fff" opacity="0.9"/>
    <rect x="34" y="52" width="44" height="8" rx="4" fill="#fff" opacity="0.65"/>
    <rect x="34" y="70" width="52" height="8" rx="4" fill="#fff" opacity="0.65"/>
    <circle cx="92" cy="92" r="26" fill="#fff"/>
    <path d="M80 92 l9 9 l18 -19" fill="none" stroke="${BRAND}" stroke-width="9"
          stroke-linecap="round" stroke-linejoin="round"/>`,

  // 3. Robot eye through a magnifier — "what the agent sees"
  agentEye: `
    <circle cx="58" cy="58" r="44" fill="${BRAND}"/>
    <circle cx="58" cy="58" r="30" fill="#fff"/>
    <circle cx="58" cy="58" r="15" fill="${INK}"/>
    <circle cx="52" cy="52" r="5" fill="#fff" opacity="0.9"/>
    <rect x="86" y="86" width="34" height="14" rx="7" transform="rotate(45 86 86)" fill="${BRAND}"/>`,

  // 4. Signal bars in a bracket — "readiness level 0-5"
  level: `
    <rect x="10" y="10" width="108" height="108" rx="24" fill="${INK}"/>
    <rect x="30" y="74" width="14" height="26" rx="5" fill="${BRAND_LIGHT}"/>
    <rect x="52" y="60" width="14" height="40" rx="5" fill="${BRAND_LIGHT}"/>
    <rect x="74" y="44" width="14" height="56" rx="5" fill="#fff"/>
    <rect x="96" y="28" width="14" height="72" rx="5" fill="#fff" opacity="0.35"/>`,
};

const SIZES = [16, 32, 48, 128];
const OUT = path.resolve('dev', 'icons');

function svgDocument(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">${body}</svg>`;
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
  for (const [name, body] of Object.entries(CANDIDATES)) {
    fs.writeFileSync(path.join(OUT, `${name}.svg`), `${svgDocument(body)}\n`, 'utf8');
    for (const size of SIZES) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<body style="margin:0;background:transparent">
           <img src="data:image/svg+xml;base64,${Buffer.from(svgDocument(body)).toString('base64')}"
                width="${size}" height="${size}">
         </body>`,
      );
      await page.screenshot({ path: path.join(OUT, `${name}-${size}.png`), omitBackground: true });
    }
    console.log(`[icons] ${name}: ${SIZES.join('/')}px`);
  }

  // contact sheet: every candidate at every size, on both surfaces, so the
  // 16px legibility problem is visible instead of assumed
  const rows = Object.keys(CANDIDATES)
    .map((name) => {
      const cells = SIZES.map(
        (size) =>
          `<td><img src="${name}-${size}.png" width="${size}" height="${size}"><div class="cap">${size}</div></td>`,
      ).join('');
      return `<tr><th>${name}</th>${cells}</tr>`;
    })
    .join('');
  const sheet = `<!doctype html><meta charset="utf-8">
    <style>
      body{font:13px system-ui;margin:0;display:flex}
      .pane{flex:1;padding:20px}
      .light{background:#fff;color:#111}.dark{background:#16181d;color:#e6e6e6}
      table{border-collapse:collapse}th{text-align:left;padding-right:16px;font-weight:600}
      td{padding:10px 14px;text-align:center;vertical-align:bottom}
      .cap{font-size:10px;opacity:.5;margin-top:4px}
    </style>
    <div class="pane light"><table>${rows}</table></div>
    <div class="pane dark"><table>${rows}</table></div>`;
  fs.writeFileSync(path.join(OUT, 'contact-sheet.html'), sheet, 'utf8');

  const sheetPage = await browser.newPage({ viewport: { width: 900, height: 560 } });
  await sheetPage.goto(`file://${path.join(OUT, 'contact-sheet.html').replace(/\\/g, '/')}`);
  await sheetPage.screenshot({ path: path.join(OUT, 'contact-sheet.png'), fullPage: true });
  console.log(`[icons] contact sheet → dev/icons/contact-sheet.png`);
} finally {
  await browser.close();
}
