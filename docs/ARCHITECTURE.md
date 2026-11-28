# CareerOS architecture

Audited 17 November 2026; career-profile backend updated 27 November 2026. This document separates implemented behavior from intended design.

## Current system

```text
server.ts -> load dotenv -> validate environment -> create HTTP server
            -> server-lifecycle.ts -> Prisma $connect -> listen(PORT)
                                                |
HTTP JSON -> app.ts -> route -> controller -> service -> Prisma -> PostgreSQL
```

`app.ts` constructs Express and mounts routers without opening a listening socket. `server.ts` owns startup and waits for the database before accepting connections. This separation lets the automated goal API tests import the app independently and replace database writes in memory.

`createApp(settings)` constructs an isolated app instance; the default export still serves normal startup. `middleware/security.middleware.ts` installs Helmet, exact-origin rejection/CORS and a process-local API rate limiter before JSON parsing and routes. CORS handles approved preflights before the limiter. Settings now include validated NODE_ENV and CORS_ORIGINS. Tests can construct separate app instances with explicit policies without editing private environment values. Normal request flow is headers -> origin policy/CORS -> API rate limit -> JSON parser -> routes -> JSON 404/error handlers. Trust proxy remains false until hosting topology is known.

`config/env.ts` validates DATABASE_URL syntax and PORT (default 3000) with Zod, reporting field names only. Server entry dynamically imports app/Prisma after validation. The shared Prisma configuration also reads validated settings. `server-lifecycle.ts` contains testable connect/listen/stop operations. Startup connection/listen failure attempts a database disconnect and is logged by entry with a fixed safe message.

After startup, SIGINT/SIGTERM handlers request shutdown once. HTTP stops accepting new connections, existing requests drain, then Prisma disconnects. A 10-second deadline bounds normal shutdown including database cleanup; on timeout remaining HTTP connections are closed and entry exits unsuccessfully. Cleanup failure also produces a nonzero exit. Signal delivery varies by OS; tests exercise handler wiring through emitted events and lifecycle behavior through real local HTTP servers with fake database methods. No Supabase connection was used for this lifecycle change.

- Routes select handlers by HTTP method and URL.
- Controllers select request fields and form HTTP responses.
- Services contain application operations. Goal, user and auth services persist through Prisma.
- `config/prisma.ts` exports one Prisma client with `PrismaPg` and `DATABASE_URL`.
- `schema.prisma` describes Goal, User, AuthSession, RefreshToken and CareerProfile. SQL migrations describe database changes over time.
- The generated Prisma client supplies database types and query methods; it is ignored and must be generated locally.

The goal path is `POST /api/goals -> authentication -> createGoalController -> Zod schema validation -> createGoal -> prisma.goal.create -> PostgreSQL`. Invalid input stops at the controller with a 400. The schema trims required strings and selects only supported fields. A JSON 404 handler follows routes; final error middleware follows that. Async failures reach the shared handler through Express 5, returning a generic 500 and fixed safe log event. Profile requires authentication and selects the signed-in user’s public fields. Registration follows schema validation -> user service -> asynchronous bcrypt hash -> Prisma create with public-field selection; the controller serializes public fields again. A deliberate ApiError maps the known email uniqueness violation to 409 without exposing adapter diagnostics. The React frontend now connects authentication and career profiles; no AI layer exists.

## Configuration and boundaries

The backend is an ESM Node/TypeScript package. Source imports use `.js` paths for compiled execution. Development uses tsx, compilation uses tsc, production start expects `dist/server.js`. Strict TypeScript checks do not validate incoming JSON at runtime. The compiler now explicitly includes `src/**/*.ts`, leaving the root Prisma CLI config outside the application build. Optional goal fields are omitted when absent, satisfying strict optional-property typing. No-emit checking and compilation pass as of 22 November 2026; this does not establish successful database startup.

Prisma CLI uses `prisma7.config.ts`; package scripts select this filename explicitly. Runtime and CLI both use `DATABASE_URL`. Schema validation, read-only live connectivity and migration status passed on 22 November 2026 after earlier audit failures. The initial migration is recorded as finished remotely; Goal column metadata agrees with the model. Compiled startup and GET / were verified. These checks do not establish every constraint, policy or backup state. Prisma CLI/client/adapter are pinned exactly to 7.10.0.

## Planned architecture

