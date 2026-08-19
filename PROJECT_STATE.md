# Chore Quest — Project State

_Last updated: 2026-08-19_

| Field | Value |
| --- | --- |
| Current stage | Stage 13 — Push notifications |
| Stage status | Built and tested; awaiting approval |
| Last approved stage | Stage 2 — Design system and static GUI, approved 2026-08-19 |
| Frontend URL (dev) | http://localhost:5173 |
| Backend URL (dev) | http://localhost:4000 (health: `/api/health`) |
| Repository | `countryboysplay/ChoresApp`, public, default branch `main` |
| Preview URL | https://countryboysplay.github.io/ChoresApp/ — frontend only, mock data, no backend, no login |
| Production URL | None yet — Stage 17. It will serve the frontend and the API from one origin |
| Database migration status | 10 migrations applied; 18 tables, 8 enums. Rolls back to empty and forward again cleanly |
| Test status | 225 passing (202 backend, 23 frontend); typecheck, lint, build clean, 0 npm vulnerabilities |
| Last known good commit | `c814853` — Stage 12 reminders and the inbox; CI and Pages green |

## Stage 0 findings

Prerequisites are now installed and verified **on the Windows laptop**
(`DESKTOP-32BP00K`), 2026-08-19. `npm run preflight` passes with no blockers.

| Check | Result |
| --- | --- |
| Node.js | v24.19.0 LTS — meets the 20.11+ floor. Node 22 is no longer offered by winget; 24 is the current LTS |
| npm | 11.17.0 — workspaces supported |
| Git | 2.55.0.windows.4 |
| PostgreSQL | 17.11, service `postgresql-x64-17`, Running / Automatic start |
| PowerShell | 5.1.26100.9168 |
| Ports 4000 / 5173 | Free |
| Workspace writable | Yes |

`C:\Program Files\PostgreSQL\17\bin` was added to the **user** PATH (the EDB
installer does not add it), which is what puts `psql` and `pg_dump` in reach of
preflight and the ops scripts.

## Built from the approved design board

The UI package supplied on 2026-08-18 is now the visual authority. Applied:
splash screen, "Choose your hero" profile select and PIN entry on the bright sky
background; navy in-app shell; gold points pills; circular level badge with XP
bar; sky-blue "Today's progress" panel with a code-drawn treasure chest; purple
"Next bonus chore" panel; pale streak panel; segmented Today/This week,
Pending/Reviewed, Daily/Weekly and All/Available/Goals controls; colored icon
tiles; stat rows on the parent dashboard; and a desktop sidebar for the parent
app. Fredoka and Nunito are now self-hosted from npm, so the type matches the
board offline.

Per the package README, mockup text was not treated as business logic: the
specification still governs point values, the $40 weekly cap, photo-required
completion, and every workflow state.

## Resolved

- **Leaderboard is kids only.** Parent accounts never appear on it. Covered by a
  test so it cannot regress.
- **One palette for both sides.** The parent app keeps the same navy theme, cards,
  and accents as the child app; the light desktop treatment in the reference
  renders is not being built. Desktop parents get a sidebar at 1000px and wider,
  in the same colors.

- **PostgreSQL install method: native EDB installer, not Docker.** Chosen
  2026-08-19. It runs as a Windows service with Automatic start, so the database
  comes back on its own after a reboot with nothing else needing to be logged in
  — the right shape for an always-on laptop. Docker Desktop is present but its
  daemon is not running and is not part of the stack.

- **Repository name: `ChoresApp`.** Production base path is now `/ChoresApp/`, so
  the Pages URL will be `https://<account>.github.io/ChoresApp/`. Capitalization is
  load-bearing — Pages paths are case-sensitive.

## Stage 2 — approved

**Approved 2026-08-19, as built.** The screens are the visual baseline now, so
later stages replace mock data with real data behind the same layouts rather
than redesigning them. Anything that changes how a screen looks from here is a
deliberate decision, not incidental drift, and belongs in DECISIONS.md.

Regenerate the review page any time with `npm run review-sheet`.

The 23 screens, all on mock data, no database and no API calls. Routes:

**Child** — `#/` splash · `#/profiles` choose your hero · `#/pin/child-1` PIN ·
`#/child/home` ·
`#/child/missions` · `#/child/chore/core-kitchen` (checklist → camera lock →
capture → preview → submitted) · `#/child/chore/core-bathroom` (rejected/fix
state) · `#/child/rewards` · `#/child/wallet` · `#/child/leaderboard` ·
`#/child/achievements` · `#/child/notifications` · `#/child/profile` (avatar
builder).

