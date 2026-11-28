# CareerOS ordered development roadmap

Updated 27 November 2026. Baseline: repository audit dated 17 November 2026. The owner has authorized continuing development in small, explained, verified steps and making Git checkpoints at stable milestones. Each milestone below is split into manageable tasks; completing the entire long-term backlog is not required for the first release.

## Release goal and scope

CareerOS helps CSE students turn a target role into a practical weekly plan, supported by their skills and project evidence.

Core workflow: target role -> current skills and projects -> explained gaps -> goals and roadmap -> reviewed weekly plan -> progress.

Keep Node/Express/TypeScript, PostgreSQL/Supabase and Prisma. Build the UI with React/TypeScript/Vite, Tailwind and React Router; introduce TanStack Query for API server state. Add Zod and secure authentication as needed. Use one AI provider behind a small interface initially. Avoid introducing microservices, queues, vector databases or autonomous agents without a concrete requirement.

## Delivery milestones (active order)

| Milestone | Scope and acceptance | Git checkpoint when verified |
| --- | --- | --- |
| M0. Foundation — verified | Compiler boundary/build, read-only database connectivity, migration status, compiled startup, safe setup and exact Prisma pins verified on 22 November 2026. Existing data preserved. | `6720344` build repair; foundation setup checkpoint follows |
| M1. API safety — verified | Validated goals, safe errors/JSON 404 and placeholders, checked startup settings/shutdown, Helmet, exact origin policy, bounded API requests and tests verified on 22 November 2026. Authentication is still pending. | Stable step checkpoints; HTTP safeguard checkpoint completes scoped M1 |
| M2. Identity and ownership — verified | Real registration/login/logout, password hashing, session strategy, protected routes, explicit public user fields; reviewed non-destructive migration for existing goals; cross-user denial tests. | `feat: add authentication and resource ownership` |
| M3. First usable application | React shell, auth screens, accessible reusable UI, career profile APIs/forms; persisted data survives reload; deployment preview with appropriate access limits. | `feat: connect career profile frontend and backend` |
| M4. Career evidence and execution | Owned skills/projects and full goal CRUD; subtasks, deadlines, priorities, bounded lists, project-skill links; working UI and ownership tests. Add certifications/experience only to the depth needed for this release. | `feat: connect skills projects and goal tracking` |
| M5. Explainable role planning | Start with one maintained target-role template; label requirement sources and self-reported proficiency; show missing requirements/evidence; save milestones and roadmap progress; test deterministic calculations. | `feat: add explainable role gap planning` |
| M6. Focused AI planning | Propose a weekly plan using gaps, goals and available hours; schema and reference validation, time-budget checks, user review before saving, limits/timeouts, fictional evaluation profiles and measured latency/cost. | `feat: add validated AI weekly planning` |
| M7. First release | Real dashboard, critical end-to-end flows, accessibility/mobile checks, CI build/tests, safe deployment/monitoring/backup procedure, demo and setup docs. Invite a small willing classmate group, record feedback, fix observed problems. | `feat: release CareerOS career planning workflow` |
| M8. Application extension | Manual application tracker first; then limited private resume upload/extraction and job-description alignment with explained matches, gaps and user-reviewed edits. | Separate tracker and resume checkpoints |
| M9. Evidence and portfolio | Repeatable demo, measured results, feedback-driven improvements, screenshots, architecture decisions, truthful resume bullets and interview practice. | `docs: prepare CareerOS portfolio demonstration` |

M7 is the definition of a completed first product. M8-M9 extend its placement/portfolio usefulness. Deployment, tests and security start earlier and are strengthened at M7, rather than left until the end. Dates depend on the owner's availability and verified progress; no fixed completion date is promised.

## Deferred long-term backlog

Keep the original feature vision below as a reference, not an instruction to implement everything before release. Defer broad career chat, mock interviews, job-feed integrations, extensive resume versioning, email reminders and advanced analytics until the core workflow works and users need them. Voice interviews, automatic applications and large resource catalogs are outside the first release. A general career-readiness score is replaced initially with explained requirement coverage/checklists; resume alignment must not claim to reproduce an employer's ATS score.

