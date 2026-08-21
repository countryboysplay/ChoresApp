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
| ~~PWA / service worker strategy~~ | ~~14~~ | Settled in Stage 14: vite-plugin-pwa in injectManifest mode, shell-only precache, update on next launch |
| ~~Tunnel choice~~ | ~~16~~ | Settled in Stage 16: neither. Nothing is exposed; https on the home wifi via a public certificate for a private address |
| ~~Windows startup method~~ | ~~18~~ | Settled in Stage 18: Scheduled Task at boot, running as the owner, with the launcher supervising restarts |
| ~~Backup retention~~ | ~~15~~ | Settled in Stage 15: 14 nightly then 8 weekly, mirrored to a USB drive when plugged in |

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

---

## 2026-08-19 — Photos are downscaled in the browser, not on the server

**Decision.** The camera captures a frame, draws it to a canvas at a maximum
1600px on the long edge, and encodes JPEG at 0.85 before uploading. The backend
stores exactly what it receives and has no image library.

**Reason.** A parent is deciding whether a counter got wiped, on a phone screen;
1600px settles that comfortably. Resizing on the client turns a 4MB camera frame
into roughly 200KB, which is the difference between a fast submit and a child
watching a spinner on house wifi. It also keeps `sharp` off the laptop — a
native module that would have to keep building unattended across Node upgrades
for years, in a project that has otherwise avoided native dependencies.

**Consequences.** The server trusts the client for dimensions, which is
acceptable because it does not trust it for anything that matters: the bytes are
sniffed for a real image signature, capped at 6MB, and limited to five per chore.
Storage is roughly 200KB per chore per day. If proof ever needs to be
full-resolution — a dispute about damage, say — this is the decision to revisit.

---

## 2026-08-19 — Proof is served through the API, never as static files

**Decision.** Photos live outside the web root under `PHOTO_STORAGE_DIR`, sharded
`YYYY/MM/DD`, named with a random UUID. `GET /api/photos/:id` authenticates,
checks that the requester is the owning child or any parent, and streams the file
with a content type this server chose from the sniffed bytes.

**Reason.** These are pictures of the inside of a family's home, taken by
children. A static directory would make every one of them readable by anyone who
learned or guessed a URL, and the app is going to sit behind a public tunnel.

**Consequences.** Every photo view costs a database lookup, which is nothing at
this scale and is also what makes the "every photo must be opened before Approve
All" rule possible — the serve route is the only place that can know a parent
actually looked, and it stamps `first_viewed_at` there. UUID names rather than
content hashes, so two identical photos stay two files and deleting one chore's
proof cannot remove another's. Date sharding means pruning old proof is deleting
folders rather than querying for candidates.

---

## 2026-08-19 — The camera is the only source of proof

**Decision.** Capture is `getUserMedia` only. There is no file input, no gallery
picker, and no upload fallback anywhere in the app.

**Reason.** The specification requires a photo of the work just finished. A
gallery picker would let a child submit last week's clean kitchen, and no amount
of copy on the screen would stop that.

**Consequences.** Browsers only expose the camera in a secure context, so
reaching the dev server over house wifi at `http://192.168.x.x` cannot work —
the screen says so plainly instead of offering a button that fails on tap.
Testing capture means the laptop itself, or waiting for the Stage 16 tunnel to
provide https. Submission is blocked without a photo, enforced on the server,
so a browser that cannot open the camera cannot complete a chore either.

---

## 2026-08-19 — The punctuality bonus is decided at submission, and stored

**Decision.** A chore earns the punctuality bonus when the child sends it in
before `household_settings.reminder_time` on its own chore day. That is worked
out at submission and written to `chore_instances.submitted_punctual`, not
recomputed when a parent reviews.

**Reason.** Owner decision, 2026-08-19. It puts the bonus entirely inside the
child's control: it depends on when they finished, not on when a parent got
round to looking. Tying it to approval instead would mean a child who finished at
six loses points because nobody opened the app that evening. Storing rather than
recomputing matters for the same reason a parent can change `reminder_time` -
recalculating later would silently rewrite whether chores already sent in were
on time.

**Consequences.** `reminder_time` is now load-bearing rather than only a
notification setting, and the 8:45pm reminder means something concrete: it fires
as the bonus is about to be lost. `escalation_time` stays the separate
"still not done" alert. Submitting a previous day's chore is never punctual
however early in the evening it happens.

---

## 2026-08-19 — Approval is the only thing that writes to the ledger

**Decision.** `POST /api/parent/approvals/:id/approve` sets the status, records
the award, and writes the ledger rows in one transaction, with the chore row
locked for the duration. The award and the punctuality bonus are separate ledger
rows.

**Reason.** Points with no history, or history with no points, is exactly the
drift the ledger decision exists to prevent - so it cannot be two operations.
The row lock is because two parents can both be looking at the queue on their own
phones; without it both see `submitted` and both pay. Separate rows because the
wallet has to be able to say why one approved chore paid more than the same chore
did yesterday.

**Consequences.** Approving is a write to four things and is not idempotent by
accident - it is idempotent by the status check plus the partial unique index on
`(chore_instance_id, reason)`, which means even a bug that got past the status
check could not pay twice. Approve All runs each chore in its own transaction and
reports what it skipped, so one problem does not roll back the approvals that
already worked.

---

## 2026-08-19 — Approval requires the photo to have been opened

**Decision.** The server refuses to approve a chore that has a photo nobody has
opened, and the queue's Approve All button is disabled until every photo in it
has been. Rejection requires a note, clears the checklist, and the old photo no
longer counts as proof of the fix.

**Reason.** The specification's rule against rubber-stamping. Disabling a button
is not enforcement, and the review screen loads the photo - which is what marks
it seen - so reaching the screen is what unlocks approval. On the other side,
"do it again" with no reason is the thing that makes a child give up, and the
screen already promises "check everything again and take a new photo", so both
have to be true rather than decorative.

**Consequences.** A parent cannot approve from the queue without opening each
submission, which is the intent. Photos taken before a rejection are kept as a
record but cannot satisfy the resubmission - the submit route only counts proof
created after `reviewed_at`. Clearing the checklist loses the record of what was
ticked on the first attempt; the photos and the note remain as the history of
that round.

---

## 2026-08-19 — Redeeming debits immediately; denial refunds with a second row

**Decision.** Requesting a reward writes a negative `points_ledger` row straight
away. Approving moves no points. Denying writes a matching positive row with
reason `reward_refunded`.

**Reason.** The redemption sheet tells a child their points are held, and a debit
is what makes that true - otherwise the same 150 points could be requested
against three different rewards while all three sat waiting for a parent. The
refund is a second row rather than a deletion because the wallet should read as a
charge and a refund; points that quietly reappear with no line are exactly the
kind of thing that makes a child stop trusting the number.

**Consequences.** A denied request leaves three rows in the history rather than
none, which is the intent. Spending is serialised per child by locking their
`users` row before reading the balance - Postgres refuses `FOR UPDATE` on an
aggregate, and locking the existing ledger rows would not help anyway, since the
race is two requests reading the same total and each inserting a new row.

---

## 2026-08-19 — Rewards are retired, never deleted

**Decision.** `DELETE /api/parent/rewards/:id` sets `is_active = false`. Nothing
removes a reward row.

**Reason.** `reward_redemptions` points at these rows, and each redemption keeps
the price actually paid. Deleting would take the name of what a child saved up
for out of their own history.

**Consequences.** The catalogue a parent sees includes retired entries, greyed;
the child's screen only lists active ones. A retired reward can still be named in
a history entry from months earlier, which is the point.

---

## 2026-08-19 — Cash-out reports itself unconfigured rather than hiding

**Decision.** `GET /api/child/wallet` returns `cashOut.configured`, plus null
values for the rate, the minimum, and the amount available. The wallet renders a
plain "cash out is turned off" panel from that flag.

**Reason.** Owner decision, 2026-08-19: the points-to-dollars rate and minimum
balance stay unset. The specification forbids inventing them, and a plausible
placeholder rate would quietly invent a household money rule that could survive
into real use. One explicit flag is safer than leaving the screen to infer the
state from nulls, which is how a `0` or a `NaN` ends up in front of a child.

**Consequences.** The wallet, the weekly $40 cap, and the ledger all work today;
only the conversion is inert. Setting both values in Settings turns cash-out on
with no code change. `availableCents` is null rather than zero, so nothing can
accidentally render "$0.00 available" as though the rate were known.

