# Chore Quest — Project State

_Last updated: 2026-08-19_

| Field | Value |
| --- | --- |
| Current stage | Stage 17 — Running for real |
| Stage status | Serving the household from the compiled build; awaiting owner approval |
| Last approved stage | Stage 2 — Design system and static GUI, approved 2026-08-19 |
| Frontend URL (dev) | http://localhost:5173 |
| Backend URL (dev) | http://localhost:4000 (health: `/api/health`) |
| Repository | `countryboysplay/ChoresApp`, public, default branch `main` |
| Preview URL | https://countryboysplay.github.io/ChoresApp/ — frontend only, mock data, no backend, no login |
| Production URL | https://chores.lindsayfam.org — home wifi only. Resolves to 192.168.0.178, this laptop's reserved address. Certificate from Let's Encrypt, renews itself |
| Database migration status | 12 migrations applied; 19 tables, 10 enums. Rolls back to empty and forward again cleanly |
| Test status | 263 in CI (232 backend, 31 frontend). On the laptop 179 skip by design - tests may not touch the household database |
| Last known good commit | `8dcbfef` — Stage 16 live; CI and Pages green |

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
- https on the home wifi: the backend serves the built frontend from one origin,
  reads a certificate at startup, and renews it on the scheduler tick via a
  DNS-01 challenge. Nothing is exposed to the internet - the hostname resolves
  to this laptop's private address. Falls back to plain http rather than
  refusing to start.
- Backups: the database and every chore photo taken together, nightly at 3am on
  the same tick as the reminder sweep, kept 14 days then 8 weeks, and mirrored
  to a USB drive whenever one is plugged in. Restoring is a terminal command
  that refuses to run while the server is up.
- Offline shell: the build precaches what it emitted and nothing else, so the
  app opens with the laptop asleep and shows an honest "can't reach home" screen
  rather than a stale copy of the day. A new version waits and takes over on the
  next launch. An install card appears where the browser offers one.
- Push notifications: a service worker that now also carries the cached shell, per-browser subscriptions that
  move with whoever signs in and die with the sign-in, and a drain that runs on
  the same tick as the reminder sweep. One notification kind reaches a phone;
  everything else stays in the inbox, which now has a screen on both sides of
  the app. A child has no off switch and is asked for permission unprompted; a
  parent can mute a child, and sees any child whose phone has stopped being
  reached.

## Stage 13 - verified on real infrastructure

Push was proven end to end on the laptop on 2026-08-19, not only in tests. A
reminder was written to a child's inbox; the running server's own scheduler
drained it on its next tick; `web-push` sent it and Google's FCM accepted it,
which is what writes `last_sent_at`; the service worker showed it; and the
notification appeared on screen with the app closed.

Worth recording because it exercised the parts a test suite cannot: real VAPID
keys, a real FCM endpoint, a registered service worker, and Chrome's own
permission flow. The child was prompted automatically at sign-in and never had
to find a button, which is the behavior the no-off-switch rule depends on.

Two things this did not cover. The `notificationclick` deep link was not
confirmed, so opening the right chore from a tap is still unproven. And every
phone so far has been the laptop itself - a real phone needs https, which is
Stage 16.

## Known issues

- **Three child screens are wired; the rest still run on mock data.** Home,
  missions, and chore detail read the API. Rewards, wallet, leaderboard,
  achievements, notifications, profile, and every parent screen are unchanged.
- **Every parent screen now reads real data.** Nothing on the parent side is
  mock any more.
- **Two child screens are still mock:** leaderboard and achievements, plus the
  avatar builder on the profile screen. Everything else on both sides is real.
- **A child cannot turn reminders off in the app, and the app cannot stop them
  turning them off in the browser.** Owner decision: reminders are not optional
  for a child, so the child app has no off switch and asks for permission by
  itself. Notification permission belongs to whoever holds the phone, though -
  Chrome can always revoke it - so the rule is kept by visibility instead: a
  child whose phone has gone quiet is named on the parent dashboard. The one
  deliberate off switch is `users.reminders_muted`, on a parent screen.
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
- **Offline shows an honest screen, not the day.** The shell is cached so the app
  opens instantly and wears its own face rather than the browser's error page,
  but no API response is ever stored and nothing is queued for later. A cached
  chore list cannot be told apart from a live one by the child reading it.
- **A new version takes over on the next launch, not immediately.** No
  `skipWaiting`, no update prompt. The cost is running yesterday's build for one
  more session; anything needing to be live at once is a deliberate exception.
- **`preview` is now a build-time flag.** It used to be entered whenever a
  request failed, which combined with caching would have let anyone into the app
  with no PIN by making the API unreachable. Only the Pages workflow sets it;
  everything else gets `offline`, which lets nobody through. Three tests pin
  this shut.

## Pending owner decisions

1. **Points-to-dollars rate and minimum cash-out balance.** Deliberately left
   unset — the spec forbids inventing them. Wallet and cash-out currently render
   their "not configured" state, which is the correct behavior until Settings is
   filled in.
2. Remote access approach for Stage 16 (Cloudflare Tunnel vs. Tailscale) — no
   router ports will be opened either way.
