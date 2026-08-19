# Chore Quest — Project State

_Last updated: 2026-08-19_

| Field | Value |
| --- | --- |
| Current stage | Stage 2 — Design system and static GUI |
| Stage status | Rebuilt against the approved design board; awaiting visual approval |
| Last approved stage | Stage 1 — Frontend/backend scaffold |
| Frontend URL (dev) | http://localhost:5173 |
| Backend URL (dev) | http://localhost:4000 (health: `/api/health`) |
| Repository | `countryboysplay/ChoresApp`, public, default branch `main` |
| Preview URL | https://countryboysplay.github.io/ChoresApp/ — frontend only, mock data, no backend |
| Production URL | None yet — a real deployment still lands in Stage 17 |
| Database migration status | No schema yet — Stage 3. Empty `chore_quest` database is provisioned and waiting |
| Test status | 20 passing (5 backend, 15 frontend) on the laptop; typecheck, lint, and build clean; CI green |
| Last known good commit | `41dfbe1` — Stage 0 prerequisites, first commit pushed from the laptop |

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

## Stage 2 — what to review

23 screens, all on mock data, no database and no API calls. Routes:

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
  logging with redaction, a single client-safe error handler, CORS restricted to
  localhost, and `GET /api/health`.
- Household time helpers with DST-boundary tests — the rule that every later
  scheduling feature depends on.
- Frontend: React 18 + Vite 6, HashRouter, design tokens for the approved palette
  and type scale, and a placeholder Home route that reports backend connectivity.
- Shared type-only API contract package.
- CI workflow running typecheck, lint, tests, and build on every push, plus a
  frontend-only GitHub Pages preview deploy so screens can be reviewed on a phone.
- Design system: palette and type tokens, buttons, cards, badges, chips, linear
  and circular meters, checklist items, sheets/modals, bottom navigation, tabs,
  form controls, empty states, and reduced-motion handling.
- Code-drawn icon set, layered SVG avatar with a working builder, and a Web Audio
  sound helper that generates every effect (no audio files, never blocks a flow).
- Level curve centralized in `frontend/src/config/levels.ts` — the only place a
  level threshold is computed.

## Known issues

- `database` in the health response is hardcoded to `not_configured` until Stage 3.
  PostgreSQL is running and `DATABASE_URL` is set; the route simply does not read
  it yet.
- The repository is **public**. It carries no secrets — CI fails the build if a
  `.env`, `.pem`, or `.key` is ever tracked — and the mock data uses `Child 1` /
  `Parent 1` placeholders rather than real names. Worth re-checking before any
  real household data goes anywhere near the frontend.
- Camera, photo, and pinch-zoom areas are placeholders with the correct states and
  copy; real `getUserMedia` capture is Stage 6.
- Playwright screenshots could not be produced in the build environment (no
  browser binary available). Visual review is by running the frontend locally.

## Pending owner decisions

1. **Points-to-dollars rate and minimum cash-out balance.** Deliberately left
   unset — the spec forbids inventing them. Wallet and cash-out currently render
   their "not configured" state, which is the correct behavior until Settings is
   filled in.
2. Remote access approach for Stage 16 (Cloudflare Tunnel vs. Tailscale) — no
   router ports will be opened either way.
3. Backup retention window.

## Next planned work

**Stage 3 — Database schema and migrations.** PostgreSQL is now installed and
running, and an empty `chore_quest` database owned by the `chore_quest` login
role already exists with `DATABASE_URL` wired into `backend/.env`. Stage 3 is
blocked only on Stage 2 visual approval.
