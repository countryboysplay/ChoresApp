# Chore Quest — Project State

_Last updated: 2026-08-18_

| Field | Value |
| --- | --- |
| Current stage | Stage 2 — Design system and static GUI |
| Stage status | Rebuilt against the approved design board; awaiting visual approval |
| Last approved stage | Stage 1 — Frontend/backend scaffold |
| Frontend URL (dev) | http://localhost:5173 |
| Backend URL (dev) | http://localhost:4000 (health: `/api/health`) |
| Production URL | None yet — GitHub Pages lands in Stage 17 (repo `ChoresApp`, base `/ChoresApp/`) |
| Database migration status | No schema yet — Stage 3 |
| Test status | 19 passing (5 backend, 14 frontend); typecheck, lint, and production build clean |
| Last known good commit | Not yet committed — repo not initialized on the Windows laptop |

## Stage 0 findings

Prerequisites were verified in the build environment, not on the Windows laptop.
Re-run `npm run preflight` there before approving Stage 1.

| Check | Result |
| --- | --- |
| Node.js | v22 LTS — meets the 20.11+ floor |
| npm | 10.x — workspaces supported |
| Git | Required on the laptop; verified by preflight |
| PostgreSQL | **Not verified.** Must be installed and running before Stage 3 |
| PowerShell | Assumed present on Windows 11; preflight reports the version |
| Ports 4000 / 5173 | Free in the build environment; preflight rechecks locally |
| Workspace writable | Yes |

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
- No lockfile has been committed from the Windows laptop yet.
- Camera, photo, and pinch-zoom areas are placeholders with the correct states and
  copy; real `getUserMedia` capture is Stage 6.
- Playwright screenshots could not be produced in the build environment (no
  browser binary available). Visual review is by running the frontend locally.

## Pending owner decisions

1. **Points-to-dollars rate and minimum cash-out balance.** Deliberately left
   unset — the spec forbids inventing them. Wallet and cash-out currently render
   their "not configured" state, which is the correct behavior until Settings is
   filled in.
2. PostgreSQL install method on Windows (installer service vs. Docker Desktop).
3. Remote access approach for Stage 16 (Cloudflare Tunnel vs. Tailscale) — no
   router ports will be opened either way.
4. Backup retention window.

## Next planned work

**Stage 3 — Database schema and migrations.** Blocked until Stage 2 is visually
approved and PostgreSQL is running on the Windows laptop.
