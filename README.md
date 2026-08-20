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
| `npm run vapid` | Prints a fresh VAPID key pair for push notifications |
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

If phones cannot resolve the name, the usual cause is the router refusing to
return a private address from public DNS. It is called DNS rebinding protection
and has to be switched off, or the hostname added to its exception list.

Without any of this the app still runs on plain http exactly as before.

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
