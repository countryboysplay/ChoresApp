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
 * The bolt path is the one from the splash Logo component. Keep them in sync.
 */
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'frontend', 'public');

const BOLT = 'M17 1 3 24h11L11 41 31 16H19l6-15Z';

/**
 * @param inset fraction of the canvas to keep clear around the mark. Maskable
 *   icons get cropped to a circle by the launcher, so the mark has to sit
 *   inside the middle 80% or Android will clip the bolt.
 */
function iconSvg({ size, inset, radius }) {
  const boltBox = size * (1 - inset * 2);
  const scale = boltBox / 42; // the bolt viewBox is 34x42, height is the constraint
  const boltW = 34 * scale;
  const x = (size - boltW) / 2;
  const y = (size - boltBox) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#142254"/>
      <stop offset="1" stop-color="#0a1230"/>
    </linearGradient>
    <linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd451"/>
      <stop offset="1" stop-color="#ffc107"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>
  <g transform="translate(${x} ${y}) scale(${scale})">
    <path d="${BOLT}" fill="url(#bolt)" stroke="#b06a00" stroke-width="2" stroke-linejoin="round"/>
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