M2 database foundations are active as of 23 November 2026. Migration `20261123140042_add_auth_sessions_and_goal_owner` was restore-rehearsed on native PostgreSQL 17 and applied through Prisma after freshness/permission/drift checks. User -> AuthSession -> RefreshToken tables and nullable indexed Goal.userId now exist; the runtime client was regenerated and read-only smoke checked. Credential/session tables have RLS enabled without public policies, preventing ordinary non-owner API roles from accessing rows despite possible default grants; the owning backend database role can manage them. Row ownership checks in backend services remain necessary because the owner bypasses RLS. No accounts/sessions were created and no goals were reassigned. The historical proposal is no longer a deployment source. Auth endpoints/session logic and owned goal creation/list/detail are implemented; verified legacy backfill and required ownership are complete. Migration 20261124120000_protect_goal_data_api enables Goal RLS without public policies so ordinary Data API roles cannot bypass backend ownership. It preserves existing rows and ownership; the owner/backend role still bypasses RLS and must filter every query.

Keep the existing Node, Express 5, PostgreSQL/Supabase and Prisma 7 stack. Use incremental layers:

```text
React/TypeScript/Vite UI
  -> API client and bounded server-state fetching
  -> Express security/request middleware
  -> authentication + request validation + ownership checks
  -> controller -> domain service -> Prisma -> PostgreSQL
                               -> AI provider abstraction (when required)
                               -> private document storage (when required)
```

Zod validates goal/signup inputs and bcrypt hashes registration passwords at cost 12. A separate signup limiter precedes parsing/hashing. JWT/session flow and the first connected React screens are implemented. Registration creates no session. Goal.userId is now required after verified account linkage/backfill and a restore-rehearsed NOT NULL migration. Never assign old records to the first signup. Unit/API tests replace persistence; the separately gated local PostgreSQL integration test verifies actual Prisma writes and duplicate races without touching Supabase.

Add relational models only as their feature is implemented. User/Profile anchor skills, projects, goals and later roadmaps/applications. Multi-record writes should use transactions. Index ownership and proven query patterns; paginate lists. Document cascade/delete behavior before migrations.

## Security and AI design constraints

Hash passwords, return explicit public user fields, protect routes, and scope each resource lookup/mutation to its owner. Session routes use jose-signed access JWTs, hashed opaque refresh tokens, transactional rotation/replay revocation, HttpOnly cookies and csrf-csrf session-bound double-submit protection. Every protected request also checks the active database session. Log sanitized operational context instead of raw bodies/secrets.

Keep AI provider calls behind a service interface with prompt templates, validated structured outputs, timeouts, controlled retries, per-user limits and cost awareness. Retrieve only the authenticated user's relevant data. Model output must never directly execute database commands. Use deterministic, documented calculations for scores; distinguish suggested resources from verified resources. Uploaded resumes require private ownership-scoped storage, upload constraints and safe extraction.

## Implemented goal ownership

All /api/goals requests pass the shared JWT/session authentication middleware. Creation derives userId from res.locals.auth, never the body. List/detail queries include that userId; detail combines id + userId in one query and returns the same 404 for another owner, NULL ownership or absence. Lists use id-ordered keyset pagination with bounded take. The nullable migration stage is finished: verified legacy records are linked and the database rejects NULL owners. No backfill/reassignment occurs through normal routes. New Goal RLS denies ordinary direct Data API roles, even if table grants exist. Native two-user/API and direct-role tests complement embedded migration refusal/preservation tests.

## Implemented session request flow

```text
GET /api/auth/csrf -> anonymous binding + signed CSRF cookies + CSRF response token
POST /api/auth/login + CSRF -> bcrypt comparison -> session + hashed refresh record
                           -> access JWT JSON + HttpOnly refresh cookie + new bound CSRF
GET /api/users/profile + Bearer JWT -> signature/claims -> active session -> public user
POST /api/auth/refresh + cookies/CSRF -> row-locked rotation -> replacement cookie/JWT
POST /api/auth/logout + cookies/CSRF -> revoke session -> clear cookies
```

`routes/auth.routes.ts` owns cookies/CSRF and HTTP contracts. `services/auth.service.ts` owns credential checks and database session operations. `utils/auth-tokens.ts` owns strict jose JWT signing/verification and refresh generation/hashing. `middleware/authentication.middleware.ts` verifies bearer authentication before protected controllers. Refresh replay returns a failure after committing revocation; throwing inside that transaction would roll revocation back. Concurrent refreshes are intentionally treated as reuse, so the frontend must coordinate a single refresh at a time across tabs. Session expiry is absolute and every protected request checks revocation in PostgreSQL. Login/session verification uses fictional local databases, never Supabase user records.

