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

---

## 2026-08-19 — Plain SQL migrations with `node-pg-migrate`, no ORM

**Decision.** Schema changes are `.sql` files under `backend/migrations`, applied
by `node-pg-migrate`. Queries are hand-written SQL over `pg`, with `backend/src/db.ts`
owning only the pool, its shutdown, and the health probe.

**Reason.** The migrations stay readable and can be run through `psql` by hand if
the runner is ever unavailable, which matters for a database that lives on one
laptop with no ops team behind it. The runner still supplies the migrations
table, ordering, advisory locking, and `down` — the parts that are subtly easy
to get wrong. An ORM would have added a second schema definition to keep in sync
with this one.

**Consequences.** No generated types: a column rename is a find-and-replace
across SQL strings, and nothing but a test will catch a missed one. Every
migration must supply a working `-- Down Migration`; CI rolls the whole schema
back to empty and forward again on every push, so a broken one fails there
rather than during an emergency.

---

## 2026-08-19 — The points ledger is the only source of truth for points

**Decision.** `points_ledger` is append-only. No table stores a balance.
Spendable points are `SUM(delta)` and lifetime points are the sum of the
positive rows. Corrections are new rows, never edits.

**Reason.** A cached balance and the history behind it drift apart eventually,
and the first symptom is a child seeing points disappear with no line item to
explain it. Every number the wallet shows can be traced to a row.

**Consequences.** Balance is a query, not a column, so the read path is a sum
over `points_ledger_child_idx` — fine at household scale, and worth revisiting
only if a child's history reaches a size where it isn't. A partial unique index
on `(chore_instance_id, reason)` makes paying for the same chore twice
impossible, so a double-tapped Approve cannot silently double an award.

---

## 2026-08-19 — Chore definitions and instances are separate, and instances snapshot

**Decision.** A `chore_definition` is the template a parent edits. A
`chore_instance` is one chore, for one child, on one household day. Instances
copy the point value, and instance subtasks copy their title and instruction
rather than joining back to the template.

**Reason.** Editing "Kitchen Cleaning" next month must not rewrite what a child
did last week. Without the snapshot, renaming a subtask or repricing a chore
silently rewrites history, including the ledger labels that explain past awards.

**Consequences.** Duplicated text between template and instance is deliberate.
Changing a template affects only chores generated after the change, which is the
intended behavior and should be stated plainly in the parent UI.

---

## 2026-08-19 — Household days are `date` columns the application computes

**Decision.** `chore_date`, `week_start`, and `locked_until` are plain `date`
columns. The application decides which household day an instant belongs to using
`Intl` in `America/Chicago`; Postgres is never asked to do timezone arithmetic.
`backend/src/pg-parsers.ts` disables node-postgres's default `date` parser so
these come back as `YYYY-MM-DD` strings.

**Reason.** The default parser builds a `Date` at the *server's* local midnight,
so a machine in a different zone can report the previous day. That is the exact
class of bug the Intl decision exists to prevent, reintroduced at the driver.

**Consequences.** `pg-parsers.ts` must be imported by anything opening its own
connection, tests included — the parsers are global to the `pg` module, not
per-pool. A schema test asserts a round-tripped `chore_date` is still a string.

---

## 2026-08-19 — Production serves the frontend from the backend, same origin

**Decision.** In production the Windows backend serves the built frontend, so the
app and its API share one origin. GitHub Pages keeps publishing the frontend, but
that deployment is a design preview on mock data with no backend behind it.

**Reason.** Session cookies. Pages and a tunnelled laptop are different sites, so
the cookie would be third-party — which Safari on iOS blocks outright and Chrome
is phasing out. The kids are the ones on phones, and a login that silently stops
sticking is the worst failure this app could have. Same origin removes the
problem rather than working around it.

**Consequences.** Stage 16 exposes one hostname, not two. Stage 17 gains a step
that copies `frontend/dist` into what the backend serves, and `VITE_API_BASE_URL`
becomes empty in that build because the API is a relative path. `CORS_ORIGINS`
now matters only for local development, where Vite is a separate origin. The
frontend detects an unreachable API and falls back to preview mode, which is what
keeps the Pages build usable.

---

## 2026-08-19 — Opaque database-backed sessions, not JWTs

**Decision.** A session is 32 random bytes in an httpOnly, signed cookie. Only
its SHA-256 is stored. Children's sessions last 90 days and extend on use;
parents' last 1 day.

**Reason.** A parent has to be able to sign a lost phone out and have that take
effect at once. A stateless token cannot be withdrawn without building the
revocation list that a sessions table already is. The asymmetric lifetimes follow
the risk: a child losing their session mid-week is a support call and a bad
experience, while a parent session can approve chores, move points, and change
money settings, so it should not sit unlocked on a shared tablet for a month.

