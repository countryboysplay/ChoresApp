# Chore Quest — Technical Decisions

Each entry: date, decision, reason, consequences. Trivial styling choices do not
belong here.

---

## 2026-08-18 — Cloud coding assistant instead of local Qwen models

**Decision.** Development is done through a hosted assistant rather than the
`qwen2.5-coder-14b-deep` / `-7b-fast` pair described in the original build directive.

**Reason.** Owner directive. It removes the local model setup, the routing rules,
and the VRAM ceiling on how much context a single change can consider.

**Consequences.** Sections 2.1–2.3 of the build directive (model routing) no longer
apply. Everything else — the stage gates, the architecture, the design system —
still governs. The application itself contains no AI dependency of any kind.

---

## 2026-08-18 — npm workspaces monorepo, no monorepo tool

**Decision.** One repository with `frontend`, `backend`, and `shared` npm workspaces.
No Turborepo, Nx, or pnpm.

**Reason.** Three packages and one developer. A monorepo orchestrator would add
configuration surface without saving time at this size.

**Consequences.** Cross-package scripts are plain npm scripts. If the build ever
gets slow enough to need caching, revisit then.

---

## 2026-08-18 — `shared` is type-only

**Decision.** The shared package exports types and `const` type literals only, with
no build step, and is imported with `import type`.

**Reason.** Type-only imports are erased at compile time, so the compiled backend
has no runtime dependency on a workspace package. This avoids a class of production
startup failure where Node resolves a workspace symlink to uncompiled TypeScript.

**Consequences.** Any genuinely shared *runtime* helper needs a real build step for
`shared` first. Until then, runtime logic is duplicated deliberately or lives in
one app.

---

## 2026-08-18 — HashRouter, not BrowserRouter

**Decision.** React Router in hash mode.

**Reason.** GitHub Pages has no server-side rewrite. With history routing, a refresh
on `/parent/approvals` returns a 404 from Pages.

**Consequences.** URLs carry a `#`, e.g. `.../ChoresApp/#/parent/approvals`. Push
notification deep links (Stage 13) must be built in hash form.

---

## 2026-08-18 — Repository name is `ChoresApp`

**Decision.** The GitHub repository is `ChoresApp`. The production Vite `base` is
`/ChoresApp/` and the app is served from `https://<account>.github.io/ChoresApp/`.

**Reason.** Owner decision. GitHub Pages serves project sites from a path segment
matching the repository name, so the bundle's asset URLs must be built with it.

**Consequences.** The capitalization matters — Pages paths are case-sensitive, and
`/choresapp/` would 404 on every asset. The local folder stays `chore-quest` and
the npm workspace scope stays `@chore-quest/*`; only the deploy path is tied to the
repo name. Renaming the repo later means changing `VITE_BASE_PATH`, the service
worker scope (Stage 14), and every saved home-screen shortcut on the kids' phones.

---

## 2026-08-18 — Household time computed with `Intl`, no date library

**Decision.** Daily boundaries, reminder times, streaks, and the Sunday cash-out
reset are derived through `Intl.DateTimeFormat` with the `America/Chicago` zone.
Timestamps are stored in UTC.

**Reason.** A fixed UTC offset breaks twice a year. `Intl` is built into Node 22 and
every target browser, so no dependency is needed for date-level arithmetic.

**Consequences.** If recurrence math outgrows date-level operations, adopt a
timezone-aware library (Temporal polyfill or Luxon) rather than hand-rolling offset
arithmetic. DST-boundary tests exist and must stay green.

---

## 2026-08-18 — Zod-validated environment loader that fails fast

**Decision.** The backend parses and validates its environment at startup and exits
on invalid configuration, including an invalid IANA timezone.

**Reason.** A silently missing `DATABASE_URL` or a typo'd timezone would otherwise
surface as a wrong chore day weeks later.

**Consequences.** Every new configuration value must be added to the schema and to
`.env.example` in the same change.

---

## Open — decided later

| Topic | Stage | Notes |
| --- | --- | --- |
| ORM / migration tool | 3 | Leaning plain SQL migrations plus a thin query layer over a heavy ORM |
| Auth token approach | 4 | Long-lived trusted-device sessions for kids; parent sessions shorter |
| PWA / service worker strategy | 14 | Likely `vite-plugin-pwa` with a prompt-to-update flow |
| Tunnel choice | 16 | Cloudflare Tunnel vs. Tailscale. No router ports either way |
| Windows startup method | 18 | Scheduled Task at boot vs. NSSM service |
| Backup retention | 15 | Owner decision |

---