---

## 2026-08-19 — A lapsed bonus claim returns to the board with a fresh window

**Decision.** Owner decision: a claimed bonus chore that passes its deadline
unfinished goes back on the board, with no penalty and no missed status, and a
child holds one unfinished bonus at a time. The returned chore gets a new
deadline the same length as the original, taken from
`chore_instances.claim_window_minutes`.

**Reason.** The two rules together are what make claiming the whole board
pointless: a second claim means finishing or releasing the first, and sitting on
one just hands it back. The fresh window is what makes the return meaningful -
handing a chore back with a deadline already in the past would take it off the
board entirely, which is exactly the blocking the rule exists to prevent.

**Consequences.** The window is a stored column rather than inferred from
`expires_at - created_at`. That inference was the first implementation and is
wrong twice over: it is destroyed the moment `expires_at` is rewritten, and after
one release `created_at` no longer marks the start of the window, so each
subsequent release would hand out a longer one than the last. Release is lazy,
like day materialisation and for the same reason - the laptop sleeps - so the
first person to open the board is the one who triggers it. A submitted or
approved bonus is never taken back; it is waiting on a parent, not on the child.

---

## 2026-08-19 — A parent cannot withdraw a bonus chore somebody is doing

**Decision.** `DELETE /api/parent/bonus/:id` is refused once a child has claimed
it and the work is unfinished.

**Reason.** Pulling it then means a child sweeping the garage for points that
vanished mid-task. The deadline already handles the case where nobody gets to it,
so there is no situation this refusal leaves unresolved.

**Consequences.** A parent who genuinely wants it gone waits for the claim to
lapse, which is at most the window they chose when posting it. The screen says
"Someone is on it" rather than presenting a button that fails.

---

## 2026-08-19 — Children are managed in the app; parents are not

**Decision.** Owner decision. A parent can add a child, set or reset a child's
PIN, deactivate a child, and change every household setting, all from the app.
Adding a parent, changing another parent's PIN, and deactivating a parent stay
terminal jobs on the laptop.

**Reason.** Locking a parent out of their own household is not recoverable from
inside the app - there is nobody left with the authority to undo it. Keeping
those three actions on the laptop removes the possibility entirely, rather than
guarding against it with a confirmation dialog that an argument, a mis-tap, or a
child holding an unlocked parent phone would sail straight through.

**Consequences.** Setting up a second parent needs the laptop once, which is the
same moment the first parent is created anyway. The members screen lists parents
and says plainly where they are managed instead of hiding them. Resetting a
child's PIN signs out every device that child is on, because doing it after a
phone goes missing would otherwise achieve nothing.

---

## 2026-08-19 — Cash-out is turned on by setting both values together

**Decision.** `PATCH /api/parent/settings` refuses a request that sets the
points-to-dollars rate without the minimum, or clears one without the other.

**Reason.** A rate with no minimum is not a rule anyone chose, and it would leave
the wallet unable to say which half is missing. The pair is the setting; either
alone is a half-finished thought.

**Consequences.** Turning cash-out off means clearing both, which is the same
gesture as never having set them - the wallet returns to exactly the state it has
been in since Stage 8. This is the only place the two values can be set; nothing
in the app defaults them, and nothing infers one from the other.

---

## 2026-08-19 — A new chore starts today, not at its schedule's earliest date

**Decision.** A schedule created through the chore wizard gets `starts_on` of
today unless a parent picks a later date.

**Reason.** Materialisation backfills up to a fortnight. Without this, a chore
created on a Tuesday morning would arrive on a child's list already carrying two
weeks of history they never had the chance to do, and would drag their streak
down on the day it was created.

**Consequences.** Backdating a chore deliberately means choosing an earlier start
date, which is an explicit act rather than an accident. This is the second of the
two guards on backfill; the first is the join-date floor from Stage 5, which
protects a newly added child in the same way.

---

## 2026-08-19 — Only a parent's decision breaks a streak

**Decision.** Owner decision. A chore nobody finished stays open until a parent
picks excused, carried over, or missed. Until then it neither extends a streak
nor ends one. `missed` is the only status that breaks a streak, and nothing sets
it automatically.

**Reason.** The streak calculation previously treated any unresolved past day as
a break, which meant a parent being busy on a Tuesday silently cost a child a
fortnight's progress. That is a penalty nobody chose to apply, and the child had
no way to see it coming or to prevent it. A record should say "missed" only when
a person decided that.

**Consequences.** A household that never opens the parent app keeps every
streak alive indefinitely, which is the intended trade: a streak that overstates
is better than one that punishes a child for an adult's inattention. Unresolved
days pile up in Needs attention rather than resolving themselves. A rejected
chore also pauses rather than breaking, because it is still work the child can
fix and resend.

---

## 2026-08-19 — Carrying over creates a new chore rather than moving the old one

**Decision.** Carrying a chore over closes the original as `carried_over` and
inserts a fresh instance on today's list, linked back through
`carried_over_from` and carrying the same points.

**Reason.** Moving the original row's date would quietly erase the fact that a
chore was due on the day it was actually due, which is the thing a week's history
is for. Two rows keep each day's record honest and still give the child a real
chance to earn the points.

**Consequences.** The new instance snapshots its checklist from the template
rather than inheriting yesterday's ticks: the work has to be done again, so the
boxes start empty. If today's schedule already produced the same chore, no second
copy is created - the partial unique index would refuse it, and two of the same
chore on one day is not what a parent asked for. Closing the old day is still
correct in that case, so the request succeeds with `carriedTo: null`.

---

## 2026-08-19 — The laptop does not sleep, and reminders run on a timer

**Decision.** Owner correction: the laptop is configured never to sleep. The
reminder sweep therefore runs on an in-process interval, started with the server,
and is the only timer in the project.

**Reason.** Several earlier decisions - lazy day materialisation, lazy bonus
release - were argued partly from "the laptop sleeps, so a timer cannot be
trusted". That premise was wrong. Those decisions still stand on their remaining
merits: lazy work is correct after a power cut, a Windows update reboot, or any
other gap, and there is no scheduler state to keep. But reminders cannot be lazy
under any premise, because the entire point of a reminder is that it happens when
nobody is looking.

**Consequences.** The sweep is written as a reconciliation rather than an event:
it asks what should have been sent by now, not what just happened. A tick that is
late, early, or missed entirely changes only when the notification arrives, which
is what makes a restart at 9:20pm still deliver the 8:45pm reminder rather than
swallowing the evening. Nothing depends on the process having been alive at a
particular instant, and the tick interval carries no correctness argument.

---

## 2026-08-19 — The reminder goes to the child, the escalation to the parents

**Decision.** Owner decision. At `reminder_time` the child alone is told their
chore is unfinished. At `escalation_time`, if it is still unfinished, the parents
are told. The child is not told twice.

**Reason.** The reminder lands at the moment the punctuality bonus is about to
lapse, so it is a chance to act rather than a report to management. Telling a
parent at 8:45pm about something the child still has two hours to fix is how a
household learns to ignore notifications. By 11pm it is a household matter rather
than something the child is about to sort out.

**Consequences.** A parent who wants to know earlier has the dashboard, which
shows the day as it stands. Notifications are unique per person, per thing, per
kind, enforced by a partial unique index, so overlapping sweeps cannot produce
two identical nudges and a re-run after a restart is a no-op.

---

## 2026-08-19 — Backend tests run one file at a time

**Decision.** `fileParallelism: false` in the backend vitest config.

**Reason.** Every suite shares one Postgres database, and parts of the system are
household-wide by design: there is a single `household_settings` row, and the
reminder sweep deliberately tells every parent about every child. Run in
parallel, one file's chores put notifications in another file's inboxes, and one
file's settings change the times another file is asserting against. The failures
moved between runs, which is the worst kind: they read as flaky tests rather than
as a real property of the system.

**Consequences.** The suite is sequential and takes a few seconds. A database per
worker would restore parallelism and is worth doing if it ever gets slow enough
to care; at this size it would be complexity bought for nothing.

---

## 2026-08-19 — Only the child's evening reminder buzzes a phone

**Decision.** Owner decision. `chore_reminder` is the only notification kind
delivered by push. Escalations, approvals, rejections, reward answers, and
posted bonus chores are written to the inbox and read when the app is next
opened. The list lives in one place, `PUSHABLE_KINDS`, so adding a kind later is
a one-line change with a test to match.