## Working and checkpoint routine

For each small task: explain the user benefit -> show affected layers and files -> implement -> run appropriate checks -> review the diff and secret exposure -> explain results and remaining limits. At major features, add concept/project notes, architecture flow, important decisions, interview Q&A, common mistakes and a small challenge. If owner-run verification is required, wait for results before advancing the major milestone.

Commit only intended files with a meaningful message after checks appropriate to that change. Keep docs-only baseline work separate from implementation. Do not commit secrets, dependencies, generated output or private data; preserve the lockfile. A passing build checkpoint does not mean M0 is complete if database/startup checks remain unresolved. On 22 November 2026 the owner authorized pushing verified checkpoints to the existing GitHub remote. Use normal pushes, never force-push shared history. Website publication is a separate action.

## Original phase breakdown (reference detail)

## Immediate milestone: restore a verifiable foundation

- [x] Inspect all application source, schema, migration, configuration, README, ignores and lockfile metadata.
- [x] Record actual architecture, API contracts, risks and missing product areas.
- [x] Validate Prisma schema and probe non-persistent HTTP behavior.
- [x] Fix TypeScript include boundary and optional Prisma input typing; verify no-emit checking and production compilation (22 November 2026).
- [x] Verify compiled server startup; compilation alone does not verify database connectivity.
- [x] Recheck database using sanitized read-only diagnostics: connectivity and migration status pass. Earlier failure did not recur; its historical cause remains unknown.
- [x] Verify normal startup connects before listening and root returns expected data.
- [x] Add a safe `.env.example`, explicit custom Prisma config commands and accurate Windows setup instructions.
- [x] Pin Prisma CLI/client/adapter to their existing 7.10.0 resolution; dependency tree unchanged.

Acceptance: clean compilation, working documented startup, valid schema, known migration state and no database data/schema changes made to repair ordinary configuration issues. Pause if database access remains unavailable; record the actual blocker rather than claiming success.

### M0 step 1 evidence (22 November 2026)

`tsc.cmd --noEmit` and `npm.cmd run build` pass. Prisma schema validation passes with `--config prisma7.config.ts`. A one-off service check stubbed `prisma.goal.create` and verified omitted optional fields, supplied description/date, empty description preservation and returned result. No database writes or dependency changes occurred. Database connectivity/migration status, normal startup and setup cleanup remained pending at that checkpoint.

### M0 completion evidence (22 November 2026)

Read-only `SELECT 1` passed. Migration history shows `20260915165713_init` finished and not rolled back. Live Goal column names/types/nullability match the checked-in model. Prisma `migrate status --config prisma7.config.ts` reports one migration and an up-to-date database. A temporary compiled server connected before listening and GET / returned 200 with project CareerOS; only the verification-started process was stopped. No application rows were read or written and no migration was applied. Migration status/column checks are not a complete schema-drift, policy or backup audit.

New generate/validate/typecheck/build scripts pass; the status script points to the same verified read-only command. Manifest and lockfile root declarations agree on exact Prisma 7.10.0 pins; all resolved lockfile package records are unchanged. `.env.example` contains placeholders only; real `.env` was untouched. Generated output remains ignored. M0 is verified; the next small task is M1 input validation and API error conventions, taught before implementation.

## Phase 1: backend/API standards

- [x] Document safe message-based errors and JSON 404; preserve existing success contracts.
- [x] Add Zod validation for goal creation and safe JSON parser/oversized-body errors.
- [x] Route unexpected goal failures through shared middleware with a fixed safe log event; richer operational diagnostics remain in the startup/logging task.
- [x] Stop logging/echoing registration payloads; return explicit 501 until real registration is implemented.
- [x] Validate environment configuration, allow deployment port, add safe startup/shutdown logs and bounded graceful shutdown.
- [x] Add Helmet security headers, per-IP API request limit and configurable exact frontend-origin policy; deployment origin values will be set when known.
- [x] Add test infrastructure and goal API validation/parser-error tests; document current contracts in API.md.