## Password-change transaction and login race

POST /api/auth/change-password requires Bearer/session authentication plus matching cookie binding/CSRF. Current password verification and new bcrypt hashing run before taking the User row lock. Inside the transaction, the service rechecks the stored hash and calling session, updates the hash and revokes all unrevoked sessions for that user. Any failure rolls back both changes. Cookies clear only on successful commit. Every subsequent protected request rechecks its database session; other accounts retain their sessions.

Login also locks this User row and rechecks its originally verified hash before nested session creation. If password change wins, the old hash no longer matches and that login cannot create a late active session. If login wins, its session is included in the subsequent revocation. Refresh locks the session row, and a completed password change still revokes any refresh result. This preserves the existing in-flight-request limitation while preventing a lasting old-password session.

## Career-profile read and partial-save flow

GET/PATCH /api/users/career-profile -> shared Bearer/session authentication -> career-profile controller -> Zod partial-field validation -> service with session-derived userId -> Prisma CareerProfile -> PostgreSQL. Existing account identity responses stay separate. Profile reads use findUnique on the owner key and do not create rows. Saves use a scalar upsert with an explicit field allowlist, omitting undefined fields while preserving explicit null. The native concurrency test verifies one row and both disjoint updates survive simultaneous first saves. Same-field concurrent writes are last-write-wins.

User has zero or one CareerProfile; userId is the profile primary key and restrictive foreign key. Migration 20261127120000_add_career_profile adds this empty table without modifying existing rows and enables RLS without public policies. Backend queries always supply authenticated owner IDs because the table owner bypasses RLS. Profiles have bounded text/numeric/interests fields; completion is derived from five documented core fields rather than stored as a mutable score. Optional interests/bio do not affect that checklist. The frontend career-profile form is implemented; dashboard work remains pending.

## Implemented React client

The frontend is a separate Vite/React/TypeScript package with its own lockfile. React Router protects the profile route; Tailwind/custom CSS supplies the responsive shell. React state holds unsaved input; TanStack Query loads/caches server profile data under the user ID and clears protected cache on sign-out/account invalidation. No backend package, database connection or signing secret is bundled.

The development /api proxy keeps browser requests on localhost:5173 while forwarding to Express; Origin remains intact. Cookie auth requests use credentials:include and fresh CSRF headers. Protected resource requests use credentials:omit and an in-memory Bearer token. Startup restoration and refresh are single-flight per tab, and Web Locks serialize auth operations across tabs. BroadcastChannel sends metadata-only invalidation messages; unsupported Web Locks disable automatic renewal. Each refreshed token is checked through the protected identity API before any old request can be replayed. Generation checks and user-ID matching prevent stale account data crossing a session switch. Ambiguous renewal failures require sign-in, with no automatic retry.

The form submits only changed fields, converts explicit clears to null/[] and replaces its baseline only after a successful save/reload. It protects unsaved changes on manual reload/logout/unload and retains edits after failed saves. The saved checklist stays server-derived. Drafts are not persisted across session changes. Registration leads to explicit sign-in; failed sign-out retains local state rather than claiming revocation succeeded.

A test-only backend entry point refuses non-loopback/nonempty/non-careeros_test_browser_ databases, seeds fictional credentials and exposes a fixture marker absent from production. Playwright requires a matching marker before browser writes. Real-browser tests cover persistence, mobile errors/navigation, registration, renewal and multi-tab behavior without Supabase mutation. See frontend/README.md for commands and current limitations.

## Engineering tradeoffs

Continue with the small route/controller/service structure; there is no evidence that microservices or a repository abstraction are needed now. Add shared state management only when the UI needs it. Keep tests and security work alongside each feature rather than postponing all verification to the final phases. Deployment readiness requires successful builds, database verification, environment validation, graceful shutdown, monitoring, backups and safe migration procedures.

## Dashboard flow

React DashboardPage -> memory-token authenticated GET /api/users/dashboard -> authenticated user controller -> dashboard service -> four Prisma reads in one repeatable-read snapshot -> owned profile, aggregate counts and latest five goals. No migration or new dependency is required. The service selects public summary fields and scopes every query to the session user.