**Reason.** The reminder is the only notification whose entire purpose is to
reach somebody who is not looking - it lands at the moment the punctuality bonus
is about to lapse, and a reminder nobody sees until they open the app is not a
reminder. Everything else is news. A household interrupted several times a day
for news learns within a week to swipe the app away, and then the one message
that had to arrive does not either.

**Consequences.** A parent is never buzzed at all. They have the dashboard,
which shows the day as it stands, and now an inbox screen for the 11pm
escalation. If that turns out to be too quiet, adding `chore_escalation` to the
list is the whole change - but it should be a deliberate second decision rather
than a default nobody chose.

---

## 2026-08-19 — A push-only service worker, ahead of the Stage 14 PWA work

**Decision.** `frontend/public/sw.js` is a hand-written worker with a `push`
handler and a `notificationclick` handler and nothing else. No precaching, no
offline support, no update prompt. Stage 14 still owns all of that and may
replace this file wholesale when it brings in a build plugin.

**Reason.** Push cannot work without a registered service worker, so something
had to come forward. Caching did not: a precache that serves a stale bundle is a
bug that hides for a week and then breaks a screen for everybody at once, and it
has nothing to do with delivering a notification. Merging the two stages would
have put a caching bug and a push bug in the same commit.

**Consequences.** Chrome still will not offer a true install prompt, because
that wants a worker with a fetch handler - Add to Home Screen continues to work,
as it has since Stage 2. The worker takes control immediately (`skipWaiting`
plus `clients.claim`), which is only safe because there is nothing cached for an
older version to disagree with; Stage 14 has to revisit that line when it adds
one. It is plain JavaScript in `public/`, served as-is, so eslint needs the
service-worker globals for that one file.

---

## 2026-08-19 — Push is at-most-once, and the inbox is the durable copy

**Decision.** The drain marks a notification `pushed_at` before attempting the
send. A crash between the two loses the buzz rather than repeating it, and
nothing retries a failed send.

**Reason.** The alternative - mark after success - turns every restart into a
re-send of whatever was in flight, and a phone that buzzes four times about one
chore teaches a child to turn notifications off. That costs more than the
occasional missed buzz, because the message is never actually lost: it is in the
inbox either way, and the inbox is what the app shows when it opens.

**Consequences.** `pushed_at` means "the sender has finished with this row", not
"a phone rang" - it is set on notifications that were never eligible to be sent
at all. Rows are claimed with `FOR UPDATE SKIP LOCKED`, so two overlapping
drains cannot both take the same one. The one deliberate exception is a
household with no VAPID keys: those rows are left unclaimed, so adding the keys
in the evening still delivers that evening's reminders.

---

## 2026-08-19 — Nothing older than 45 minutes is pushed

**Decision.** A notification past 45 minutes old is marked done without being
sent. It stays in the inbox.

**Reason.** After a power cut, a Windows update, or a week with the laptop off,
the first drain finds every unpushed row at once. Sending them would buzz a
child's phone thirty times about chores from days ago, which is indistinguishable
from a broken app. Past the window the message is history rather than an alarm,
and the inbox is the right place to read history.

**Consequences.** This is the one thing in the project that can silently drop a
notification, and it does so only in the case where delivering it would be
worse. The number sits with the 8:45pm reminder and the 11pm escalation: a
reminder that arrives after 9:30pm has missed the moment it existed for. The
push itself also carries a four-hour TTL, so a phone that has been off all
evening does not light up at breakfast.

---

## 2026-08-19 — A push subscription belongs to a browser, and dies with the sign-in

**Decision.** `push_subscriptions.endpoint` is the unique key, not `(user_id,
endpoint)`. Subscribing signs the row over to whoever is signed in now. Revoking
a session deletes its subscription, and so does resetting a PIN.

**Reason.** The endpoint is minted by the phone's push service and is the same
string whoever is logged in, so it genuinely identifies a browser rather than a
person. On a shared tablet, keying by person would leave the first child's
reminders arriving all evening on a device the second child is holding. And a
PIN gets reset precisely because a phone went missing - signing that phone out
while leaving it subscribed would achieve nothing.

**Consequences.** This is the one place a row is deleted rather than marked.
There is no history worth keeping: the browser mints a fresh endpoint the next
time anybody says yes, and a stale one is unusable by definition. A phone keeps
its browser-side subscription across a sign-out even though the server row is
gone, so the app re-registers it after every sign-in - without that, a child who
signs back in has a browser that believes it is subscribed and a household that
will never send to it.

---

## 2026-08-19 — The scheduler tick is now the push latency ceiling

**Decision.** The reminder sweep and the push drain run on the same 15-second
interval, down from 60 seconds.

**Reason.** Until now the interval carried no correctness argument at all - the
sweep is a reconciliation, so a tick that is late or missed changed only when a
notification appeared in an inbox somebody would open later anyway. Push makes
the number visible: it is how long a phone waits after a reminder is written.
That is still not a correctness argument, but it is the first time the number has
meant anything to anybody.

**Consequences.** Both remain reconciliations and neither depends on the process
having been alive at a particular instant, so a restart at 9:20pm still delivers
the 8:45pm reminder and puts it on the phone. They are guarded separately: a
sweep that fails must not hold up notifications that were already written, which
are not its fault. The cost is a handful of indexed queries against a
household-sized database every fifteen seconds.

---

## 2026-08-19 — The parent inbox gets a screen

**Decision.** `Notifications` moves out of `screens/child/` and becomes
`screens/Inbox.tsx`, served at `#/child/notifications` and
`#/parent/notifications`. A parent reaches it from the sidebar on a desktop and
from a bell on the dashboard on a phone.

**Reason.** Stage 12 wrote the 11pm escalation to the parents' inbox rows and
never built a route that could open them, so everything a parent was told went
somewhere nobody could look. Push made that unavoidable rather than merely
wrong: a notification that is tapped has to land on a screen.

**Consequences.** One component, two routes, and the only difference between
them is that a parent gets a back button where a child has the bottom bar. The
parent phone navigation keeps its five tabs - the inbox is not a
several-times-a-day destination and should not displace one that is - so the
bell on the dashboard, with an unread count, is the way in.

Superseded in part the same day - see "Reminders are not optional for a child"
below, which removed the child's off switch and moved the only remaining one to
the parent side.

This is a deliberate change to an approved Stage 2 screen, so it is recorded
here rather than left as drift: the inbox now carries a "Reminders on this
phone" panel above the list. It sits there because the inbox is where somebody
already is when they are thinking about notifications, and because per-device is
what a subscription actually is - the same person answers it again on a tablet.
The panel draws itself only once it knows which of its six states applies, so it
never flickers from Off to On as the screen settles, which would read as the app
changing the setting by itself.

---

## 2026-08-19 — VAPID keys are all three or none

**Decision.** The environment loader refuses a configuration with some but not
all of `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`, and refuses
a subject that is not `mailto:` or `https://`. Empty is treated as absent.

**Reason.** The same argument as the points-to-dollars rate and the cash-out
minimum: a partial setting is not a rule anybody chose, and it leaves the app
unable to say which half is missing. The subject check exists because push
services reject anything else outright, and they do it at send time - which
would be the evening the first reminder failed to arrive.

**Consequences.** `npm run vapid` prints the three lines to paste in. With none
of them set, push is simply off and every other part of the app is unchanged:
reminders still reach the inbox, the panel on the inbox screen says the laptop
has no keys yet, and System status says so too. Regenerating the pair
invalidates every existing subscription, because the push services tie each one
to the key that created it - recoverable, since each phone resubscribes on its
next sign-in, but not silent.

---

## 2026-08-19 — Reminders are not optional for a child, and the app says so honestly

**Decision.** Owner decision, replacing the opt-in switch shipped earlier the
same day. A child's app has no way to turn reminders off, and asks for
permission by itself rather than waiting to be asked - on sign-in, from inside
the tap that submitted the PIN, and again from the inbox panel. The only off
switch in the system is `users.reminders_muted`, on a parent screen a child
cannot reach.

**Reason.** The owner's requirement was that reminders be on by default and not
turned off. Half of that is not achievable and the app must not pretend
otherwise: notification permission belongs to whoever is holding the phone.
Chrome will not let a site grant itself permission, and Chrome's own settings
can always take it back. An app claiming to prevent that would simply move the
off switch to a place a parent never looks, which is worse than not claiming it -
the rule would appear to hold while quietly failing.

