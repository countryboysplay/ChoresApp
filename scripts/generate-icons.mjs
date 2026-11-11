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
 * The mark is the arcade HUD in miniature: a cut-corner plate (the same
 * chamfer as the kid buttons and cards in design/neon-hud.css) with gold HUD
 * brackets, holding the diamond "stop" from Home's "Today's run" track with a
 * check in it. Only bold shapes, so it still reads at 48px on a homescreen.
 */
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'frontend', 'public');

/**
 * @param inset fraction of the canvas to keep clear around the mark. Maskable
 *   icons get cropped to a circle by the launcher, so the mark has to sit
 *   inside the middle 80% or Android will clip it.
 */
function iconSvg({ size, inset, radius }) {
  const markBox = size * (1 - inset * 2);
  const scale = markBox / 100; // the mark is drawn in a 100x100 box
  const offset = (size - markBox) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#121c44"/>
      <stop offset="1" stop-color="#05070f"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.45" r="0.55">
      <stop offset="0" stop-color="#40e4ff" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#40e4ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#40e4ff"/>
      <stop offset="1" stop-color="#aa69ff"/>
    </linearGradient>
    <linearGradient id="gem" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7cf0ff"/>
      <stop offset="0.55" stop-color="#40c8ff"/>
      <stop offset="1" stop-color="#aa69ff"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe498"/>
      <stop offset="1" stop-color="#f2a33c"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#halo)"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 6H94V76L76 94H6V24Z" fill="#0b1230" fill-opacity="0.85" stroke="url(#rim)" stroke-width="4.5"/>
    <path d="M77 14h9v9M14 77v9h9" fill="none" stroke="url(#gold)" stroke-width="4"/>
    <path d="M50 17 83 50 50 83 17 50Z" fill="#40e4ff" opacity="0.55" filter="url(#glow)"/>
    <path d="M50 17 83 50 50 83 17 50Z" fill="url(#gem)" stroke="#d9fbff" stroke-width="1.5"/>
    <path d="M35 51l10 10 20-21" fill="none" stroke="#0a0f24" stroke-width="9"/>
  </g>
</svg>`;
}

const TARGETS = [
  // Standard icons keep square corners at the platform's mercy, so they carry
  // their own rounding. Maskable gets none - the launcher supplies the shape.
  { file: 'icon-192.png', size: 192, inset: 0.14, radius: 42 },
  { file: 'icon-512.png', size: 512, inset: 0.14, radius: 112 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.22, radius: 0 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.14, radius: 0 },
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
await writeFile(join(publicDir, 'favicon.svg'), iconSvg({ size: 64, inset: 0.04, radius: 14 }));
console.log('  favicon.svg');

console.log('\nIcons written to frontend/public/');