Dashboard query keys include the account ID, old account caches are cleared on identity changes, and successful profile saves invalidate the dashboard. React Router uses a data router so the profile can block navigation while edits are unsaved; one confirmation handles each blocked transition, including development effect replay. Save-in-progress navigation is disabled. Loading, empty, retry and stale-refresh states are explicit. Dates use UTC calendar days; statistics describe stored records rather than inferred readiness or AI progress.

## Goals frontend increment

The protected `/goals` screen reads existing owner-scoped GET /api/goals pages of 20 records in ascending ID order. Load more passes nextCursor as afterId; it is not an offset or a total count. `/goals/new` creates a goal through the existing POST endpoint, requiring title/category and allowing description/date. `/goals/:goalId` reads existing GET detail; invalid or inaccessible IDs show an unavailable state. Dashboard recent-goal titles link to details, and View all goals opens the list.

Goal list/detail caches include the account ID and clear on account changes. Confirmed creation invalidates goal lists and dashboard totals before navigating to details. Drafts stay in React memory, with leave/unload confirmation and save-in-progress navigation protection. A network/server failure can leave the create outcome unknown: the UI preserves input, disables another submission and directs the user to inspect saved goals. No automatic POST retry or idempotency guarantee is introduced. No new API, dependency, migration, editing/completion/deletion or production database mutation is part of this frontend increment.

## Goal mutation flow

GoalActions on the detail screen owns edit drafts and explicit completion/delete actions. It sends changed fields only; clearing optional input sends null. Confirmed mutations update/remove the owned detail cache and invalidate goal-list/dashboard queries. The UI waits for confirmation from the API before claiming success, disables competing actions while busy, protects draft navigation and retains drafts after failures. Unknown outcomes require reloading saved details before another mutation. Deletion uses an explicit permanent-action confirmation.

Backend PATCH/DELETE share existing authentication middleware and validate IDs. Strict partial PATCH validation rejects ownership/identifier fields. Prisma mutation predicates include both id and userId, enforcing ownership in a single database operation. No new table or migration is involved. Creation remains separate from editing; completion sets a stored status rather than adding a second goal. Hard deletion changes dashboard totals because the row is physically removed.

Goal discovery: the list query schema validates search/status/sort, and the service combines all filters with the session owner before pagination. Literal substring matches use Prisma parameterized case-insensitive contains filters; SQL wildcard characters are escaped. Existing numeric cursors support both ID directions without an additional schema or opaque-token format. The frontend includes applied search/status/sort in its account-scoped query key, cancels abandoned reads using signals and removes an inactive destination cache before switching criteria so pagination always restarts at page one. Search submits explicitly; status/sort apply immediately. Empty filtered results are distinct from an empty account. Criteria are in component memory and reset when the list remounts; no personal search is persisted in browser storage.

## Priority and subtask database foundation

Goal now has priority VARCHAR(6), required with default MEDIUM and a database check accepting LOW/MEDIUM/HIGH. The additive migration preserves all previous goal columns and values. New goals created by the current API also receive MEDIUM by default. The API/control increment below now validates priority; goal PATCH still rejects unrecognised fields.

Subtask is a child of Goal: id, goalId, bounded nonblank title (200 characters), isCompleted default false and creation/update timestamps. The foreign key cascades parent goal deletion; (goalId,id) supports future bounded lists. Ownership is derived from the parent rather than duplicated in a second userId column. Future subtask APIs must scope every query through Goal.userId using the authenticated session. The API/control increment below now connects subtasks; no automatic goal completion policy is implemented.

The table enables RLS with no direct-client policies, matching existing backend-owned private data. Database checks/FKs add safeguards independently of application validation. Prisma Client is regenerated after deployment; existing goal queries can return priority while the current frontend ignores the extra field. The delete confirmation explicitly mentions subtasks. No dependency change is needed.

Deployment used a fresh private public-schema/data archive, a native PostgreSQL restore, exact-SQL rehearsal, all-existing-table fingerprints and live pre/post checks. The archive excludes platform schemas/services and privileges/roles, so it is not a full Supabase project backup. Migration history/checksum and supported Prisma model drift were checked after apply. Backup archives, receipts, restore data and diagnostics remain ignored and local.

## Execution controls and shared drafts

