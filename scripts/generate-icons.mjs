#!/usr/bin/env node
/**
 * Renders the launcher icons from code, so the app icon is defined the same way
 * every other mark in this project is: by a path, not a binary someone has to
 * open a design tool to change.
 *
 * Home-screen icons cannot stay vector - Android needs PNG for maskable icons
 * and iOS needs PNG for apple-touch-icon - so the PNGs are committed. Re-run
 * this after changing the mark:
 *
 *   npm run icons
 *
 * The mark is a filled version of the "broken-compass" sigil - the same
 * four-point star as the `compass` icon in design/icons.tsx and the Splash
 * scene, redrawn solid rather than stroked because a launcher icon has to
 * read at 48px on a homescreen, where thin strokes and the compass rings
 * disappear. Keep the silhouette in sync with those if the sigil changes.
 */
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'frontend', 'public');

const COMPASS = 'M50 6 60 40 94 50 60 60 50 94 40 60 6 50 40 40Z';

/**
 * @param inset fraction of the canvas to keep clear around the mark. Maskable
 *   icons get cropped to a circle by the launcher, so the mark has to sit
 *   inside the middle 80% or Android will clip the star's points.
 */
function iconSvg({ size, inset, radius }) {
  const markBox = size * (1 - inset * 2);
  const scale = markBox / 100; // the compass viewBox is 100x100
  const x = (size - markBox) / 2;
  const y = (size - markBox) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b1f23"/>
      <stop offset="1" stop-color="#0f1113"/>
    </linearGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cba871"/>
      <stop offset="1" stop-color="#b08d57"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>
  <g transform="translate(${x} ${y}) scale(${scale})">
    <path d="${COMPASS}" fill="url(#mark)" stroke="#6b5530" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="50" cy="50" r="6" fill="#e7e1d6"/>
  </g>
</svg>`;
}

const TARGETS = [
  // Standard icons keep square corners at the platform's mercy, so they carry
  // their own rounding. Maskable gets none - the launcher supplies the shape.
  { file: 'icon-192.png', size: 192, inset: 0.22, radius: 42 },
  { file: 'icon-512.png', size: 512, inset: 0.22, radius: 112 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.3, radius: 0 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.22, radius: 0 },
];

await mkdir(publicDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

for (const { file, size, inset, radius } of TARGETS) {
  const svg = iconSvg({ size, inset, radius });
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0">${svg}</body>`,
    { waitUntil: 'load' },
  );
  const buffer = await page.screenshot({ omitBackground: true });
  await writeFile(join(publicDir, file), buffer);
  console.log(`  ${file}  ${size}x${size}`);
}

await browser.close();

// The favicon stays vector: browsers handle SVG favicons, and it keeps the one
// place the mark is likely to be tweaked in a readable format.
await writeFile(join(publicDir, 'favicon.svg'), iconSvg({ size: 64, inset: 0.16, radius: 14 }));
console.log('  favicon.svg');

console.log('\nIcons written to frontend/public/');