**Parent** — `#/parent` dashboard · `#/parent/approvals` queue ·
`#/parent/approvals/sub1` review · `#/parent/schedule` · `#/parent/chores/new`
wizard · `#/parent/bonus` · `#/parent/rewards` · `#/parent/children` ·
`#/parent/settings` · `#/parent/system`.

`#/health` is the Stage 1 backend diagnostic page, kept for troubleshooting.

Preview on a phone: see `docs/preview-on-phone.md`. Fastest route is pushing to
the `ChoresApp` repo — the `Deploy frontend preview` workflow publishes the
frontend to `https://<account>.github.io/ChoresApp/`, which needs no backend
because Stage 2 runs on mock data. On the house wifi, `npm run dev -w frontend`
and `http://<laptop-ip>:5173` also works.

## What exists now

- npm workspace root with dev, build, test, typecheck, lint, and preflight scripts.
- Backend: Fastify 5 + TypeScript, Zod-validated environment loader, structured
  logging with redaction, a single client-safe error handler, rate limiting, CORS
  restricted to localhost, and `GET /api/health` with a real database probe.
- Household time helpers with DST-boundary tests — the rule that every later
  scheduling feature depends on.
- Frontend: React 18 + Vite 6, HashRouter, design tokens for the approved palette
  and type scale, and a placeholder Home route that reports backend connectivity.
- Shared type-only API contract package.
- PostgreSQL schema in 5 SQL migrations: household and settings, chores, points
  and rewards, achievements and notifications, sessions.
- Authentication: PIN sign-in, opaque database-backed sessions in an httpOnly
  cookie, per-user lockout with a doubling backoff, and `npm run user -w backend`
  for creating members from the laptop.
- The child loop end to end: the day materialises on read, the checklist
  persists, a live photo is captured and downscaled in the browser, and the chore
  is submitted for review. Photos are stored outside the web root and served only
  to their owner or a parent.
- CI workflow running typecheck, lint, tests, and build on every push against a
  real `postgres:17` service — it applies the migrations, rolls the whole schema
  back to empty and forward again, then tests. Plus a frontend-only GitHub Pages
  preview deploy so screens can be reviewed on a phone.
- Design system: palette and type tokens, buttons, cards, badges, chips, linear
  and circular meters, checklist items, sheets/modals, bottom navigation, tabs,
  form controls, empty states, and reduced-motion handling.
- Code-drawn icon set, layered SVG avatar with a working builder, and a Web Audio
  sound helper that generates every effect (no audio files, never blocks a flow).
- Level curve centralized in `frontend/src/config/levels.ts` — the only place a
  level threshold is computed.
- Push notifications: a push-only service worker, per-browser subscriptions that
  move with whoever signs in and die with the sign-in, and a drain that runs on
  the same tick as the reminder sweep. One notification kind reaches a phone;
  everything else stays in the inbox, which now has a screen on both sides of
  the app.

## Known issues

- **Three child screens are wired; the rest still run on mock data.** Home,
  missions, and chore detail read the API. Rewards, wallet, leaderboard,
  achievements, notifications, profile, and every parent screen are unchanged.
- **Every parent screen now reads real data.** Nothing on the parent side is
  mock any more.
- **Two child screens are still mock:** leaderboard and achievements, plus the
  avatar builder on the profile screen. Everything else on both sides is real.
- **One notification buzzes a phone; the rest wait in the inbox.** Owner
  decision: only the child's evening `chore_reminder` is pushed, because it is
  the only one whose whole purpose is to reach somebody who is not looking.
  Escalations, approvals, rejections, reward answers, and posted bonus chores
  arrive in the inbox and are read when the app is next opened. Adding a kind is
  one line in `PUSHABLE_KINDS`.
- **Push is off until the laptop has VAPID keys.** `npm run vapid` prints the
  three lines for `backend/.env`; the server refuses to start with some but not
  all of them. Until they are set, the panel on the inbox screen and the System
  status row both say so, and everything else works unchanged. Notifications
  written while push is off are held rather than discarded, so adding the keys in
  the evening still delivers that evening's reminders.
- **Push needs https, or the laptop itself** — the same rule as the camera, and
  the same consequence: it cannot be tested on a phone over the wifi address
  until the Stage 16 tunnel provides https.
- **A streak can overstate.** Unresolved days pause rather than break, so a
  household that never opens the parent app keeps every streak alive. That is
  the deliberate trade for never punishing a child over an adult's inattention.
- **Cash-out is inert by design.** The points-to-dollars rate and minimum balance
  are still unset, so the wallet renders its "turned off" panel. Setting both in
  Settings turns it on with no code change; nothing else in the wallet is
  waiting on them.
- **A household can now be set up entirely in the app.** No SQL is needed for
  anything. The single exception is deliberate: creating the first parent, and
  any later parent, is a terminal command
  (`npm run user -w backend -- --role parent --name "..."`), so nothing in the
  app can lock a parent out.