Goal priority now flows through existing validated POST/PATCH services and the create/edit forms. SubtasksPanel fetches account/goal-scoped cursor pages and displays whole-goal counts. Confirmed mutations invalidate those pages; checkbox state and counts follow server confirmation. Failed network/server mutations preserve drafts and block more writes until a successful saved-data reload. Parent actions are disabled while a subtask draft/write is active, preventing a goal edit/delete from silently unmounting a child draft. Completed goals can still manage checklist items; no automatic parent completion is introduced.

Subtask service creation locks an owned Goal row inside a transaction before checking the 100-record cap and inserting. Concurrent additions cannot both claim the final slot. Lists check the parent and use scoped counts/rows in one repeatable-read transaction. Updates/deletes combine child ID, parent ID and Goal.userId in the SQL predicate. DTOs explicitly select safe child fields. No caller-supplied ownership is accepted.

Multiple forms register their dirty/saving state under stable IDs. App maintains one route blocker and unload guard across the registry, plus the profile form state. A live registry ref makes successful save-then-navigation observe the cleared draft immediately, before React's next state render. Auth loss bypasses draft blocking and clears protected screens. Identity changes clear subtask caches as well as goal/profile/dashboard caches. This prevents one mounted form from clearing another's warning and avoids multiple router blockers. Lists/requests still use abort signals and account-specific query keys.

## Skills storage foundation

Skill is a maintained shared catalog with unique lowercase slug, bounded name/category and timestamps. Eight starter labels cover JavaScript, TypeScript, Python, Java, React, Node.js, PostgreSQL and Git; they are a small taxonomy, not an exhaustive list, role requirement set or recommendation to learn all eight.

UserSkill links userId and skillId using a composite primary key, so one account cannot store duplicate entries for a catalog skill. Each link holds a self-reported BEGINNER/INTERMEDIATE/ADVANCED level, optional private notes (1,000 characters), and timestamps. Both foreign keys restrict deletion; a used catalog entry cannot be removed accidentally. Removing a personal link must leave the shared catalog intact. No account is assigned skills automatically.

Both new tables enable RLS with no direct-client policies. Backend catalog reads are authenticated, and all personal-skill queries/writes derive userId from the session and select safe fields. Catalog administration is separate from ordinary personal-skill edits. The original foundation added storage and starter catalog; owned Skills APIs/screens and project evidence are now connected in the increments below. Role-gap calculations remain later work. There is no verified proficiency or readiness score.

Deployment follows the existing fresh public-schema/data backup, native restore and exact-SQL rehearsal routine, now fingerprinting Subtask along with User, Goal, CareerProfile, AuthSession and RefreshToken. The backup excludes platform schemas/services/roles/privileges and is not a full Supabase project backup. New tables and catalog seeds are additive; existing application records are unchanged. Private archive/receipt/helper/learning files remain ignored.

## Skills API and screen integration

The skill router authenticates, validates bounded strict query/body schemas and calls the skill service. Catalog reads select only canonical public metadata. Personal reads/mutations derive userId solely from the live session, scope by composite account/skill key and return an explicit safe nested catalog projection. Duplicate-create/FK failures map to safe409/404; there is no upsert that could overwrite existing private notes. No catalog writer is available to ordinary users. Skills use the existing storage migration.

SkillsPage has independent account-scoped catalog-search and personal-list query keys, each with20-item cursor pages. It registers the combined add/edit dirty/busy state in the shared form guard. Confirmed mutations invalidate personal-list data; network/server ambiguity preserves drafts and blocks another write until a successful saved read. Removal names the skill, warns about loss of private notes and confirms the shared catalog remains. Editing occurs in a persistent separate form so a reloaded missing row does not hide its draft/cancel control. Account changes clear both query families and unmount drafts. No browser storage is used for private notes. The UI states that levels are personal assessments and displays loaded counts, never readiness percentages.

## Owned projects and skill evidence

`Project` belongs to one User. `ProjectSkill` joins that project to a shared Skill and stores an optional explanation of the user's contribution. Its composite primary key prevents duplicate skill links; deleting a project cascades only its evidence links. It deliberately does not reference UserSkill, so changing/removing a self-assessment preserves the record of past work. Both new tables enable RLS with no ordinary direct-access policies, following the existing server-only access model.

The authenticated project router validates strict DTOs; the service applies owner predicates and safe selects. Nested create/replacement is atomic. Partial updates lock the owned parent row, merge dates and replace evidence within one transaction, preventing concurrent date edits from creating an invalid range. Database checks provide a second layer for title/status/date ordering and URL scheme; full URL parsing occurs at the API boundary.