M1 step 1: typecheck and build pass; 22 API subtests plus their parent pass (Node reports 23 tests). Tests verify invalid requests do not call the persistence test double and valid requests preserve the 201 contract. No Supabase access or schema changes. Zod 4.6.7 is the only added package; existing resolved versions/integrities are unchanged, while npm recalculated development flags for optional TypeScript platform packages. M1 remains in progress; registration-body exposure and other unchecked items are not solved yet.

M1 step 2: typecheck and build pass; 27 API cases plus two parent tests pass (Node reports 29 tests). New cases verify registration does not log/echo synthetic credentials, unknown routes/methods return safe JSON, existing root/demo profile responses remain available, and simulated async persistence failure returns/logs no private details. No Supabase access, migration or dependency change. Remaining M1 tasks: environment validation, deployment port, startup logs/shutdown, headers, request limits and origin policy.

M1 step 3: Zod validates DATABASE_URL syntax and PORT, defaulting the port to 3000. Server entry checks settings before loading Prisma; lifecycle logic connects before listening and safely disconnects after draining HTTP requests. Repeated shutdown requests share one cleanup operation. A 10-second deadline handles stuck HTTP/database cleanup; raw startup failures are not logged. Typecheck/build and 43 reported tests pass, including settings, occupied-port failure, active-request draining, timeout/error cases and entry-point SIGINT/SIGTERM event wiring. Tests use database stand-ins and do not verify OS signal delivery or live Supabase connectivity. No dependencies, schema, migrations or private environment values changed. Remaining M1 work is security headers, request rate limits and origin policy; richer observability can grow with deployment needs.

M1 step 4/completion: Helmet security headers, exact-origin CORS policy and a 100-request/15-minute process-local per-IP /api limit are tested. Runtime mode/origin settings are validated. Allowed preflights return 204 and bypass the budget; disallowed origins stop before persistence; allowed-origin errors retain headers; request 101 returns safe 429 and cannot bypass via a forged forwarded IP under trust-proxy=false. Typecheck/build and 52 reported tests pass. Added Helmet/CORS/express-rate-limit and CORS types (plus their dependencies); existing resolved versions/integrity are preserved. Private .env, Supabase data and schema are unchanged. Scoped M1 is verified. Future authentication needs its own abuse/session/CSRF policy; actual hosting needs a reviewed proxy trust chain, HTTPS and shared counters if scaled out. Next is M2 design, not a claim of finished production security.

Acceptance: malformed requests return safe actionable errors; valid goal behavior remains compatible; no raw credential bodies in output/logs. Do not expose the public write API as a finished multi-user product.

## Phase 2: authentication and users

- [x] Document proposed User/session/token design and staged ownership migration (23 November 2026; AUTH_DESIGN.md). No migration prepared/applied yet.
- [x] Establish scoped backup/restore readiness, capture legacy metadata and verify destination account before backfill.
- [x] Draft/review additive schema/SQL outside active migration path; validate with Prisma and embedded PostgreSQL preservation/constraint/rollback tests.
- [x] Verify scoped application backup/restore, native PostgreSQL staging, permissions/freshness/drift; promote/apply the additive migration and verify preservation. Initial migration remains unchanged.
- [x] Implement validated registration, bcrypt hashing, safe public fields, unique-email race handling and signup throttling.
- [x] Implement login and verify credentials without exposing account/password details.
- [x] Implement JWT/session expiry, refresh rotation/revocation, logout and protected profile. Goal ownership remains below.
- [x] Protect goal creation/list/detail with session-derived ownership; close ordinary direct Goal Data API access.
- [x] Verify actual owner account and backfill only confirmed legacy goals.
- [x] Enforce required ownership after zero-NULL checks and a restore-rehearsed migration.
- [x] Implement current-password-verified password change with atomic all-session revocation and login-race protection.
- [x] Test duplicate registration, invalid/expired/revoked sessions and cross-user goal create/read isolation. Future update/delete ownership tests remain.

