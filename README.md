# Chore Quest

A household chore-management PWA. Parents set the chores, kids complete them with
photo proof, and points turn into rewards and allowance.

- **Frontend** — React + TypeScript + Vite, installable PWA, hosted on GitHub Pages
  from the `ChoresApp` repository (`/ChoresApp/` base path).
- **Backend** — Fastify + TypeScript + PostgreSQL, running on the always-on Windows 11 laptop.
- **GitHub is not the database.** Pages serves static assets only; all household data stays on the laptop.

Household timezone: `America/Chicago`. Every scheduling rule is computed in that
IANA zone, never a fixed UTC offset.

## Layout

```text
chore-quest/
  frontend/   React PWA (deployed to GitHub Pages)
  backend/    Fastify API + PostgreSQL (Windows laptop only)
  shared/     Type-only API contract shared by both
  docs/       Operator and setup notes
  scripts/    Preflight and Windows dev/ops scripts
```

## Requirements

- Node.js 20.11+ (24 LTS is what the laptop runs)
- npm 10+
- PostgreSQL 16+ (needed from Stage 3 onward). On Windows, add
  `C:\Program Files\PostgreSQL\<version>\bin` to PATH yourself — the EnterpriseDB
  installer does not, and `psql` is invisible until you do.
- Git
- Windows PowerShell 5.1+ or PowerShell 7 for the ops scripts

## First run

```powershell
npm install
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env.local
npm run preflight
npm run dev
```

- Frontend: http://localhost:5173
- Backend health: http://localhost:4000/api/health

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs backend and frontend together |
| `npm run dev:backend` | Fastify with hot reload on port 4000 |
| `npm run dev:frontend` | Vite dev server on port 5173 |
| `npm test` | Backend and frontend unit tests |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm run lint` | ESLint across the repo |
| `npm run build` | Production build of both apps |
| `npm run preflight` | Checks Node, npm, Postgres, ports, and env files |
| `npm run db:migrate` | Applies pending database migrations |
| `npm run db:migrate:down` | Rolls back the most recent migration |
| `npm run db:new -- <name>` | Creates a new empty `.sql` migration |
| `npm run user -w backend -- --list` | Lists household members |
| `npm run user -w backend -- --role parent --name "N"` | Creates a member and sets their PIN |
| `npm run serve` | Builds everything and runs it for the household, in production mode |
| `npm run startup` | Registers the Windows task that starts it at boot (needs admin) |
| `npm run admin` | Opens the laptop dashboard: start/stop, backups, add a parent |
| `npm run vapid` | Prints a fresh VAPID key pair for push notifications |
| `npm run cert -- --issue` | Obtains or renews the https certificate |
| `npm run restore -- --list` | Lists backups; `--from <folder>` restores one |
| `npm run screenshots` | Captures every screen to `screenshots/` (needs the dev server) |
| `npm run icons` | Regenerates the home-screen icons from code |

A Windows-native equivalent is available at `scripts\preflight.ps1` if you prefer
PowerShell output.

## Setting up a household

Everything except creating a parent happens in the app. On the laptop, once:

```powershell
npm run db:migrate
npm run user -w backend -- --role parent --name "Your name"
```

Then sign in as that parent and use the app: add the children and give them PINs
on the Household screen, create chores on `#/parent/chores/new`, and add rewards
on `#/parent/rewards`.

Creating a parent stays a terminal command on purpose. Nothing inside the app can
change another parent's PIN or deactivate them, so no argument, mis-tap, or child
holding an unlocked phone can lock a parent out of their own household.

The points-to-dollars rate and the minimum cash-out balance start unset, and the
app will not invent them. Until both are set in Settings, the kids' wallets show
cash out as turned off, which is a perfectly valid way to run.

## Phone notifications

Optional, and off until the laptop has keys of its own:

```powershell
npm run vapid
```

Paste the three lines it prints into `backend/.env` and restart. From then on the
evening reminder reaches a child's phone without the app being open - it is the
only notification that does. Everything else lands in the inbox and is read when
the app is next opened.