`ProjectsPage` uses account-keyed list/detail/catalog queries, bounded cursor loading and a single draft editor. Internal selection and route changes protect unsaved input. Successful writes refresh saved queries; uncertain outcomes retain input and require reload before more writes. A missing selected project during recovery clears selection without discarding its edit draft. External links open separately with `noopener noreferrer`; the server never requests user URLs. Evidence descriptions remain plain text and are not treated as verified claims. Account transitions clear these caches.

## Certifications and experience records

Certification and Experience each belong to one User, with separate CertificationSkill/ExperienceSkill join tables pointing to the shared Skill catalog. Composite parent/skill keys prevent duplicate links; parent deletion cascades only its links. Personal UserSkill assessment removal cannot erase record history. The four additive tables enable RLS with no direct-client policies. Fresh public-schema backup/native restore/exact migration rehearsal and ten-existing-table preservation checks preceded deployment.

Authenticated routers use strict record schemas and safe owner-scoped service selects. Nested create and skill replacement are atomic. Updates lock an owned parent row and validate merged calendar dates, plus the experience current/end-date rule, before writing. Calendar comparisons use formatted date strings, independently of time zones. Database checks enforce required text, date order, work types/current state, credential URL scheme and relation consistency. Full URL parsing occurs at the API boundary; no credential link is fetched by the server.

CareerRecordsPage shares record-form mechanics across two separate protected screens. Account/kind query keys isolate list/detail caches; identity transitions clear them. Controls preserve drafts, send changed fields, safely open credential links and confirm permanent deletion. Unknown writes pause new mutations until a saved reload; an already-deleted selected record resolves without trapping the user. Skill choices paginate and link explanations remain plain text. Record selection resets on page reload. The expanded sidebar scrolls on shorter viewports. No claims of independently verified credentials, employment or proficiency are made.

## Private custom skill choices

Skill now has nullable ownerId (null for maintained shared labels) and a required normalized nameKey. Existing eight skill identities, names, timestamps and links were preserved; 69 additional shared labels were seeded. The owner/nameKey unique index prevents per-account duplicates; a partial unique index handles shared-name uniqueness where the owner is null. Existing RLS/no-direct-policies remains in force. Custom owner/name/category are immutable through ordinary APIs; no administration/publication path is exposed.

Catalog reads combine shared-or-current-owner visibility with search and cursor predicates. The custom endpoint normalizes Unicode/spacing and reuses shared or owned names; an atomic upsert resolves concurrent same-name requests without overwriting. All three evidence services now validate requested skill visibility inside their transactions, and personal-skill creation checks visibility before writing. Guessing a foreign ID cannot attach a private skill to a record. Related metadata selects remain safe.

CustomSkillCreator is used by Skills, Projects and the certification/experience form. Every picker includes a custom action; standalone buttons also work when a search has no results. Project/record forms now have catalog search as well as pagination. A created choice is immediately available/selected even outside the currently loaded page; it is linked only when the user saves the surrounding form. Custom input participates in route/unload and internal-draft protection. Retrying custom creation reuses an existing identity; it does not duplicate assessments or overwrite evidence. Account-keyed caches are invalidated after choice creation.

## Project–goal relationships

ProjectGoal is a many-to-many join with a `(projectId,goalId)` primary key, userId and createdAt. Composite foreign keys reference each parent's unique `(id,userId)` key. This prevents linking two differently owned records even through direct SQL. A goal-first index supports reverse pagination; deleting either parent cascades its connections without deleting the other parent. RLS is enabled without direct-client policies. No links were assigned during migration.

Authenticated link controllers validate strict bodies/IDs/bounded cursors. The service selects safe linked summaries; repeatable-read list transactions check the owned parent and read its links consistently. Creation locks the owned project, checks duplicate/cap and locks the owned goal before inserting. A serialized 100-goal cap bounds additions, and the database key handles duplicate safety. Unlink uses one owner/project/goal predicate. Parent statuses and existing evidence are never updated by link operations.

ProjectGoalLinks supplies search/paged goal selection, saved links, confirmation-protected unlink and unknown-outcome reload recovery on project details. Its dirty/busy state protects routing and blocks parent editing/deletion/switching until resolved. GoalProjects is a read-only reverse panel; links open `/projects?projectId=...` with owned detail lookup. Account transitions clear link/choice caches, and mutations invalidate both directions. Completion remains an explicit independent action. Parent deletion confirmations mention connection cleanup.