M2 design checkpoint (23 November): owner confirms all existing Supabase goals are theirs. Plan User/AuthSession/RefreshToken plus initially nullable indexed Goal.userId; do not auto-assign to first signup. Propose short-lived JWT access in memory and rotated HttpOnly refresh cookies with stored hashes/history, active-session checks for revocation and CSRF protection before cookie auth. Retain bcrypt per original requirement while documenting Argon2id as OWASP's modern preference and bcrypt's byte limit/work-factor constraints. Next steps are additive SQL preparation, isolated verification and backup readiness; no live connection, schema changes or row updates occurred in this documentation step. See AUTH_DESIGN.md.

M2 proposal checkpoint (23 November): `backend/prisma/proposals/auth` contains candidate schema, transactional additive SQL and review instructions. Active schema and migration history are untouched. Fictional initial goals survive the migration unchanged with NULL ownership; new tables start empty; constraints/indexes and rollback are tested in PGlite. Both schemas validate, build/typecheck and 61 reported tests pass. Existing package versions/integrity remain unchanged; existing PGlite 0.4.3 is declared directly for tests. No Supabase access was used. Owner is unsure about backup readiness and requests help checking before any remote change. Embedded tests are not full target-server/Prisma-client verification. Backup, target-compatible staging, live metadata/snapshot, migration promotion and backfill remain pending.

M2 database rollout (23 November): migration `20261123140042_add_auth_sessions_and_goal_owner` applied via Prisma after scoped backup/restore proof, exact-SQL native PostgreSQL rehearsal and live permission/freshness/drift checks. Adds empty User/AuthSession/RefreshToken tables, nullable Goal.userId and indexes/FKs; RLS denies ordinary-role access to credential/session rows. Existing Goal values, unassigned ownership and initial history were preserved; checksum/status/drift verification passes. Regenerated client, build/typecheck, 62 reported tests and compiled live read-only smoke/graceful shutdown pass. Authentication endpoints/backfill remain pending. Recovery artifacts and personal notes stay ignored/local; no credentials, real goal contents or backups are committed.

M2 registration (verified 24 November): name/email/password validation, lowercased email identity, byte-bounded password policy, async bcrypt cost 12, public-field-only responses and 10-attempt/IP/15-minute signup throttling implemented. PostgreSQL uniqueness resolves races; the actual Prisma adapter constraint metadata was verified through isolated integration tests, then handled without exposing raw details. Typecheck/build and 72 default tests plus five isolated PostgreSQL integration tests pass. Tests create fictional local accounts only; no Supabase records/schema were changed and no legacy goal was claimed. Login/session/CSRF/ownership remain pending. Comprehensive compromised-password screening, verification/recovery and production abuse controls remain public-launch work.

M2 login/session step (24 November): credential login, 15-minute access JWTs capped by seven-day absolute sessions, hashed rotating HttpOnly refresh cookies, committed replay/concurrent-use revocation, session-bound CSRF, protected real-user profile and dedicated auth/login limits implemented. Typecheck/build, 79 default tests and eight isolated native PostgreSQL session tests pass; the five registration integration tests also pass. No Supabase writes, schema change or legacy ownership assignment. Goal authorization, actual owner identity/backfill, password change and cross-user resource tests remain required before M2 is complete.


M2 owned-goal step (24 November): protected create/list/detail, server-derived owner, bounded cursor pagination and consistent 404 denial implemented. Goal RLS guard closes ordinary direct Data API access and refuses unexpected preexisting policies. Fresh scoped backup/restore and exact native SQL rehearsal precede deployment; existing goal fields/NULL owner are preserved. Typecheck/build, 80 default tests and 22 native integration tests pass (including parent counts). Actual account verification/backfill, required ownership and password change remain M2 work; update/delete and further goal management remain Phase 4 work.

M2 completion (26 November): verified legacy account linkage precedes migration 20261126190000_require_goal_owner, which refuses unresolved rows and makes Goal.userId required without changing data. Authenticated password change verifies the current password, hashes the new value and revokes all own sessions atomically. Login rechecks its credential hash under the same account lock, preventing late old-password sessions. CSRF/binding checks and a five-attempt limit protect the route. Typecheck/build/schema validation, 83 default tests and 30 native integration tests pass (parent counts included), including rollback and concurrency cases. Fresh scoped backup/restore and live preservation/checksum/drift checks pass; real credentials/sessions remain unchanged by verification. Scoped M2 is complete; broader public-launch verification/recovery/abuse controls remain later work. Editing/deletion remain M4. Next is M3 career profile and the first frontend.

