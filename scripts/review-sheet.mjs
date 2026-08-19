#!/usr/bin/env node
/**
 * Builds a single self-contained HTML page showing every screen, for visual
 * review away from a laptop. Images are captured at 1x and encoded as JPEG so
 * the whole review fits in one file that can be published or emailed.
 *
 * The 3x PNGs from screenshots.mjs are the ones to zoom into for detail; this
 * is the overview that makes gaps between screens obvious.
 *
 *   npm run dev -w frontend     # in another terminal
 *   node scripts/review-sheet.mjs
 */
import { chromium, devices } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const outFile = process.env.OUT ?? join(root, 'screenshots', 'review.html');

/** Routes this pass changed, marked so the reviewer knows where to look hardest. */
const CHANGED = new Set(['#/', '#/profiles', '#/pin/child-1']);

const GROUPS = [
  {
    title: 'Entry',
    note: 'Before anyone is signed in. No bottom navigation on these three.',
    screens: [
      ['#/', 'Splash'],
      ['#/profiles', 'Choose your hero'],
      ['#/pin/child-1', 'PIN entry'],
    ],
  },
  {
    title: 'Child',
    note: 'The everyday surface. Bottom navigation is fixed; content scrolls under it.',
    screens: [
      ['#/child/home', 'Home'],
      ['#/child/missions', 'Missions'],
      ['#/child/chore/core-kitchen', 'Chore - checklist'],
      ['#/child/chore/core-bathroom', 'Chore - needs fixing'],
      ['#/child/rewards', 'Rewards'],
      ['#/child/wallet', 'Wallet'],
      ['#/child/leaderboard', 'Leaderboard'],
      ['#/child/achievements', 'Achievements'],
      ['#/child/notifications', 'Inbox'],
      ['#/child/profile', 'Profile and avatar'],
    ],
  },
  {
    title: 'Parent',
    note: 'Same palette as the child app by decision. A sidebar replaces the bottom nav at 1000px and wider.',
    screens: [
      ['#/parent', 'Dashboard'],
      ['#/parent/approvals', 'Approval queue'],
      ['#/parent/approvals/sub1', 'Approval review'],
      ['#/parent/schedule', 'Schedule'],
      ['#/parent/chores/new', 'New chore wizard'],
      ['#/parent/bonus', 'Bonus chores'],
      ['#/parent/rewards', 'Rewards'],
      ['#/parent/children', 'Children'],
      ['#/parent/notifications', 'Inbox'],
      ['#/parent/settings', 'Settings'],
      ['#/parent/system', 'System status'],
    ],
  },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices['iPhone 13'],
  deviceScaleFactor: 1, // 1x keeps the page small enough to stay self-contained
});

