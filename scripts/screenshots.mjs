#!/usr/bin/env node
/**
 * Captures every screen to an image so Stage 2 visual review does not depend on
 * someone holding a phone. Screens are static mock data, so this is
 * deterministic: the same commit produces the same images.
 *
 * Usage:
 *   npm run dev -w frontend       # in another terminal
 *   node scripts/screenshots.mjs  # writes ./screenshots/
 *
 * Override the target with BASE_URL when reviewing the Pages preview instead:
 *   BASE_URL=https://countryboysplay.github.io/ChoresApp node scripts/screenshots.mjs
 */
import { chromium, devices } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'screenshots');
const baseUrl = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');

// Route, filename, and the reason it is in the list. Chore detail appears twice
// because the rejected state is a different screen in every way that matters.
const ROUTES = [
  ['#/', 'splash'],
  ['#/profiles', 'profile-select'],
  ['#/pin/child-1', 'pin-entry'],
  ['#/child/home', 'child-home'],
  ['#/child/missions', 'child-missions'],
  ['#/child/chore/core-kitchen', 'child-chore-checklist'],
  ['#/child/chore/core-bathroom', 'child-chore-rejected'],
  ['#/child/rewards', 'child-rewards'],
  ['#/child/wallet', 'child-wallet'],
  ['#/child/leaderboard', 'child-leaderboard'],
  ['#/child/achievements', 'child-achievements'],
  ['#/child/notifications', 'child-notifications'],
  ['#/child/profile', 'child-profile'],
  ['#/parent', 'parent-dashboard'],
  ['#/parent/approvals', 'parent-approvals'],
  ['#/parent/approvals/sub1', 'parent-approval-review'],
  ['#/parent/schedule', 'parent-schedule'],
  ['#/parent/chores/new', 'parent-chore-wizard'],
  ['#/parent/bonus', 'parent-bonus'],
  ['#/parent/rewards', 'parent-rewards'],
  ['#/parent/children', 'parent-children'],
  ['#/parent/settings', 'parent-settings'],
  ['#/parent/system', 'parent-system'],
  ['#/health', 'health'],
];

// Phone is the primary target. Desktop only matters where the parent sidebar
// appears, which the shell switches on at 1000px.
const VIEWPORTS = [
  { name: 'phone', ...devices['iPhone 13'] },
  { name: 'desktop', viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
];

const problems = [];

const browser = await chromium.launch();
await rm(outDir, { recursive: true, force: true });

for (const vp of VIEWPORTS) {
  const { name, ...contextOptions } = vp;
  await mkdir(join(outDir, name), { recursive: true });
  const context = await browser.newContext(contextOptions);

  // Console errors are a stronger signal of an unfinished screen than anything
  // visible in the image, so they are collected rather than ignored.
  context.on('weberror', (e) => problems.push(`[${name}] pageerror: ${e.error().message}`));

  for (const [route, slug] of ROUTES) {
    const page = await context.newPage();
    const messages = [];
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      // A signed-out visitor gets 401 from /api/auth/me, and a preview build
      // with no backend gets a refused connection. Both are the app working as
      // designed. Reporting them trains whoever reads this output to skim past
      // the line that actually matters.
      if (/(^|\D)401(\D|$)|ERR_CONNECTION_REFUSED|Failed to load resource/.test(text)) return;
      messages.push(text);
    });

    try {
      await page.goto(`${baseUrl}/${route}`, { waitUntil: 'networkidle', timeout: 30_000 });
      // Self-hosted fonts decide the layout; screenshotting before they settle
      // produces a different image on every run.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350);

      // Viewport-sized, not fullPage. The bottom nav and app bar are fixed, and
      // fullPage renders fixed elements stranded mid-image, which reads as a
      // layout bug that does not exist on a real phone.
      await page.screenshot({ path: join(outDir, name, `${slug}.png`) });

      // A second frame scrolled to the end, only when there is more to see.
      const scrollable = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight > 24,
      );
      if (scrollable) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(outDir, name, `${slug}--scrolled.png`) });
      }

      // Horizontal overflow is the defect this harness is best placed to catch:
      // it is invisible in a fullPage image but breaks the layout on a phone.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1) {
        problems.push(`[${name}] ${route} overflows horizontally by ${overflow}px`);
      }
    } catch (error) {
      problems.push(`[${name}] ${route} failed to render: ${error.message}`);
    }

    for (const m of messages) problems.push(`[${name}] ${route} console error: ${m}`);
    await page.close();
  }

  await context.close();
  console.log(`${name}: ${ROUTES.length} screens captured`);
}

await browser.close();

console.log(`\nWrote ${ROUTES.length * VIEWPORTS.length} images to ${outDir}`);

if (problems.length) {
  console.log(`\n${problems.length} problem(s) found while capturing:\n`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}

console.log('No console errors on any screen.');