## 2026-08-18 — One design-system stylesheet, not CSS modules

**Decision.** The design system is a single `design/system.css` of composable
classes (`card`, `btn`, `badge`, `meter`, `check`, `sheet`, `navbar`) plus the
token file. Components are thin React wrappers over those classes.

**Reason.** The spec allows CSS modules *or* organized component CSS. With ~23
screens sharing one game-like visual language, per-component modules would
scatter the same card and button rules across two dozen files and make a palette
change a multi-file edit.

**Consequences.** Class names are global, so they must stay descriptive and
prefixed by role. Screen-specific one-offs use inline styles that reference
tokens rather than new global classes.

---

## 2026-08-18 — Status is never color-only

**Decision.** Every chore and item state renders as an icon plus a text label
(`StatusBadge`), with color as reinforcement only. The mapping lives in one
module.

**Reason.** Accessibility requirement in the spec, and it also survives
grayscale, glare, and cheap phone screens.

**Consequences.** New states must be added to the status map, not styled ad hoc.

---

## 2026-08-18 — Generated sound, no audio assets

**Decision.** All five game sounds are synthesized with the Web Audio API in
`design/sound.ts`. Playback is fire-and-forget and silently no-ops when the
browser blocks audio before a user gesture.

**Reason.** The spec requires generated effects and forbids letting sound block a
workflow. It also keeps the repo free of binary assets.

**Consequences.** Effects are simple tone sequences. Richer sound would mean
adding files and revisiting offline caching.

---

## 2026-08-18 — Owner-configured money values stay unset in mock data

**Decision.** The Stage 2 mock data sets the points-to-dollars rate and minimum
cash-out threshold to `null`, so Wallet renders its "cash-out is turned off"
state.

**Reason.** The spec explicitly forbids inventing either value. Showing a
plausible fake rate during visual review would quietly make up a household money
rule and risk it surviving into later stages.

**Consequences.** The cash-out screens are reviewed in their unconfigured state.
Once the rate is set in Settings, the same screens show real dollar values.


---

## 2026-08-18 — Approved design board is the visual authority

**Decision.** The Stage 2 UI was rebuilt against
`Chore_Quest_Claude_UI_Package`. Tokens, panels, pills, navigation, and screen
composition now follow the board rather than the earlier text-only reading of the
spec.

**Reason.** Owner directive: these are the approved renders.

**Consequences.** Two visual worlds now exist by design — a bright sky gradient
for pre-login (splash, hero select, PIN) and deep navy for the app itself. Screen
structure follows the board, but where board mockup text conflicts with the
written specification (a $50 weekly cap, optional photos, parents on the
leaderboard), the specification wins, as the package README instructs.

---

## 2026-08-18 — Fonts self-hosted from npm

**Decision.** Fredoka and Nunito ship through `@fontsource/*` packages and are
bundled by Vite.

**Reason.** The spec prefers bundled fonts over a remote CDN, and the PWA must
render correctly offline. Fontsource keeps the files out of Git while still
producing self-hosted assets in the build.

**Consequences.** Roughly 20 KB per weight per subset in the build output. Only
the weights actually used are imported; adding a weight means adding an import in
`styles/global.css`.


---

## 2026-08-18 — One palette across parent and child, leaderboard is kids only

**Decision.** The parent app uses the same navy surfaces, accent colors, and
components as the child app at every screen size. The light-themed desktop
dashboard shown in the reference renders is not being built. The leaderboard
ranks the two children only; parent accounts never appear on it.

**Reason.** Owner decision. One palette means one set of tokens to maintain and
no second theme to keep in sync as screens change, and the leaderboard exists to
motivate the kids against each other, not to rank the household.

**Consequences.** Desktop parents get a sidebar rather than a different skin. If
a light mode is ever wanted, it should be a token-level theme applied to both
sides at once, not a parent-only fork. A test asserts no parent name renders on
the leaderboard.


---

## 2026-08-18 — Frontend-only Pages preview pulled forward from Stage 17

**Decision.** A `Deploy frontend preview` workflow publishes the built frontend to
GitHub Pages on every push to `main`, ahead of the Stage 17 CI/CD work.

**Reason.** Stage 2 is a visual approval gate, and the reviewer needs to see the
screens on a phone without access to the Windows laptop. The Stage 2 screens run
on mock data, so no backend or database is involved.

**Consequences.** The repository must be public for Pages on a free plan. Only
static frontend assets are published — the backend, the database, and household
data stay on the laptop, as the architecture requires. Stage 17 extends this
workflow with the production API URL rather than creating a new one.