Acceptance: two users cannot access each other's resources; existing data is preserved with explicit legitimate ownership decisions.

## Phase 3: career profile and first frontend

- [x] Add private career-profile GET/PATCH APIs, bounded fields, one-to-one storage and documented five-field completion checklist.
- [x] Add real dashboard summaries as the frontend workflow needs them.
- [x] Scaffold React/TypeScript/Vite/Tailwind and protected routing.
- [x] Build registration/login, session-aware navigation and the career-profile form with API integration.
- [x] Build a real dashboard with owned counts, saved profile and recent goals.
- [x] Verify the dashboard workflow with the owner.
- [x] Add labeled forms, loading/error/empty/unsaved states and responsive keyboard-aware navigation.
- [x] Review current keyboard navigation, route focus, mobile focus containment and labeled feedback.
- [ ] Prepare an appropriate deployment preview.

M3 backend step (27 November): CareerProfile has one unique owner, partial-save validation, explicit null/empty-list clearing and owner-scoped GET/PATCH. Completion lists five core fields and makes no readiness claims. The additive empty-table migration passed fresh scoped backup/restore and native rehearsal; prior goals/account/session values were preserved. RLS denies ordinary direct profile access. Typecheck/build/schema validation, 86 default tests and 38 native integration tests pass (including parents), including two-user isolation, concurrent first saves and application-restart persistence. M3 remains in progress: frontend forms, auth screens, real dashboard, accessibility and preview are not complete.

M3 frontend step (27 November): responsive React shell, registration/sign-in, memory-only auth/session restoration and the connected profile form implemented. Auth operations serialize across tabs; refreshed identities are checked before request replay. Edits use partial PATCH and explicit clearing with saved-field completion; errors preserve current input. Thirteen frontend unit tests, six guarded browser flows, frontend typecheck/build and 87 backend tests pass. Browser QA uses fictional native PostgreSQL data only; no schema or Supabase records changed. Dashboard, owner-run acceptance and hosted preview are still pending, so M3 remains in progress.

Acceptance: an authenticated user edits their profile and sees persisted real data after reload. No fabricated dashboard statistics.

## Phase 4: goals, tasks and skills

- [x] Add owned goal list/detail and bounded cursor pagination.
- [x] Build owned goal list/create/detail screens with pagination, draft protection and dashboard links.
- [x] Add owned goal editing, completion and confirmation-protected deletion APIs/screens.
- [x] Add owned goal search, status filters and oldest/newest-added sorting.
- [x] Add priority/subtask storage through a preserving, backup-verified migration.
- [x] Connect priority controls and owned subtask APIs/screens.
- [x] Add goal deadlines, completion and dashboard overdue counts.
- [x] Add shared skill catalog and private account-skill storage with a preserving migration.
- [x] Connect owned skill APIs, self-reported levels/private notes and skill screens.
- [x] Build connected goal/skill UI and verify account ownership and goal checklist counts.
- [x] Connect private project evidence to catalog skills.
- [ ] Define meaningful skill/role gap calculations before displaying scores (Phase 6).

## Phase 5: projects, certifications and experience

- [x] Add owned project CRUD, dates, descriptions, outcomes and validated external URLs.
- [x] Associate catalog skills with owned projects and private contribution explanations.
- [x] Add owned certifications and experience records with dates, credentials/contributions and related skills.
- [ ] Associate relevant projects and goals with owner-consistent links.
- [ ] Build portfolio/profile views and verify related-write consistency.

## Phase 6: career roadmap engine

- [ ] Define target roles and maintained skill requirements.
- [ ] Compute explainable gaps and deterministic progress.
- [ ] Model phases, milestones, resources, dependencies and timelines.
- [ ] Build saved, interactive roadmaps and progress updates before adding AI generation.

## Phase 7: AI integration and recommendations