Reminders are not optional for a child: their app has no off switch and asks for
permission by itself when they sign in. What no app can do is stop a phone's
owner revoking that permission in the browser's own settings - so instead, a
child whose phone has gone quiet is named on the parent dashboard, and the only
deliberate off switch is on the parent's Inbox screen.

Browsers only allow notifications over https or on the laptop itself, so a phone
on the house wifi gets this once the Stage 16 tunnel is in place. Signing out, or
a parent resetting a child's PIN, stops that phone buzzing immediately.

## Offline and installing

The app caches its own shell, so it opens with the laptop asleep and shows a
plain "can't reach home" screen instead of the browser's error page. It never
caches chores, points, or photos: a cached list cannot be told apart from a live
one by the person reading it, and an app that quietly lies about what has been
done is worse than one that admits it is offline. Nothing is lost either way -
everything lives on the laptop.

A new version installs in the background and takes over the next time the app is
opened fresh, so nobody is reloaded out from under a half-finished chore.

Where the browser offers it, an "Add to your home screen" card appears on a
child's Profile screen and on parent Settings. On an iPhone there is no such API
and it is a Safari menu item instead.

## Backups

Every night at 3am the app backs itself up: the database and every chore photo,
into `backend/storage/backups`. It keeps 14 nightly backups and then 8 weekly
ones, so roughly four months of history. There is a "Back up now" button on
System status too.

**Backups on the same disk are not protection against losing the laptop.** To
keep a copy that survives the machine, set `BACKUP_MIRROR_DIR` in `backend/.env`
to a folder on a USB drive:

```
BACKUP_MIRROR_DIR=E:\ChoreQuestBackups
```

Every backup then copies itself there whenever the drive is plugged in. When it
is not, the backup still succeeds locally and System status says the drive is
missing rather than staying quiet about it.

### Restoring

Restoring replaces every chore, point, reward, photo, and PIN with an older copy
and cannot be undone, so it is a terminal command rather than a button. Stop the
server first - it refuses to run otherwise, because a database cannot be rebuilt
underneath the server using it.

```powershell
npm run restore -- --list
npm run restore -- --from <folder>
```

It shows what the backup contains and asks you to type RESTORE before touching
anything.

## Running it for the household (https on the wifi)

Chores, points, and rewards work fine over plain http. The camera and phone
notifications do not - browsers only allow either in a secure context, which is
why photo capture has only ever worked on the laptop itself.

Nothing is exposed to the internet. The fix is a real certificate for a real
hostname whose DNS points at this laptop's **private** address, so the name works
on your wifi and nowhere else.

You need a domain (about $10/yr) with its DNS at Cloudflare. Then:

1. Give this laptop a fixed address in your router.
2. Add an A record for your hostname pointing at that address.
   `npm run cert` prints the address to use.