So the requirement is met the only way a browser permits: never offer a way out,
take the decision away from the child where the platform allows, and make the
platform's own way out **visible**. A child who switches notifications off in
Chrome appears on the parent dashboard as "not reaching" within a page load.
Enforcement it is not; accountability it is, and that is the honest version.

**Consequences.** Three surfaces changed. The child panel lost its off button
and gained an unprompted request - `enablePush` is attempted once per mount, and
once more at sign-in inside the PIN tap, because Chrome treats a permission
request that followed a gesture more generously than one that arrived alone. The
parent inbox no longer shows a switch for the parent's own phone, which was
always a button that could do nothing - parents are never pushed to - and shows
the per-child state instead. The parent dashboard carries a red banner naming
any child whose reminders have stopped arriving, and stays silent otherwise,
including for a child the parent muted deliberately.

Muting stops the phone, not the record: a muted child's reminders still land in
their inbox, and the drain closes those rows rather than holding them, because
unmuting is not a licence to replay yesterday. `reminders_muted` sits on `users`
rather than in its own table - it is one fact about a person, checked on every
send, on a row already being read.

The blocked-permission copy tells the child their grown-up can see it. That is
deliberate: a rule enforced by visibility only works if the person it applies to
knows they are visible.

---

## 2026-08-19 — Preview mode is a build flag, never a guess about a failed request

**Decision.** `preview` is set by `VITE_PREVIEW_MODE`, which only the GitHub
Pages workflow passes. A real build that cannot reach the API enters a new
`offline` mode: no user, no mock profiles, no route let through.

**Reason.** Until Stage 14 the app fell into preview whenever a request failed,
and `RequireRole` lets everything through in preview. That was harmless for one
reason only - an app with no cached shell does not open at all without a server,
so the state was unreachable. Stage 14 is precisely the change that removes that
protection. Once the shell is cached the app **opens** with the API unreachable,
which turns "the server did not answer" into a way in: pull the wifi, wait for
the laptop to sleep, and after the Stage 16 tunnel, from outside the house.

A demo convenience is not worth an authentication hole, and the two states are
not actually the same question. "Was this built for the demo" is knowable at
build time. "Why did this request fail" is not knowable at all.

**Consequences.** `isPreviewBuild()` reads an env var Vite replaces with a
literal, so a production bundle compiles to `'undefined' === 'true'` and cannot
be argued into preview mode at runtime whatever the browser does. It is a
function rather than a constant so a test can prove both sides. Three tests in
`offline.test.tsx` pin it shut, and all three were confirmed to fail against the
old behavior before being kept - a security test that would pass anyway is worse
than none. The vitest config sets the flag on, because the screen tests review
the design on mock data with no server, which is exactly what the Pages build is.

---

## 2026-08-19 — The shell is cached; the data never is

**Decision.** Owner decision. The service worker precaches only what the build
emitted - HTML, JS, CSS, fonts, icons. No API response is stored, and nothing is
queued for later. Offline, the app opens and says plainly that it cannot reach
home.

**Reason.** A cached chore list cannot be told apart from a live one by the
person reading it. A chore approved ten minutes ago still shows as pending, a
tick goes nowhere, and a child can believe work was submitted when it was not.
An app that quietly lies about what has been done is worse than one that admits
it is offline. Queuing actions for later sync was considered and rejected on the
same grounds, with conflicts and stale photos on top.

**Consequences.** What caching buys is narrow and worth stating exactly: the app
opens instantly, and offline it wears its own face instead of the browser's
error page. That is all, and it is enough. The offline screen carries the
sentence that matters to a child - nothing is lost, everything is safe at home -
and retries by itself when the `online` event fires, because a phone that
regains wifi should not need anybody to press anything.

Navigations are served from the cached `index.html` through Workbox's
`NavigationRoute`, not a hand-rolled `fetch` listener: Workbox already installs
one and its precache route resolves a bare `/` to `index.html` on its own, so a
second listener would be the second handler to call `respondWith` on the same
navigation, which throws. `/api/` is on the route's denylist so an unreachable
server always reaches the app as an unreachable server.

---

## 2026-08-19 — A new version waits for the next launch

**Decision.** Owner decision. The worker does not call `skipWaiting()` or
`clients.claim()`. A new version installs, waits, and takes over once every tab
has closed.

**Reason.** Stage 13 called both, which was safe only because nothing was cached
and there was no older version for a new one to disagree with. With a precache
that is no longer true. The alternatives are worse in a household: a reload
forced as soon as the download lands can pull the page out from under a
half-finished checklist or a photo capture, and a "new version available" prompt
is something a child dismisses forever and a parent meets mid-approval.

**Consequences.** The cost is running yesterday's build for one more session,
which is the cheaper failure by a wide margin. There is deliberately no
`onNeedRefresh` handler - with no `skipWaiting` there is nothing to tell anybody
about. Anything that ever needs a version live immediately, such as a fix to the
money rules, has to be treated as a deliberate exception rather than assumed.

---

## 2026-08-19 — vite-plugin-pwa in injectManifest mode, not generateSW

**Decision.** The worker stays hand-written and moves from `public/` to `src/`.
The build's only job is to inject the precache manifest into it. The Stage 2
`manifest.webmanifest` is kept as-is rather than regenerated.

**Reason.** The worker already carried the push and notification-click handlers
from Stage 13, and a generated worker would have to be taught them anyway
through the same injection point - at which point the generator is adding
configuration rather than removing code. Hand-rolling the precache itself was
the other option and is the worse one: cache invalidation across hashed
filenames is exactly the kind of thing that looks finished and then serves a
stale bundle for a week.

**Consequences.** The worker is now bundled rather than served as written, so
`eslint` points at `frontend/src/sw.js` and the file may use imports.
Registration moved out of `push.ts` into `lib/serviceWorker.ts` and happens once
at startup for the whole app - push now waits on `navigator.serviceWorker.ready`
rather than registering its own, because two callers racing to register is how a
subscription ends up attached to a registration that is about to be replaced.
That wait is raced against a timeout, since `ready` never rejects and would
otherwise hang a panel forever. `devOptions.enabled` is on because push is
tested on localhost, the only secure context available before Stage 16.

---

## 2026-08-19 — The database and the photos are backed up together, always

**Decision.** One backup is one folder: a `pg_dump` custom-format archive, a copy
of the photo directory, and a manifest naming the schema they came from. Never
one without the other.

**Reason.** Neither half is a backup of anything on its own. A database restored
without its photos is a set of approved chores whose proof has vanished, and a
folder of photos with no database is a pile of unnamed JPEGs. The photos live on
the filesystem rather than in Postgres precisely so the dump stays small - that
choice was made in Stage 6 with this stage in mind, and it only works if the two
are treated as one thing from here on.

**Consequences.** The manifest is what makes a folder trustworthy: a restore
refuses a folder without one, because that is exactly what a backup interrupted
half way through looks like from the outside. A failed backup deletes its own
folder for the same reason - a truncated dump left on disk is worse than no
folder at all, since a restore would find it and rebuild an incomplete household
from it. The failure row is kept, because "no backup last night" has to be
something the System status screen can say out loud rather than something a
parent infers from an absence.

---

## 2026-08-19 — Fourteen nightly backups, then eight weekly

**Decision.** Owner decision. The fourteen most recent successful backups are
kept outright, then one per ISO week for eight further weeks. Failed rows are
kept indefinitely; they hold no files.

**Reason.** Two different mistakes need catching. One is noticed within days - a
chore approved by accident, a PIN reset on the wrong child - and wants a
fine-grained recent history. The other is noticed a season later, usually when
somebody asks where a month of points went, and wants depth rather than
resolution. Fourteen and eight covers both for roughly fifteen times the size of
the database, which at 11 MB is nothing against 868 GB free.

**Consequences.** Anything older than about four months is gone, deliberately.
The prune runs after each nightly backup rather than on its own schedule, so it
cannot drift from the thing it is pruning. A folder that will not delete is
logged and left; the next prune reconsiders it rather than failing the night
over a locked file.

---

## 2026-08-19 — A second copy goes to a removable drive when it is plugged in

**Decision.** Owner decision. `BACKUP_MIRROR_DIR` names a folder on a USB drive.
When that path exists the finished backup is copied there; when it does not,
nothing happens and the screen says so.

**Reason.** A backup on the same disk as the database survives a mistake and a
corrupt table. It does not survive that disk dying, the laptop being stolen, or
the house it is in burning down. The owner chose a removable drive over syncing
to OneDrive, which keeps the household's data - including photographs taken
inside their home - off anybody else's servers, consistent with the laptop-only
principle the project has held since Stage 1.

