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