- **The camera needs https or the laptop itself.** Browsers only expose
  `getUserMedia` in a secure context, so opening the dev server by its wifi
  address shows an explanation rather than a camera. Capture can be tested on the
  laptop today; phones get it when the Stage 16 tunnel provides https.
- **Nothing marks a chore missed or excused.** A chore nobody finished simply
  stays not-started; the dashboard's "excuse, carry over, or mark missed" actions
  are not built. The streak calculation already treats excused as a pause, ready
  for when they are.
- **The household is empty.** `household_settings` has its single row with the
  money values correctly unset, and `users` has nobody in it. Create the first
  parent on the laptop:
  `npm run user -w backend -- --role parent --name "Your name"`.
  The hero-select screen says the same thing when it finds no profiles.
- The repository is **public**. It carries no secrets — CI fails the build if a
  `.env`, `.pem`, or `.key` is ever tracked — and the mock data uses `Child 1` /
  `Parent 1` placeholders rather than real names. Worth re-checking before any
  real household data goes anywhere near the frontend.
- **Lifetime points are readable before sign-in**, because the approved
  hero-select screen shows a level and a total on every child's card. It is the
  only household figure served unauthenticated; see the 2026-08-19 entry in
  DECISIONS.md for the reasoning and what to revisit if it stops being
  acceptable.
- Camera, photo, and pinch-zoom areas are placeholders with the correct states and
  copy; real `getUserMedia` capture is Stage 6.
- ~~Playwright screenshots could not be produced in the build environment.~~
  Resolved: `npm run screenshots` captures all 25 routes at phone and desktop
  sizes into `screenshots/`, and fails if any screen logs a console error or
  overflows horizontally. Needs the dev server running.
- **The service worker does push and nothing else**, so Chrome still will not
  offer a true "Install" prompt — that wants a worker with a fetch handler. The
  manifest and icons are in place, which is what Add to Home Screen needs.
  Offline caching, the install prompt, and the prompt-to-update flow are still
  Stage 14, which may replace `frontend/public/sw.js` wholesale.

## Pending owner decisions

1. **Points-to-dollars rate and minimum cash-out balance.** Deliberately left
   unset — the spec forbids inventing them. Wallet and cash-out currently render
   their "not configured" state, which is the correct behavior until Settings is
   filled in.
2. Remote access approach for Stage 16 (Cloudflare Tunnel vs. Tailscale) — no
   router ports will be opened either way.
3. Backup retention window.

## Next planned work

**Chore Quest is usable by a real household from here.** Everything from
creating the family to a child earning and spending points works through the app,
with one deliberate terminal step for creating a parent.

To start using it, on the laptop:

1. `npm run user -w backend -- --role parent --name "Your name"` — the only
   command needed, and only for parents.
2. Sign in as that parent, add the children on the Household screen and give them
   PINs.
3. Create the chores on `#/parent/chores/new` and assign them.
4. Optionally set the points-to-dollars rate and cash-out minimum in Settings.
   Leaving them unset keeps cash-out off, which is a valid way to run.
5. Optionally `npm run vapid`, paste the three lines into `backend/.env`, and
   restart. That turns on the evening reminder buzzing a child's phone. Leaving
   the keys unset keeps push off, which is also a valid way to run.

**Stage 14 — The rest of the PWA.** Stage 13 brought forward a push-only service
worker; everything else that file was going to do is still ahead.

What it has to settle:

- **Caching strategy**, and the update flow that goes with it. The current
  worker calls `skipWaiting` and `clients.claim`, which is safe only because
  nothing is cached. The moment something is, that line needs revisiting.
- **Whether `vite-plugin-pwa` replaces the hand-written worker** or wraps it.
  The push and click handlers have to survive either way.
- **The install prompt**, which wants a fetch handler before Chrome will offer
  it.

Also outstanding:

- **Leaderboard, achievements, and the avatar builder**, the last three screens
  on mock data. All three are readings of data that already exists.
- **System status is still mostly mock.** The push row is real; backend uptime,
  database, backups, and app version are placeholders belonging to Stages 15 and
  17.

Still deliberately unfinished, so it lands where it belongs:

- **Points-to-dollars rate and cash-out minimum stay NULL.** The columns exist
  with no defaults and a test asserts they are unset, so the wallet keeps
  rendering its "not configured" state until an owner sets them in Settings.
- **VAPID keys stay unset in the repository**, for the same reason and one more:
  the private key is the only thing between anyone and the ability to send
  notifications that arrive on the kids' phones looking like they came from this
  household. It is generated on the laptop and never leaves it.