**Consequences.** This protects the household exactly as often as somebody
remembers to plug the drive in, which is the honest trade and has to be stated
rather than assumed. So System status reports the drive's absence as a plain
sentence, not a silent omission: a household that believes it has an off-laptop
copy and does not is worse off than one that knows, because the first will never
go looking. The mirror is copied last and its failure never fails the backup -
losing the second copy must not cost the household the first. "Plugged in" is
"that path is a directory" rather than any Windows drive enumeration, which
keeps it testable and works for a network folder just as well.

---

## 2026-08-19 — Restoring is a terminal command, not a button

**Decision.** Owner decision. `npm run restore -- --from <folder>` is the only
way to restore. The System status screen explains where to run it instead of
offering to do it, which changes an approved Stage 2 screen and is recorded here
for that reason.

**Reason.** The same argument that keeps parent accounts on the laptop, and
stronger: restoring replaces every chore, point, reward, photo, and PIN in the
household with an older copy, and there is no undo. No argument, mis-tap, or
child holding an unlocked parent phone should be able to reach that. There is a
second, independent reason - a server cannot sensibly drop and rebuild the
database it is itself connected to - so the CLI refuses to run while the API is
answering on its port, and says why.

**Consequences.** The prompt takes the word RESTORE typed in full rather than
y/n, because the entire purpose of that prompt is that it cannot be got past
without reading it. Photos are replaced wholesale rather than merged: a photo
taken after the backup belongs to a chore row that no longer exists, so keeping
it would leave files nothing points at and a folder no backup describes. The
restore prints that sessions are gone, since a child signed in on a phone is
holding a token from a database that has just been replaced.

---

## 2026-08-19 — The nightly backup rides the existing tick

**Decision.** No new timer. The scheduler that sweeps reminders and drains push
also asks, every tick, whether today's backup has been taken; if it is past 3am
household time and there is none, it takes one. Each stage of the tick is
guarded separately.

**Reason.** It is the same reconciliation shape as everything else here, and it
buys the same property: a laptop restarting at 3am gets its backup at 3:15, and a
laptop that was off all night gets one when it comes back. A cron-style timer
would have to be right about the instant, and the one night it is not is a night
with no backup and nothing saying so.

**Consequences.** A unique index on `chore_date` for scheduled runs makes "one
per day" a database rule rather than a hope, so overlapping ticks and repeated
restarts cannot produce two. Manual backups are deliberately outside that index -
the button exists to be pressed whenever somebody wants, such as before a
restore. The separate guard matters more here than elsewhere: a backup is by far
the slowest thing on the tick, and a household must not lose its evening
reminders because pg_dump had a bad night.

CI installs `postgresql-client-17` because `pg_dump` refuses to talk to a server
newer than itself and the runner ships an older client. Without it the backup
tests would skip and the only place backups are exercised automatically would be
silently doing nothing.

---

## 2026-08-19 — There is no tunnel. Nothing is exposed to the internet.

**Decision.** Owner decision, closing the Cloudflare-versus-Tailscale question
that had been open since the plan was written: neither. The household does not
need the app away from home, so nothing is published. The app is reachable on
the house wifi and nowhere else.

**Reason.** The question was framed as "which tunnel" and the right answer was
"none". Every option on the table traded some exposure for access nobody wanted:
a public URL puts a household app behind a four-digit PIN on the open internet,
and a private mesh puts an app on every phone to solve a problem that does not
exist. Asking what access was actually needed removed the whole category.

**Consequences.** The best consequence is one this project had already written
down and been uneasy about. The Stage 5 note on the hero-select screen said the
lifetime totals it shows before sign-in were acceptable because "the tunnel
hostname is effectively the secret protecting it", and that if the API ever
became reachable from outside the household, it should be revisited first. There
is now no tunnel and no such reachability, so the concern is answered rather than
mitigated - the LAN is the boundary, and a four-digit PIN is being asked to hold
a line that a home network is already holding.

What is still needed is https, because browsers expose neither the camera nor
the Push API in an insecure context, which is why photo capture has only ever
worked on the laptop. That is a certificate problem, not an access problem, and
it is solved separately below.

---

## 2026-08-19 — A publicly trusted certificate for a private address

**Decision.** Owner decision. A domain name, with DNS hosted at Cloudflare, whose
A record points at this laptop's address on the home wifi. The certificate comes
from Let's Encrypt via the DNS-01 challenge and renews itself.

**Reason.** The phones need a certificate they already trust. The alternatives
were worse: running a private certificate authority means installing a root
certificate on every phone, and that certificate can then vouch for *any* website
to that phone - a key on this laptop worth more than the app it exists for. A
mesh VPN means an app on every phone and an account for every child. A public
certificate for a private address costs about ten dollars a year and needs
nothing installed anywhere.

DNS-01 is forced rather than chosen. The ordinary HTTP-01 challenge asks the
authority to fetch a file from the server over the public internet, which cannot
happen here and must not start happening - it would undo the decision above.
Proving ownership through a TXT record keeps the laptop unreachable throughout.

**Consequences.** The domain resolves publicly to a private address, which is
harmless - the address is unroutable from outside - but some consumer routers
refuse to return private addresses from public DNS as rebinding protection, and
have to be told not to. Renewal rides the scheduler tick as a reconciliation: it
asks how much life the certificate has left, not whether a timer fired, so a
laptop that was off for a fortnight renews when it comes back. The Cloudflare
token needs `Zone:DNS:Edit` on the one zone and nothing else; it can create the
challenge record and delete it, and that is all it can ever do.

A renewed certificate is not hot-swapped into the running listener. Swapping
under a live server is fiddly and rare, and a household restarting the app after
a renewal every two months is a much smaller problem than a hot-swap that half
works. The log says so, and System status shows the days remaining.

---

## 2026-08-19 — The backend serves the frontend, and a built app assumes its own origin

**Decision.** Pulled forward from Stage 17 because Stage 16 cannot work without
it. `FRONTEND_DIST` makes the backend serve the built frontend, and a production
bundle now defaults its API base to the empty string - its own origin - rather
than to `http://localhost:4000`.

**Reason.** The same-origin decision was already made and its reasoning has not
changed: a frontend and API on different hostnames make the session cookie
third-party, Safari on iOS blocks those outright, and the kids are the ones on
phones. A login that silently stops sticking would be the worst failure this app
could have. Two hostnames behind one certificate would have reintroduced exactly
that.

**Consequences.** Defaulting rather than requiring an empty environment variable
is the part worth recording, because the obvious approach failed in a way that
was invisible: PowerShell deletes a variable set to an empty string, so
`VITE_API_BASE_URL=''` silently fell through to the localhost default and baked
it into a production bundle. The build now assumes same-origin unless told
otherwise, and development is the exception rather than the rule.

The dev override moved from `frontend/.env.local` to
`frontend/.env.development.local` for the same class of reason. Vite loads
`.env.local` in *every* mode, including production builds, so the file meant to
help on the laptop was pinning the household's real bundle to localhost.

The SPA fallback lives in the not-found handler that `errors.ts` already owns,
because Fastify permits exactly one per instance and registering a second throws
at startup. `/api/` paths keep returning JSON there; anything else gets
index.html, so a saved home-screen shortcut and a hard refresh both land on the
app instead of a 404.

---

## 2026-08-19 — No certificate means plain http, not a refusal to start

**Decision.** The server reads the certificate at startup. If there is none it
serves plain http on the old port and says so in the log. `TLS_DIR` being set
with no certificate present is a warning, not a fatal error.

**Reason.** A household whose certificate expired should lose the camera, not
the app. Chores, points, approvals, and rewards all work perfectly over http on
the home wifi; only photo capture and phone notifications need the secure
context. Refusing to start would turn a degraded feature into a total outage,
and it would do it at the exact moment nobody is watching.

**Consequences.** The failure is quiet by nature, so it is reported in three
places rather than left to be noticed: the log at startup, a certificate row on
System status showing days remaining, and a plain sentence when there is no
certificate at all. The session cookie's `Secure` flag is keyed off `TLS_DIR`
rather than `NODE_ENV`, because the laptop runs in development mode and would
otherwise hand the kids' phones a cookie the browser is free to send in the
clear on the one network they use.

---

## 2026-08-19 — The tests may not touch the household's database