**Consequences.** Every authenticated request costs one indexed lookup, which is
nothing at household scale. Deactivating a member ends their access immediately,
because the lookup joins `users` and tests `is_active` rather than trusting a
claim baked in at login. Changing a PIN revokes that member's other sessions —
otherwise changing it after a device is lost would achieve nothing. Only the hash
is stored, so a backup sitting on the same laptop as the database does not hand
over live sessions.

---

## 2026-08-19 — scrypt for PINs, and a lockout that does the real work

**Decision.** PINs are hashed with `node:crypto`'s scrypt at N=32768, stored as
`scrypt$N$r$p$salt$hash`. Wrong attempts are counted per user and lock the
profile with a doubling backoff from the fifth failure, capped at one hour.

**Reason.** scrypt is memory-hard and built in, so there is no native module to
rebuild whenever Node updates on the laptop — argon2 wants node-gyp, and a
Windows toolchain that has to keep working unattended for years is a liability.
More importantly, no KDF makes a 4-digit PIN unguessable: 10,000 options fall to
anyone who can keep trying. The lockout is the control that actually matters, and
it counts per user rather than per IP because the whole household shares one
address — an IP limit would either be trivially evaded or lock everyone out at
once.

**Consequences.** The first four wrong entries cost nothing, so a child mistyping
their own PIN is not punished. Past that, exhausting the keyspace takes over a
year of continuous tapping. The cap means a locked-out child waits an hour at
worst, never until morning. Parameters live in the stored string, so raising the
cost later needs neither a migration nor a mass reset. The hash exists to protect
a leaked backup, not to make the PIN strong — children reuse these on phone lock
screens.

---

## 2026-08-19 — Household members are created from the laptop's terminal

**Decision.** `npm run user -w backend` creates members and sets PINs. There is
no seed migration and no public sign-up.

**Reason.** Authentication has a bootstrap problem: the screens that manage
people sit behind a login, and there is nobody to log in as until someone exists.
The alternative was seeding a family into a migration, which would put real names
into version control on a public repository.

**Consequences.** First run on a new machine is a terminal command, which the
"no profiles yet" state on the hero-select screen names explicitly. The CLI reads
the PIN from stdin rather than taking it as a flag, so it stays out of shell
history, and it refuses the handful of PINs a sibling guesses first. Stage 10
adds the parent-facing version of this and should reuse the same hashing and
revocation paths rather than reimplementing them.

---

## 2026-08-19 — Lifetime points are readable before sign-in

**Decision.** `GET /api/auth/profiles` returns each child's lifetime points
alongside their name and avatar. It is the only household figure served
unauthenticated, and only for children.

**Reason.** The approved hero-select screen puts a level badge and a lifetime
total on every child's card, and that screen is drawn before anyone signs in.
Withholding the number would have meant redesigning an approved screen; the
alternative disclosure is small, because anyone who can reach the API already
sees the household's first names, which that screen cannot function without.

**Consequences.** Nothing else is served before sign-in — no spendable balance,
no chore history, no photos, no PIN state beyond whether one is set. If the API
ever becomes reachable by people outside the household, revisit this first. The
tunnel hostname is effectively the secret protecting it.

---

## 2026-08-19 — Chore days are materialised lazily, not on a timer

**Decision.** `chore_schedules` becomes `chore_instances` the first time anyone
opens the app on a given day. Days missed since the last visit are filled in at
the same time, up to a 14-day limit, and never earlier than the day the child
was added to the household.

**Reason.** The backend lives on a laptop that sleeps. A job scheduled for local
midnight simply does not run on a suspended machine, so it would have needed
catch-up logic regardless — and then two code paths would have to agree on
exactly what a day contains. Materialising on read has one path, and it is
correct after an outage of any length.

**Consequences.** A chore day does not exist until someone looks, which is fine
for the child app but means anything running without a viewer — the Stage 12
reminders, the Stage 13 push notifications — has to materialise the day itself
before it can ask what is outstanding. Every statement is idempotent and keyed on
the partial unique index, so concurrent requests cannot double a day. The 14-day
limit exists so a household returning from holiday does not bury the approval
queue; the join-date floor exists so a child added this morning does not wake up
to two weeks of chores they never had the chance to do.

---

## 2026-08-19 — Frontend route guards are a convenience, not the boundary

**Decision.** `RequireRole` redirects anyone who is not signed in, but the API
re-checks every request and scopes every chore query to its owner. Guessing
another child's chore id returns 404, not 403.

**Reason.** A guard that lives in the browser can be stepped around by editing a
URL. It exists so a signed-out visitor lands on the profile picker instead of a
screen full of empty placeholders and failed requests — a usability feature that
should never be mistaken for the thing keeping siblings out of each other's
chores. 404 rather than 403 because confirming that a chore exists is itself a
small disclosure.

**Consequences.** Every new route that reads household data must scope its query
by the session's user; adding a route to the guarded section of the router is not
sufficient and never was. In preview mode the guard passes everything through,
because there is no server to sign in to and no household data to reach.
