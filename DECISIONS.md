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