**Decision.** Every suite reads `TEST_DATABASE_URL` or skips. The fallback to
`DATABASE_URL` is gone, and a guard refuses outright if somebody points the two
at the same database without "test" in its name. A regression test greps the
suites for `process.env.DATABASE_URL` and fails if one ever reads it again.

**Reason.** Not hypothetical - this happened, in this stage, and was caught by a
test failing for the wrong reason. Every suite fell back to `DATABASE_URL` when
`TEST_DATABASE_URL` was unset. That was harmless while the laptop was a
development machine and stopped being harmless the moment it became the machine
serving the family. `npm test` then created users, ran approve-all across the
real approval queue, and deleted every row from `backups` - against a household
containing a child's chore photo taken that afternoon.

Nothing was destroyed, and only by luck: the rule that a parent must see a photo
before a chore is approved happened to stop approve-all paying out Kayden's real
submission. The backup log was cleared, which then made the nightly job take
duplicate backups, because the record it checks for had gone.

**Consequences.** The laptop can no longer run the database-backed suites
without a second database, and skips 179 of them. That is the right trade: a
suite that silently stops running is recoverable, and a household whose points
ledger was rewritten by a test is not. CI is unaffected - it sets
`TEST_DATABASE_URL` at a scratch database, which is also why the guard keys on
the database *name* rather than on equality. Migrating a throwaway database
through `DATABASE_URL` and then testing it is exactly what CI does and is
legitimate.

The regression test is worth more than the comment it replaces. A comment saying
"never read DATABASE_URL here" would not have caught this, because nobody added
the fallback deliberately - it was there from Stage 3, correct at the time, and
became wrong when the world around it changed.

---

## 2026-08-19 — `npm run serve` is how the household runs, and it checks before it starts

**Decision.** One command builds everything and starts the compiled server in
production mode, after verifying what it can. `npm run dev` stays the
development pair on separate ports.

**Reason.** `npm run build && node dist/server.js` did the same work and could
not say why it failed. Everything that goes wrong here goes wrong the same way -
a missing file, an unset variable, a frontend built for the wrong base path -
and every one of them surfaces as either a stack trace or, worse, a blank page.
At ten at night, to whoever is trying to get the kids' chores back, "frontend/dist
was built for the GitHub Pages preview, rebuild with npm run build" is worth more
than the entire stack.

Production mode is not tidiness either: it switches logging from pretty-printed
to JSON lines the Windows host can tail to a file, which Stage 18 needs. Setting
it portably is the other reason a launcher exists - `NODE_ENV=production node ...`
is not something cmd.exe understands, and dotenv never overrides a variable that
is already set, so the launcher's value wins over the `development` in
`backend/.env` that `npm run dev` still needs.

**Consequences.** The launcher distinguishes things that stop it from things
that merely reduce it. A missing `SESSION_SECRET` is a refusal; no certificate,
no push keys, and no backup mirror are printed as "starting, with these things
switched off" and then it starts anyway. That split is the same judgement made
in Stage 16 about serving http when the certificate has expired: a household
should lose a feature, not the app.

It also forwards SIGINT to the child, because Windows leaves orphans when the
parent dies - which is exactly how ports 4000 and 5173 ended up held by
processes nobody could find earlier in this project.

---

## 2026-08-19 — Every row on System status reads something real

**Decision.** Backend state, uptime, database, app version, timezone, and the
household's own date all come from `/api/health`. The Stage 2 placeholders are
gone, and the version is read from `package.json` rather than repeated in a
constant.

**Reason.** Four rows were lying. "Online" and "30 seconds ago" were fixed
strings that would have said the same thing with the server on fire; the
database row always claimed to be unconfigured; and the version said "0.1.0
(Stage 2 preview)" four stages after Stage 2. A status screen that reports a
comforting guess is worse than one that has not been written, because it is read
precisely when somebody is trying to work out what is wrong.

**Consequences.** Two copies of a version number are one copy and one lie, so
there is now one - read from `package.json` by walking up from wherever the
module ended up, which works the same under `tsx` and compiled. Uptime is shown
alongside "Online" because the useful question is not whether the server is up,
which is obvious from the screen having rendered, but whether it has been
restarting all evening.

---

## 2026-08-19 — A Scheduled Task at boot, not a service wrapper

**Decision.** Owner decision. Windows starts Chore Quest through a Scheduled
Task registered by `scripts/install-startup.ps1`: at startup, thirty seconds
after boot, running as the owner's account whether or not anybody is logged in.
No NSSM, no third-party service wrapper.

**Reason.** A Scheduled Task is built into Windows, visible in a tool the owner
already has, and needs nothing downloaded. NSSM would give better restart
semantics out of the box, but it is a third-party binary running with high
privilege on the machine holding the family's photographs, and this project has
declined that kind of dependency everywhere else. The restart handling it would
have bought is small enough to write honestly instead - see the supervisor
below.

**Consequences.** Registering it needs one elevated PowerShell, because a task
that runs before login cannot be created by a standard user. The script checks
for that first and says so in full rather than failing on the
`Register-ScheduledTask` line.

It runs as the owner rather than as SYSTEM, deliberately. PostgreSQL is on this
laptop's *user* PATH and not the machine PATH - that is where the EDB installer
leaves it - so a task running as SYSTEM would start perfectly and then fail
every nightly backup with "pg_dump is not recognized", which surfaces only as a
backup that did not happen. The app no longer depends on PATH at all, but
running as the account that owns the files is still the arrangement that matches
what it needs to read and write. `LogonType S4U` means Windows does not have to
store the account password anywhere to do it.

---

## 2026-08-19 — pg_dump is located, not looked up on PATH

**Decision.** `findPgTool` resolves `pg_dump` and `pg_restore` to absolute paths:
`PG_BIN_DIR` if set, then the standard install locations newest-version-first,
then the bare name as a last resort.

**Reason.** The backup code shelled out to `pg_dump` and relied on PATH, which
was true for the account that installed PostgreSQL and false for anything
Windows might start on its own. That failure mode is the worst shape available:
the app starts, serves perfectly, and quietly stops backing up.

**Consequences.** Newest version first, because `pg_dump` refuses a server newer
than itself - when several are installed the latest is the only safe choice, and
this project has already been bitten by exactly that in CI. A `PG_BIN_DIR` that
is set but wrong throws rather than falling through to PATH: a wrong setting
should not look identical to no setting. Falling back to the bare name keeps
every machine where PATH is fine working exactly as before.

---

## 2026-08-19 — The launcher supervises, because Task Scheduler cannot

**Decision.** `scripts/serve.mjs` restarts the server when it exits without
being asked to, backing off 2s, 5s, 15s, 30s, 60s, and gives up after eight
restarts in a row. A server that stayed up five minutes resets the count.

**Reason.** Task Scheduler retries a task that *fails*, and a process exiting
zero is not a failure by its reckoning. Relying on it alone would leave a whole
category of exits unhandled. Twenty lines of supervisor covers all of them, and
covers them the same way on a laptop somebody is watching as on one that
rebooted at 3am.

**Consequences.** Giving up is the part worth stating out loud. A supervisor
that retries forever turns a broken deploy into silence, and silence is the
exact failure this stage exists to prevent - so after eight consecutive
restarts it exits non-zero, which is a failure Task Scheduler *can* see and
which leaves a reason in the log. The five-minute healthy threshold is what
stops a server that has restarted happily once a month for a year from being
treated as a crash loop.

Verified rather than assumed: the running server was killed outright and came
back on its own, with the reason written to the day's log.

---

## 2026-08-19 — One log file a day, kept a fortnight

**Decision.** The launcher writes everything the server prints to
`backend/storage/logs/chore-quest-YYYY-MM-DD.log`, rotating when the date
changes and deleting files older than fourteen days.

**Reason.** A scheduled task's output goes nowhere at all, which would make
production logging JSON that nobody can read. Rotating on the date rather than
only at startup matters because this laptop is meant to stay up for months - a
single file covering a whole season is one nobody opens.

**Consequences.** Fourteen days matches the nightly backup retention, for the
same reason: it is long enough to look into something noticed the same
fortnight. Output still goes to the console as well, because the person standing
at the laptop should not have to open a file to see what just happened.

---

## 2026-08-20 — The laptop dashboard is its own process, on loopback, with a token

**Decision.** `npm run admin` starts a small dependency-free HTTP server on
`127.0.0.1:4100` that can start, stop and restart the household's server, take a
backup and copy it to a removable drive, add a parent, reset a PIN, renew the
certificate, rebuild after an update, and show the recent log. It is not part of
the app and does not import anything the app compiles at runtime.