- [ ] Introduce provider abstraction, validated input/output and prompt templates.
- [ ] Add timeouts, bounded retries, per-user limits, cost controls and safe logs.
- [ ] Generate roadmap drafts and selected section updates with validated persistence.
- [ ] Add resource/project suggestions and contextual career assistant.
- [ ] Verify permission isolation and distinguish verified links from suggestions.

## Phase 8: resumes and ATS-style analysis

- [ ] Add private uploads, size/type checks, safe text extraction and version metadata.
- [ ] Add factual resume analysis and job-description comparison.
- [ ] Explain heuristic scores and require user review of proposed edits.
- [ ] Test ownership, extraction failures and unsupported files.

## Phase 9: opportunities and applications

- [ ] Integrate legitimate opportunity sources with source/expiry labels.
- [ ] Add search, filters, saving and explainable matching.
- [ ] Add application CRUD, statuses, notes, resume links and interview scheduling.
- [ ] Build pipeline and deterministic application/conversion analytics.

## Phase 10: interview preparation

- [ ] Add role/job/project-based questions, sessions and saved answers.
- [ ] Add structured feedback, follow-up learning and progress history.
- [ ] Verify output quality, user isolation, failures and cost controls; consider voice later.

## Phase 11: notifications and analytics

- [ ] Add deduplicated in-app reminders and user preferences.
- [ ] Connect goal, roadmap, interview and application events.
- [ ] Document every score/formula; build accurate trend and readiness views.

## Phase 12: comprehensive reliability review

- [ ] Review unit/integration/API/frontend/end-to-end coverage added throughout earlier phases.
- [ ] Exercise authorization, validation, database constraints, concurrency and error paths.
- [ ] Review security, accessibility, performance, indexes and bounded list queries.

This phase broadens existing verification; it is not the first time tests or security are introduced.

## Phase 13: deployment and operations

- [ ] Configure frontend/backend hosting, private secrets, HTTPS and production CORS.
- [ ] Document reviewed migration deployment and backup/restore procedures.
- [ ] Add monitoring, safe logs and error tracking.
- [ ] Verify deployed health/readiness, authentication and core user workflows.

## Phase 14: polish and portfolio

- [ ] Complete responsive/accessibility/performance polish and consistent UI states.
- [ ] Prepare opt-in fictional demo data, screenshots and walkthrough.
- [ ] Update setup/API/architecture documentation and project presentation.
- [ ] Prepare an accurate resume project description and interview explanations of tradeoffs.

## Definition of a finished milestone

Working behavior demonstrated; important failure/ownership cases verified; build passes; schema changes reviewed and non-destructive; relevant docs updated; diff and secret exposure reviewed. Explain the feature and architecture before implementation, then provide concise learning notes and an exercise after verification. Advance one verified milestone at a time within the authorized scope.

M3 dashboard step (27 November): owned read API and React dashboard implemented with profile direction, completion checklist, exact-status totals, UTC overdue subset and latest-five goals. Profile saves refresh dashboard data and guarded navigation protects drafts. Validation passed: 89 backend default tests, 6 native PostgreSQL dashboard tests (including parent), 13 frontend unit tests, 9 isolated browser flows and both production builds. The owner previously confirmed real profile save/reload; owner dashboard acceptance, remaining accessibility review and deployment preview remain outstanding. No Supabase schema or records changed in this step.

M3 keyboard review (27 November): route/session transitions focus main content; password visibility has explicit accessible names. Browser assertions cover route focus, keyboard toggles, mobile forward/backward focus containment and Escape restoration alongside existing end-to-end flows. Frontend build, 13 unit tests and 9 fictional local browser flows pass. Owner confirmed all seven real-account walkthrough steps. This completes the focused keyboard review; full assistive-technology conformance is not claimed. Deployment preview is still pending, so M3 remains open.