3. ~~Backup retention window.~~ Settled in Stage 15.

## Stage 14 - verified in a real browser

Checked against a genuinely dead server, not a mocked one: the built app was
served from a throwaway static server, the worker registered and precached 61
entries, then the server was stopped and every socket destroyed.

With nothing to connect to, the app still opened from cache, and `#/profiles`,
`#/child/home`, and `#/parent` all showed the offline screen. None of them
leaked a mock profile or let anybody past the guard, which is the property that
made this stage a security change as much as a caching one.

Not covered: an actual phone, which needs the https the Stage 16 tunnel will
provide, and the install prompt, which only fires where Chrome decides a site is
installable.

## Stage 15 - verified against the live household

A real backup was taken of the household as it stands and the archive was read
back: 20 tables and both members present in the decoded SQL, including their
PIN hashes, which is what a restore would rebuild from.

A full restore into a scratch database was not possible - the app's database
role has no CREATEDB, which is the correct posture and not worth loosening for a
test. The archive was decoded to SQL with `pg_restore` instead, which proves it
is complete and readable; a restore into a live database is exercised by the
test suite rather than against the household.

The restore CLI was run and refused, correctly, because the server was
answering on its port.

## Stage 16 - live and verified

`https://chores.lindsayfam.org` serves the household from this laptop, over the
home wifi and nowhere else. Verified the way a phone experiences it - real DNS,
real certificate, no local overrides:

- the certificate validates against the public trust store, so nothing is
  installed on any device
- the app and the API answer on one origin, so the session cookie is first-party
- a deep link like `/child/home` lands on the app rather than a 404
- port 80 redirects to https, because nobody types a scheme
- the DNS-01 challenge worked and removed its own TXT record afterwards

Issued 2026-08-19, expires 2026-11-18. Renewal is automatic on the scheduler
tick inside 30 days of expiry; System status shows the days remaining, because
an expired certificate fails quietly and takes the camera with it.

### The two things that had to change outside the app

**The laptop's address is reserved.** `192.168.0.178`, bound in the router. The
A record points at it, so a changed address would take the whole household off
the air.

**The router no longer answers DNS.** It was refusing to return a private
address from public DNS - rebinding protection - so nothing on the wifi could
resolve the hostname. The router's DHCP now hands out `1.1.1.1` and `8.8.8.8`
instead. The trade is that router-level filtering and `.local` names no longer
apply, neither of which this household was using.

## Stage 17 - running for real

`npm run serve` builds everything and starts the compiled server in production
mode. It is the household's command; `npm run dev` remains the development pair
on separate ports.

The launcher checks what it can before starting and separates what stops it from
what merely reduces it. A missing SESSION_SECRET or a frontend built for the
Pages base path is a refusal with a sentence saying which; no certificate, no
push keys, and no backup drive are printed as "starting, with these things
switched off". Verified both ways, including deliberately breaking the frontend
build to watch it refuse.

Every row on System status now reads something real. Four of them were Stage 2
placeholders - a fixed "Online", a fixed "30 seconds ago", a database that always
claimed to be unconfigured, and a version still saying "Stage 2 preview".

### The thing this stage found

Running the test suite on this laptop was operating on the household's own
database. Every suite fell back to `DATABASE_URL` when `TEST_DATABASE_URL` was
unset - correct in Stage 3, wrong from the moment this machine started serving
the family. `npm test` created users, ran approve-all across the real approval
queue, and cleared the backup log, against a household with Kayden's chore photo
in it.

Nothing was lost. Approve-all did not pay out his submission only because a
parent has to see a photo first, and the backup rows were re-registered from the
folders on disk. But the fallback is gone, a guard refuses a test database whose
name is not obviously a test database, and a regression test greps the suites so
it cannot come back.

## Next planned work## Next planned work

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

**Stage 18 — Starting by itself.** The household currently depends on somebody
having run `npm run serve` in a window and not closed it. A power cut, a Windows
update, or a stray Ctrl+C takes the app down until a person notices. Windows has
to start it at boot and restart it if it dies. Scheduled Task versus NSSM
service is still an open owner decision.

Also outstanding:

- **Leaderboard, achievements, and the avatar builder**, the last three screens
  on mock data. All three are readings of data that already exists.
- **System status is still mostly mock.** The push row is real; backend uptime,
  database, backups, and app version are placeholders belonging to Stages 15 and
  17.

Still deliberately unfinished, so it lands where it belongs:

- **Plug the backup drive in.** `BACKUP_MIRROR_DIR` is unset, so backups exist
  only on this laptop. That covers a mistake or a damaged database and nothing
  else - not a dead disk, not a stolen laptop. Set it to a folder on a USB drive
  in `backend/.env` and every nightly backup copies itself there whenever the
  drive is present.
- **Points-to-dollars rate and cash-out minimum stay NULL.** The columns exist
  with no defaults and a test asserts they are unset, so the wallet keeps
  rendering its "not configured" state until an owner sets them in Settings.
- **VAPID keys stay unset in the repository**, for the same reason and one more:
  the private key is the only thing between anyone and the ability to send
  notifications that arrive on the kids' phones looking like they came from this
  household. It is generated on the laptop and never leaves it.