**Reason.** Servicing the laptop had accumulated a dozen commands across
PowerShell, npm scripts and Task Scheduler, and the owner asked for buttons.

Being a separate process is the load-bearing part. A tool for servicing the
server is wanted precisely when the server is unwell, so anything that made it
depend on the app being healthy would make it useless at the moment it matters.
It reads `backend/.env` itself and shells out to the same commands a person
would.

Loopback plus a per-launch token is the other. The dashboard can create a parent
account and stop the household's app, and it has no login - which is right,
because anybody sitting at this laptop could run every one of these commands
from a terminal already. The token is not defending against the person; it is
defending against their browser. Without it, any page they happened to visit
could POST to `localhost:4100` and quietly grant itself a parent account.

**Consequences.** Restoring a backup is deliberately absent. It replaces every
chore, point and photo with no undo, and the decision that it stays a terminal
command was made for exactly the reasons a button undoes. The dashboard says so
rather than leaving its absence to be wondered about.

Two bugs surfaced while testing it, both from the dashboard running in the
repository root while the server runs in `backend/`. Relative paths in
`backend/.env` are relative to the server's directory, so a backup taken from
the dashboard landed beside the repository instead of in `backend/storage` - and
found no photos, producing a complete-looking backup missing half of what a
backup is for. Both are fixed by resolving `BACKUP_DIR` and `PHOTO_STORAGE_DIR`
against `backend/` before handing them to the app's own loader. Verified by
taking a real backup to a real USB drive and checking the child's chore photo
was inside it.


---

## 2026-08-20 — The dashboard address is permanent; the token moved into the page

**Decision.** `http://127.0.0.1:4100/` is a stable, bookmarkable address. The
per-launch token is still required for every action, but it is delivered inside
the page rather than in the link. The page itself is served without a token, and
only to a request the browser labels `Sec-Fetch-Site: none` or `same-origin`
with `Sec-Fetch-Mode: navigate` and `Sec-Fetch-Dest: document`.

**Reason.** The owner has to service this laptop, and a link that changes every
launch cannot be bookmarked - it meant finding the terminal window and copying a
token out of it before touching any button. That is friction on exactly the tool
that is reached for when something is already wrong.

The token was never the point in itself; keeping other pages out was. Sec-Fetch
headers do that directly. They are set by the browser and cannot be written from
script, so a page on another site that links to, opens, or fetches this address
arrives as `cross-site` and is refused, while a bookmark arrives as `none` and a
reload as `same-origin`. The dangerous requests - the POSTs that add a parent or
stop the server - additionally still need the token, which a cross-origin page
cannot read even if it manages to make the browser load the page.

**Consequences.** A browser too old to send Sec-Fetch headers gets no exemption
and falls back to the token, which is still printed at launch, so nothing is
weakened for it. The loopback-hostname check stays and is what refuses a DNS
rebinding attempt, where an attacker's name resolves to 127.0.0.1 and the
browser would otherwise consider it same-origin.

A tab left open across a restart now holds a stale token. Rather than the old
generic refusal it is told so by name and asked to reload, which mints it a
current one. Verified by probing the running server with each shape of request:
bookmark, cross-site navigation, cross-site `fetch`, no Sec-Fetch headers, stale
token, and a forged `Host` header.


---

## 2026-08-20 — Chores can be changed and stood down from the app

**Decision.** A Chores screen lists every chore definition and opens one for
editing: its name, its points, who does it, and whether it runs daily or on
chosen weekdays. Retiring is on the same sheet. The `Chores` tab now lands here
rather than on the new-chore wizard, which is reached by a button on it.

**Reason.** The backend has had PATCH and DELETE for chore definitions since they
were written; nothing in the app ever called them. `retireChore` sat unused in
the API client. The wizard could only ever create, so a chore assigned to the
wrong child, or a name typed wrong, or one the household stopped doing, could
only be corrected with SQL at the laptop - which is the exact situation the
chore admin routes were built to end.

The owner asked for the database to be cleared so a household could be set up
from scratch. That would have worked once and left the same dead end the second
time somebody changed their mind.

**Consequences.** Retiring stands the definition and its schedules down rather
than deleting them, matching rewards, so a chore already done keeps its name in
the child's history and `chore_instances` keeps pointing at something real.

Because retiring is the closest thing to a delete button in the app, it had to
be reversible: PATCH now accepts `isActive`, and saving a retired chore with
somebody assigned puts it back on the schedule. Without that the button would
have been a one-way door, since the materializer requires both `d.is_active` and
`s.is_active` and nothing else could have set the first one back.

Editing sends the whole schedule set and the server replaces it, so a chore
already on a child's list today is untouched - instances keep the points and the
wording they were created with, per the snapshot decision. The unique index on
`(chore_definition_id, assigned_to, chore_date)` is what stops an edit made
mid-day from adding the same chore to a child twice.

The screen assumes one recurrence pattern per chore, reading the first schedule
and applying the edited pattern to everybody assigned. That is what the wizard
has always produced; a chore with genuinely different days per child could only
have come from hand-written SQL, and editing one here would flatten it.

**Not verified against a database.** The chore-admin suites skip on this laptop:
there is no `TEST_DATABASE_URL`, and the app's Postgres role cannot create the
scratch database to point it at. Typecheck, lint, the 53 tests that run without
a database, and the production build all pass.

---

## 2026-08-20 — A parent can install a waiting update; the phones still cannot be interrupted

**Decision.** The service worker gains a `SKIP_WAITING` message listener, and the
parent System status screen gains an "Install it now" button that posts it. The
Stage 14 rule is otherwise untouched: a new version still installs, waits, and
never activates on its own.

**Reason.** "Takes over when every tab has closed" assumed tabs close. On iOS they
do not. A home-screen app is suspended rather than terminated and a pinned Safari
tab survives for weeks, so the waiting worker waits indefinitely while the old
one keeps serving its own precached `index.html` and its own precached assets.
That stale app is entirely self-consistent, so reloading cannot escape it, and no
fix shipped in the app's own JavaScript can reach it either — the stale worker is
what decides which JavaScript runs. Clearing Website Data by hand was the only
way out, and it signs everybody on that phone back out.

**Consequences.** The guarantee the kids were given is unchanged: nothing on a
child's phone reloads itself, and no child is shown a dialog. The listener is
inert unless something posts to it, and the only thing that does is a button on a
screen children cannot reach. `onNeedRefresh` is now supplied but deliberately
renders nothing — it sets a flag that exactly one screen reads.

The recovery path for a phone already captured is `GET /api/reset`. It is under
`/api/` on purpose: the worker's navigation route denies that prefix, so it is
the one URL on the origin that reaches the network whatever the worker thinks.
The page it returns unregisters every worker and deletes every cache. It is
unauthenticated because it reads nothing, writes nothing, and affects only the
browser that asked — the same thing that browser could already do through its own
settings, in one tap instead of six.

Two things that made this invisible for as long as it was, both now closed. The
SPA fallback answered *any* non-`/api/` path with `index.html`, so a `dist`
missing `sw.js` served the browser HTML with a 200 and a registration that failed
on MIME type alone — it now 404s anything whose last path segment contains a dot,
which is safe here because routing is entirely in the hash and no real route has
an extension. And `serve.mjs` now says so at startup when `frontend/dist/sw.js` is
absent, which is the signature of a build cut short: `vite-plugin-pwa` emits the
worker in a second pass *after* Vite reports the build succeeded.

**Also.** `npm run build:frontend` and a "Rebuild the app" button beside the
existing one in the dashboard. The backend reads `frontend/dist` off disk on
every request, so a frontend change needs no restart at all; stopping the server
to publish a stylesheet only ever bought an outage. Reach for "Rebuild everything
and restart" when backend code changed.

**Verified on the phone it was written for**, an iPhone on Safari, end to end:
`/api/reset` cleared the orphaned worker and reported what it had done, the next
build raised "A new version is ready" on System status, and installing it from
there loaded the new build without closing a tab. So workbox-window does raise
`waiting` for a worker that was already waiting when the page loaded, which was
the one thing only a handset could settle. Typecheck, lint, the 55 backend tests
that run without a database, the 31 frontend tests, and the production build all
pass, and `/api/reset` and the tightened fallback are covered by tests.

---

## 2026-08-20 — The dashboard gets a passcode, and only then a tailnet name