M4 Goals frontend increment (27 November): protected list, create and read-only detail screens use the existing owned APIs. Lists load 20 records at a time; optional descriptions/dates, validation, empty/error/retry states, draft protection and dashboard links/cache refresh are connected. Uncertain creation failures retain input and prevent blind duplicate submissions. Verified: frontend production build, 13 frontend unit tests, 10 browser flows (including Goals create/reload/isolation/pagination/mobile/failure steps), and 89 backend default tests. Final browser run has no fixture initialization warnings. Fictional local test servers/database stopped gracefully. No production API/schema/dependency changes or real Supabase writes. Owner Goals acceptance, goal editing/completion/deletion, skills/projects and deployment preview remain pending.

M4 goal mutation increment (27 November): strict partial PATCH, explicit optional-field clearing, completion assignment and owner-scoped DELETE added. Goal details provide edit forms, completion and permanent-deletion confirmation; confirmed results refresh list/dashboard data. Unknown outcomes retain drafts and require a saved read before more mutations. Native tests cover anonymous/foreign/revoked denial, bad payloads, ownership preservation, clearing, repeated completion, counts and deletion isolation. Verified: 90 backend default tests, 14 native goal integration checks (including parent), 13 frontend unit tests, 12 isolated browser flows and both production builds. Desktop/mobile edit layout reviewed. No schema/dependency change or real Supabase test mutation. Owner acceptance of these changes is next; goal search/filter/sort, subtasks/priorities, skills/projects and deployment preview remain pending.

M4 goal discovery increment (27 November): literal case-insensitive title/category/description search (100-character bound), All/Active/Completed/Other filters and ID-based oldest/newest sorting implemented on the owned backend query and connected frontend. Existing default/response contract preserved; cursor direction follows sort. Changed criteria restart at page one, including when switching back to a cached selection. Search submits explicitly; reset and no-matches states are provided. Verified: 91 backend default tests, 15 native goal integration checks (including parent), 13 frontend unit tests, 13 browser flows, both production builds and desktop/mobile visual review. No schema/dependency or real Supabase changes. Owner previously verified goal management; discovery acceptance is next. Priorities/subtasks, skills/projects and hosted preview remain pending.

M4 execution storage step (27 November): Goal.priority defaults to MEDIUM with LOW/MEDIUM/HIGH constraint; private Subtask child table adds bounded title, completion flag, timestamps, parent FK cascade and (goalId,id) index. Existing account/profile/session/goal values were preserved. Fresh public-schema/data backup restored locally and exact SQL rehearsed before Supabase deployment; checksums, live preservation fingerprints, migration status, Prisma supported-model drift and compiled read-only model checks passed. No platform-wide backup claim. Goal deletion confirmation now mentions child subtasks. Priority/subtask APIs and controls are not implemented yet; they are the next increment. No dependency changes.

Storage regression checks: 93 backend default tests, 15 native goal integration checks (including parent), 13 frontend unit tests, 13 browser flows and both production builds passed after client regeneration. Live schema status/model checks and compiled read-only smoke passed; private native restore/rehearsal verified the exact migration. These checks validate the storage foundation and existing workflows, not yet-unimplemented priority/subtask APIs or controls.

M4 execution API/UI increment (27 November): priority accepted on owned goal create/partial update and displayed/edited in forms. Owned subtasks support strict create/rename/explicit check-uncheck/delete APIs, bounded ID-cursor lists with whole-goal counts and a serialized 100-step cap. Goal details connect checklist controls, reload, paging, permanent-deletion confirmation and draft/failure recovery. Completion remains independent from parent status, including completed goals. One shared registry/blocker protects multiple forms and sign-out/session transitions. Missing-row rename drafts remain copyable/discardable. No new migration or dependency; existing storage reused and real Supabase records untouched during tests. Owner acceptance is next; skills/projects and hosted preview remain pending.

Execution verification complete: 95 backend default tests, 24 native database checks (9 subtask/priority plus 15 existing goal checks, including parents), 13 frontend unit tests, 14 browser flows and both production builds pass. Browser coverage includes persisted priority changes, rename/check/uncheck/delete, independent parent completion, completed-goal editing, confirmation cancellation, shared draft protection, uncertain-save recovery, whole-goal counts/paging and missing-row draft recovery. Desktop/mobile checklist layouts and keyboard focus reviewed; no horizontal overflow. All test servers/local PostgreSQL stopped. No new schema/dependency or real Supabase mutation in this increment. Owner acceptance next.