3. Create a Cloudflare API token with `Zone:DNS:Edit` on that zone only.
4. Fill in `PUBLIC_HOSTNAME`, `TLS_DIR`, `FRONTEND_DIST`, `ACME_EMAIL`,
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` in `backend/.env`.
5. Get the certificate, using staging first so mistakes are free:

```powershell
$env:ACME_STAGING='true'; npm run cert -- --issue   # rehearsal
npm run cert -- --issue                             # the real one
```

6. Build and serve it:

```powershell
npm run serve
```

Renewal then happens by itself - the server checks every tick and renews inside
30 days of expiry. System status shows the days remaining, because an expired
certificate fails quietly and takes the camera with it.

### If phones cannot resolve the name

The usual cause is the router refusing to return a private address from public
DNS - rebinding protection. Most consumer routers do not expose a switch for it,
and the reliable fix is to stop devices asking the router at all: set the DHCP
server's Primary and Secondary DNS to `1.1.1.1` and `8.8.8.8`, then reconnect
each device so it picks up the change.

The trade is that router-level filtering and `.local` device names stop working,
since nothing is asking the router any more.

Also reserve the laptop's address in the router. The A record points at a fixed
address, so a DHCP lease that moves takes the whole household off the air.

Without any of this the app still runs on plain http exactly as before.

## The laptop dashboard

Most servicing has a button now:

```powershell
npm run admin
```

It opens at the same address every time, which is worth a bookmark:

```
http://127.0.0.1:4100/
```

Start, stop and restart the server; take a backup and copy it to a plugged-in USB
drive; add a parent; reset anyone's PIN; renew the certificate; rebuild after
pulling changes; and read the recent log. If the dashboard is not running, the
bookmark simply will not connect - start it with `npm run admin` and reload.

It runs as its own process on `127.0.0.1` only, deliberately independent of the
app - a tool for servicing the server is needed exactly when the server is
unwell. There is no login, and no token to copy out of the terminal. That is not
a gap: anybody sitting at this laptop could run all of this from a terminal
anyway. What has to be kept out is the browser they have open, so that no website
they visit can quietly POST to localhost and add itself a parent account. Two
things do that. The page is served only to a navigation the browser itself
labels as unattributed or same-origin - a bookmark or a reload qualifies, a link
or a `fetch()` from another site does not - and every action the page then takes
carries a token minted at launch that never appears in the address bar. A tab
left open across a restart is holding the previous launch's token; it says so and
asks to be reloaded.

**Restoring is not on it.** That replaces every chore, point and photo with no
undo, so it stays a terminal command.

## Starting automatically

The household should not depend on somebody keeping a window open. Register the
Windows task once, from an **elevated** PowerShell:

```powershell
cd C:\Users\Jonathan\Desktop\ChoresApp-main
.\scripts\install-startup.ps1
```

It starts 30 seconds after boot, before anyone logs in, running as your account
rather than SYSTEM — it needs to read `backend/.env` and write to
`backend/storage`. Elevation is needed once to register it, not to run it.

```powershell
Start-ScheduledTask -TaskName 'Chore Quest'    # start now, no reboot
Get-ScheduledTask  -TaskName 'Chore Quest' | Get-ScheduledTaskInfo
Stop-ScheduledTask -TaskName 'Chore Quest'
.\scripts\install-startup.ps1 -Remove          # undo it
```

Anything already listening on port 443 stops the task starting, so close a
`npm run serve` window first.

**Logs** are in `backend\storage\logs\`, one file per day, kept a fortnight. If
the server dies the launcher restarts it with backoff, and gives up after eight
in a row rather than hiding a real problem behind an endless retry — the reason
is written to that day's log.

## Running tests

`npm test` needs a database of its own. It will **not** fall back to the
household's, and skips the database-backed suites when there is none:

```powershell
$env:TEST_DATABASE_URL='postgres://chore_quest:PASSWORD@127.0.0.1:5432/chore_quest_test'
npm test
```

Create that database once, as the `postgres` superuser:

```powershell
& "C:\Program Files\PostgreSQLin\createdb.exe" -U postgres chore_quest_test
& "C:\Program Files\PostgreSQLin\psql.exe" -U postgres -c "GRANT ALL ON DATABASE chore_quest_test TO chore_quest"
npm run db:migrate    # with TEST_DATABASE_URL also set as DATABASE_URL
```

This exists because it went wrong. The suites used to fall back to
`DATABASE_URL`, which was harmless until this laptop became the machine serving
the family - at which point `npm test` was creating users, approving chores, and
clearing the backup log against real household data. A guard now refuses a test
database whose name does not look like one, and a test greps the suites so the
fallback cannot come back.

## Secrets

`.env` files are git-ignored. Only `.env.example` is tracked, and it never contains
a real value. Anything prefixed `VITE_` is compiled into the browser bundle and is
public by definition — never put a secret there.

## Screens

The app is a hash-routed SPA. With `npm run dev` running, the child side starts at
`http://localhost:5173/#/` and the parent side at `http://localhost:5173/#/parent`.
`#/health` is a diagnostics page that pings the backend.

To review on a phone, see `docs/preview-on-phone.md` — either the GitHub Pages
preview build or the dev server over the house wifi at `http://<laptop-ip>:5173`.

## Project status

See `PROJECT_STATE.md` for the current stage and `DECISIONS.md` for the technical
decisions behind the setup.