let captured = 0;
for (const group of GROUPS) {
  for (const screen of group.screens) {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/${screen[0]}`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const buffer = await page.screenshot({ type: 'jpeg', quality: 72 });
    screen[2] = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    await page.close();
    captured += 1;
  }
}
await browser.close();

const sections = GROUPS.map(
  (g) => `
    <section>
      <div class="sec-head">
        <h2>${g.title}</h2>
        <span class="count">${g.screens.length} screens</span>
      </div>
      <p class="note">${g.note}</p>
      <div class="grid">
        ${g.screens
          .map(
            ([route, label, src]) => `
          <figure${CHANGED.has(route) ? ' class="changed"' : ''}>
            <img src="${src}" alt="${label}" loading="lazy" width="390" height="664" />
            <figcaption>
              <strong>${label}</strong>
              <code>${route}</code>
            </figcaption>
          </figure>`,
          )
          .join('')}
      </div>
    </section>`,
).join('');

const html = `<title>Chore Quest Screens</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700&display=swap" />
<style>
  /*
   * Palette is lifted from frontend/src/styles/tokens.css rather than invented,
   * so this review page sits in the same world as the thing it is reviewing.
   * Light is the base; the two blocks below redefine only the tokens.
   */
  :root {
    color-scheme: light dark;
    --bg: #eef2f8;
    --panel: #ffffff;
    --ink: #16203d;
    --muted: #5d6a86;
    --line: rgba(22, 32, 61, 0.13);
    --accent: #2f6bed;
    --gold: #b57d00;
    --shadow: 0 1px 2px rgba(10, 18, 48, 0.06), 0 8px 20px rgba(10, 18, 48, 0.07);
  }
  :root:not([data-theme="light"]) {
    @media (prefers-color-scheme: dark) {
      --bg: #0a1230;
      --panel: #142254;
      --ink: #e4ebff;
      --muted: #9fb3e0;
      --line: rgba(122, 158, 255, 0.22);
      --accent: #7aa2ff;
      --gold: #ffc107;
      --shadow: 0 1px 2px rgba(2, 6, 20, 0.5), 0 10px 26px rgba(2, 6, 20, 0.45);
    }
  }
  :root[data-theme="dark"] {
    --bg: #0a1230;
    --panel: #142254;
    --ink: #e4ebff;
    --muted: #9fb3e0;
    --line: rgba(122, 158, 255, 0.22);
    --accent: #7aa2ff;
    --gold: #ffc107;
    --shadow: 0 1px 2px rgba(2, 6, 20, 0.5), 0 10px 26px rgba(2, 6, 20, 0.45);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: clamp(32px, 6vw, 64px) clamp(16px, 4vw, 40px) 96px;
    background: var(--bg);
    color: var(--ink);
    font-family: Nunito, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 16px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px; }

  .eyebrow {
    font-family: Nunito, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--muted);
    margin: 0;
  }
  h1 {
    font-family: Fredoka, Nunito, sans-serif;
    font-weight: 600;
    font-size: clamp(1.9rem, 5vw, 2.9rem);
    line-height: 1.1;
    margin: 6px 0 0;
    text-wrap: balance;
  }
  .lede { color: var(--muted); margin: 14px 0 0; max-width: 64ch; }

  .fixed-list {
    margin: 36px 0 8px;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 10px;
    max-width: 78ch;
  }
  .fixed-list li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: baseline;
    background: var(--panel);
    border: 1px solid var(--line);
    border-left: 3px solid var(--gold);
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 0.94rem;
  }
  .fixed-list b { font-weight: 700; }
  .tag {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--gold);
    white-space: nowrap;
  }

  section { margin-top: 44px; }
  .sec-head { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  h2 {
    font-family: Fredoka, Nunito, sans-serif;
    font-weight: 600;
    font-size: 1.35rem;
    margin: 0;
  }
  .count { font-size: 0.8rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .note { color: var(--muted); font-size: 0.92rem; margin: 10px 0 22px; max-width: 72ch; }

  .grid { display: grid; gap: 22px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  figure {
    margin: 0;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
    box-shadow: var(--shadow);
  }
  figure.changed { border-color: var(--gold); }
  img { display: block; width: 100%; height: auto; border-bottom: 1px solid var(--line); }
  figcaption { padding: 11px 13px 13px; display: grid; gap: 3px; }
  figcaption strong { font-size: 0.9rem; font-weight: 700; }
  code {
    color: var(--muted);
    font-size: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-all;
  }
  figure.changed figcaption strong::after {
    content: " changed";
    color: var(--gold);
    font-weight: 700;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
</style>
<div class="wrap">
  <p class="eyebrow">Stage 2 &middot; visual review</p>
  <h1>Chore Quest &mdash; every screen</h1>
  <p class="lede">
    ${captured} screens at iPhone&nbsp;13 size on mock data, captured from the dev server.
    Each shows the first viewport only, so anything below the fold is not here.
    Tell me which ones are wrong and what they should look like.
  </p>

  <ul class="fixed-list">
    <li><span class="tag">Install</span><span><b>The app was not installable.</b> No manifest, no icons, no apple-touch-icon &mdash; so Add to Home Screen gave a blank icon and the page URL as its name. All three now exist; the service worker stays in Stage&nbsp;14 as decided.</span></li>
    <li><span class="tag">Splash</span><span><b>The ground floated.</b> It was capped at 360px inside a padded container, leaving sky down both edges instead of a horizon. It now reaches both edges, and a stray translucent shape that smudged the hills is gone.</span></li>
    <li><span class="tag">Layout</span><span><b>108px of dead space</b> was reserved for a bottom navigation bar on the three screens that do not have one, pushing the primary buttons off the thumb line.</span></li>
  </ul>

  ${sections}
</div>`;

await writeFile(outFile, html);
console.log(`${captured} screens -> ${outFile}`);