M4 skills storage (28 November): shared Skill catalog with unique bounded slug/name/category and eight maintained starter labels; private UserSkill composite account/skill key, self-reported BEGINNER/INTERMEDIATE/ADVANCED level, optional bounded notes, timestamps and restrictive foreign keys. No personal skills assigned automatically. Both tables have RLS/no direct policies. Fresh scoped backup included all existing tables, including Subtask, and was restored locally; exact migration rehearsal, constraints/privacy and all-row preservation passed before Supabase apply. Live supported-model drift/status and compiled read-only model checks pass. API/screens are the next increment; no readiness scoring is claimed. No dependency change.

Skills storage verification: 97 backend default tests, 24 native existing-goal/subtask checks (including parent counts), 13 frontend unit tests, 14 browser flows and both production builds passed. Fresh backup/native restore/exact-SQL rehearsal, live migration status/model checks and compiled read-only model queries passed. Test servers/local PostgreSQL stopped. These checks verify storage and existing workflows; skill endpoints/screens are still next.

28 November — owned Skills API and screen complete; owner acceptance pending. Authenticated catalog search and bounded cursor lists; private account skill add/update/remove with strict validation, duplicate conflict without overwriting notes, explicit null clearing and owner-scoped mutations. Skills screen connects catalog selection, self-reported levels/private notes, edit/remove confirmation, paging, retry/reload, draft protection and unknown-write recovery. Removing a personal entry leaves the shared catalog intact. No skill score or verified proficiency claim. No schema/dependency change or real Supabase test writes.

Verified this increment: 99 backend default tests, 8 native Skills integration checks (including parent), 13 frontend unit tests, 15 isolated browser flows and both production builds passed. Desktop/mobile layout reviewed; fictional preview and native PostgreSQL stopped gracefully. Private notes remain ignored. Next: owner tries Skills add/reload/edit/clear/remove cancellation and confirms catalog remains available; project/evidence linking follows the roadmap. Hosted preview and broader polish remain later work.

28 November — Projects and skill evidence implemented. Owned project CRUD and screen include bounded fields, status/calendar dates, validated external links and up to 20 unique catalog skill links with private contribution explanations. Related writes are atomic; merged date updates lock the owned parent. Evidence survives personal assessment removal; project deletion cascades only its own links. Screen controls include draft protection, safe external links, confirmation-protected deletion and unknown-outcome reload recovery. Records remain self-reported and private, with no proficiency or readiness score.

The additive migration passed fresh scoped backup/native restore/exact-SQL rehearsal, preservation fingerprints for all 8 prior tables, live migration/model checks and compiled read-only smoke. Validation: 103 backend default tests, 8 native project API checks (including parent), 13 frontend unit tests, 16 isolated browser flows and both production builds passed; desktop/mobile editor reviewed. No dependency changes or real test project records. Real-account acceptance is next; certifications/experience, goal links, portfolio views, role-gap calculations and hosted preview remain open.

28 November — Certifications and experience implemented. Separate owned records include credential issuer/ID/link and issue/expiry dates, or organization/work type/current state/dates/responsibilities/achievements. Both link up to 20 catalog skills with optional explanations. APIs provide strict owned CRUD, bounded pagination, atomic related writes, merged calendar/current validation under row locks and safe public fields. Shared screen mechanics preserve drafts and recover unknown outcomes, including a delete whose response was lost. Records remain private and self-reported; they do not change personal levels or claim verified credentials/employment.

Migration 20261128140000_add_certifications_and_experience passed a fresh public-schema backup/native restore/exact-SQL rehearsal and preservation checks for all ten prior tables. All four new tables enable RLS with no ordinary direct policies. Live migration/model and compiled read-only checks pass. Verification: 107 backend default tests, 14 native record API checks (including parent), 13 frontend unit tests, 17 isolated browser flows and both production builds; desktop/mobile review passed. No dependency changes or real test records. Real-account acceptance is next; owner-consistent project/goal associations, portfolio views, role-gap calculations and hosted preview remain open.