**Decision.** `ADMIN_PASSCODE` in `backend/.env`. Blank, and the laptop dashboard
is exactly what it was: bound to `127.0.0.1`, no login, guarded by the launch
token and `Sec-Fetch-Site`. Set, and two things change at once — every request
needs the passcode, including from this laptop, and a `*.ts.net` host is accepted
so `tailscale serve --bg 4100` can publish it to the tailnet.

**Reason.** Owner wanted the dashboard from a phone. The existing design rests on
one sentence: what has to be kept out is not a person, because whoever is at this
laptop could run these commands from a terminal anyway — it is the browser they
have open. A phone on the sofa breaks that. The dashboard can stop the household
server, add itself a parent account, and reset any child's PIN, and the tailnet
has five devices on it, two of them other people's desktops. Reachable and
unguarded was not a combination worth having, so the two are welded together:
the tailnet name is only accepted when a passcode exists.

**Consequences.** The passcode is required from loopback too, which is more
typing than the old model needed. That is deliberate rather than lazy. Tailscale
Serve forwards to `127.0.0.1`, so from inside the process a request from the
tailnet and a request from this machine are the same connection, and the only
thing distinguishing them is a header a client can write. Exempting loopback
would have been a rule that cannot be verified. It is asked once per browser and
remembered for thirty days.

It is the dashboard's own passcode and not a parent PIN, because this is the tool
for when the household's server is unwell and a login that needs Postgres is a
login that is gone exactly when it is wanted. It reads from `backend/.env`, which
this process already parses by hand for the same reason.

Sessions live in memory, so restarting the dashboard signs every browser out.
That is the answer for a phone that goes missing, and it is cheaper than a
revocation list for a tool that is started by hand.

The socket still binds `127.0.0.1` and nothing else. Tailscale connects to it
from this machine, so nothing new listens on the network, and nothing outside the
tailnet can reach it. The two existing guards are untouched and still both
required: a session without the launch token is refused, and so is the token
without a session.

**Verified by request against a running dashboard.** With no passcode: a bookmark
navigation is served, a cross-site one is refused, a tailnet host is refused.
With one: the page becomes a login form, actions without a session are refused, a
wrong passcode is refused and locks out after five tries, an unknown host is
refused, and after signing in the dashboard and its actions work under both the
loopback and the tailnet name.

---

## 2026-08-20 — Handing over a tested household, and the join date that has to move

**Decision.** `npm run reset-activity`. It clears every chore instance, points
ledger row, photo, reward request and notification, keeps the household itself —
children, PINs, chore definitions, schedules, rewards, Settings — and moves each
child's join date to today. Terminal only, backs up first, takes RESET typed in
full.

**Reason.** Building a household means using it, and afterwards the practice run
is indistinguishable from the real thing. Neither child had signed in once; every
point, streak and photograph in the database was a parent checking that a button
worked. A first week that opens with somebody else's balance is not a first week,
and there was no way to clear it that did not mean writing DELETE statements
against the live household by hand.

**Consequences.** The join date is the part that is not cosmetic, and it is the
reason this is a command rather than nine deletes. `earliestMissingDay`
(`backend/src/chores/materialize.ts:76`) fills forward from the later of a
child's most recent chore and the fourteen-day backfill limit, floored at the day
they were added. Delete every instance and `last` is NULL, so the floor becomes
`created_at` — and children created during testing would wake to every day since,
in Needs attention, as chores nobody did. `materialize.ts` already refuses to do
that to a child added this morning. This makes them one.

Deletes and the join date move in a single transaction, so it is safe with the
server running: anything materialised a moment later starts from today. That is
the difference from restore, which refuses to run at all.

**Noon UTC, not `now()`.** Found by checking rather than by reasoning, and worth
recording because the first version was wrong. The query reads
`(created_at AT TIME ZONE 'UTC')::date`. `now()` at half past nine on an August
evening in Chicago is already the twenty-first in UTC, which puts the floor a day
*ahead* of the household's today, leaves the loop with nothing to walk, and gives
the children no chores until the following morning. Noon on the household's own
date is far enough from both midnights that no offset moves it.

**Photos are found recursively.** They are filed under the day they were taken,
`photos/YYYY/MM/DD/<uuid>.jpg`, so reading only the top of the directory finds
nothing and cheerfully reports nothing to do. The first version did exactly that.
Empty date folders are removed after; the photos directory itself stays, because
the server expects it.

**Not on the laptop dashboard**, for the same reason restore is not: it cannot be
undone and nothing a mis-tap can reach should do it.

**Verified against the live household**, which is unusual here and was the point:
counted 11 rows and one photo, cleared them, confirmed every activity table reads
zero and no photo files remain, confirmed 5 chore definitions, 7 schedules, 1
reward, 4 users and all three Settings values survived, and confirmed by
replaying the materialiser's own floor query that both children now fill exactly
one day — today — rather than nothing or a fortnight.

---

## 2026-08-21 — Everything that was doing less than it looked like it was doing

**Decision.** Before the children were given the app, every screen and control
that appeared to work and did not was finished, and the ones that could not be
finished honestly were removed.

**Reason.** Owner's instruction, and the right order. The household had been
built and tested but neither child had signed in once, so this was the last
moment when fixing something cost nobody anything. A child who taps Leaderboard
on their first evening and reads "Child 1" has learned something about the app
that is hard to unlearn.

**What was wrong, in the order it would have been noticed.**

*Leaderboard* is one of the four primary tabs and read `mock/data.ts`, so both
brothers would have watched two strangers stand on the podium. *Profile* read
`children[0]` for every tile, so whichever one signed in saw the other's name,
level, streak and totals - and its avatar builder had always worked and had
never saved, which is why every child in every household was still wearing the
default. *Achievements* was forty lines of hardcoded array; the tables to hold
the real thing were designed in Stage 3 and no backend code had ever named
either of them.

*Cash out* was the sharpest, and it was made sharp by the owner's own hands the
evening before: the rate, the minimum and the weekly cap were all built, stored
and enforced, the wallet drew the meter and explained the exchange, and there
was no way to ask. Setting the pair in Settings turned a screen that honestly
said "turned off" into a promise with no button.

*Home* rendered one required chore, so a second was invisible on the screen a
child actually opens, and the ring above it counted that one chore's checklist
while calling itself Steps finished today. *Missions* carried a This week
control that printed "The week view is not built yet" on screen, and a Newest
sort chip that sorted nothing because a chore carried no timestamp to sort on.

On the parent side, *points per core chore* was a field that saved and that
nothing read, while the wizard started every chore at a hardcoded ten. A refused
reward arrived as the word no, though the column, the endpoint, the response and
the type all carried a note. And *weekActivity* had been rolled up on every
dashboard load since Stage 11, shipped, and never once destructured.

**Consequences.** Nothing in the app is mock. `mock/data.ts` survives as the
Pages preview's fixture and one type import, which is what it should always have
been.

Achievements are the one genuinely new mechanism, and they are reconciled rather
than counted: the rule lives in `backend/src/achievements/catalogue.ts` and the
table is its projection. That is what makes a badge added next year land with
everybody who already qualifies, and a rule corrected apply to rows written
under the old one. `earned_at` is written once and never cleared, so a streak
badge's meter falls back when a streak breaks while the badge stays - a record
of having done it, not a status somebody can lose. They award no points, because
a badge that paid would quietly double what a chore is worth.

**And one real bug, found on the way.** `restore` refused to run while the
server was up by asking `http://127.0.0.1:${PORT}/api/health` - but the server
binds https on `HTTPS_PORT` whenever a certificate loads, which is every
household that finished Stage 16. The guard had been answering "not running"
while the server served. The only thing between a live database and being
dropped and rebuilt underneath it was a question put to a port nothing was
listening on. It now asks both ports over TCP: a request to the https one fails
certificate verification, because the certificate is for the household's
hostname rather than 127.0.0.1, and Node's fetch has no supported way to waive
that. Asking whether anything holds the port needs none of it, and it also
catches a server too unwell to answer - which is exactly when somebody reaches
for restore.

**Verified.** Lint, typecheck, the 55 backend tests that run without a database
and the 32 frontend tests all pass. The achievement engine was exercised against
the household database directly - earning fires once, meters show partial
progress, a second run reports nothing new, and a badge survives its points
being taken away - and everything it wrote was cleared afterwards. The restore
guard was confirmed to refuse while the server was running. The new endpoints
were confirmed registered and guarded. **Not verified by a child signing in:**
the owner asked to keep the children's side closed until this was finished.
