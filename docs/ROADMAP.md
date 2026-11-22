# CareerOS ordered development roadmap

Updated 22 November 2026. Baseline: repository audit dated 17 November 2026. The owner has authorized continuing development in small, explained, verified steps and making Git checkpoints at stable milestones. Each milestone below is split into manageable tasks; completing the entire long-term backlog is not required for the first release.

## Release goal and scope

CareerOS helps CSE students turn a target role into a practical weekly plan, supported by their skills and project evidence.

Core workflow: target role -> current skills and projects -> explained gaps -> goals and roadmap -> reviewed weekly plan -> progress.

Keep Node/Express/TypeScript, PostgreSQL/Supabase and Prisma. Build the UI with React/TypeScript/Vite, Tailwind and React Router; introduce TanStack Query for API server state. Add Zod and secure authentication as needed. Use one AI provider behind a small interface initially. Avoid introducing microservices, queues, vector databases or autonomous agents without a concrete requirement.

## Delivery milestones (active order)

| Milestone | Scope and acceptance | Git checkpoint when verified |
| --- | --- | --- |
| M0. Foundation — verified | Compiler boundary/build, read-only database connectivity, migration status, compiled startup, safe setup and exact Prisma pins verified on 22 November 2026. Existing data preserved. | `6720344` build repair; foundation setup checkpoint follows |
| M1. API safety | Validated goal input, consistent errors/JSON 404, stop registration body exposure, environment checks, safe logs and initial API tests. | `feat: establish validated backend API foundation` |
| M2. Identity and ownership | Real registration/login/logout, password hashing, session strategy, protected routes, explicit public user fields; reviewed non-destructive migration for existing goals; cross-user denial tests. | `feat: add authentication and resource ownership` |
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

`tsc.cmd --noEmit` and `npm.cmd run build` pass. Prisma schema validation passes with `--config prisma7.config.ts`. A one-off service check stubbed `prisma.goal.create` and verified omitted optional fields, supplied description/date, empty description preservation and returned result. No database writes or dependency changes occurred. Database connectivity/migration status, normal startup and setup cleanup remain pending. Learning notes: MILESTONE_NOTES.md.

### M0 completion evidence (22 November 2026)

Read-only `SELECT 1` passed. Migration history shows `20260915165713_init` finished and not rolled back. Live Goal column names/types/nullability match the checked-in model. Prisma `migrate status --config prisma7.config.ts` reports one migration and an up-to-date database. A temporary compiled server connected before listening and GET / returned 200 with project CareerOS; only the verification-started process was stopped. No application rows were read or written and no migration was applied. Migration status/column checks are not a complete schema-drift, policy or backup audit.

New generate/validate/typecheck/build scripts pass; the status script points to the same verified read-only command. Manifest and lockfile root declarations agree on exact Prisma 7.10.0 pins; all resolved lockfile package records are unchanged. `.env.example` contains placeholders only; real `.env` was untouched. Generated output remains ignored. M0 is verified; the next small task is M1 input validation and API error conventions, taught before implementation.

## Phase 1: backend/API standards

- [x] Document safe message-based errors and JSON 404; preserve existing success contracts.
- [x] Add Zod validation for goal creation and safe JSON parser/oversized-body errors.
- [x] Route unexpected goal failures through shared middleware with a fixed safe log event; richer operational diagnostics remain in the startup/logging task.
- [x] Stop logging/echoing registration payloads; return explicit 501 until real registration is implemented.
- [ ] Validate environment configuration, allow deployment port, add sanitized logs and graceful shutdown.
- [ ] Add appropriate security headers, request limits and explicit frontend origin policy when origins are known.
- [x] Add test infrastructure and goal API validation/parser-error tests; document current contracts in API.md.

M1 step 1: typecheck and build pass; 22 API subtests plus their parent pass (Node reports 23 tests). Tests verify invalid requests do not call the persistence test double and valid requests preserve the 201 contract. No Supabase access or schema changes. Zod 4.6.7 is the only added package; existing resolved versions/integrities are unchanged, while npm recalculated development flags for optional TypeScript platform packages. M1 remains in progress; registration-body exposure and other unchecked items are not solved yet.

M1 step 2: typecheck and build pass; 27 API cases plus two parent tests pass (Node reports 29 tests). New cases verify registration does not log/echo synthetic credentials, unknown routes/methods return safe JSON, existing root/demo profile responses remain available, and simulated async persistence failure returns/logs no private details. No Supabase access, migration or dependency change. Remaining M1 tasks: environment validation, deployment port, startup logs/shutdown, headers, request limits and origin policy.

Acceptance: malformed requests return safe actionable errors; valid goal behavior remains compatible; no raw credential bodies in output/logs. Do not expose the public write API as a finished multi-user product.

## Phase 2: authentication and users

- [ ] Design User identity and migration strategy for existing unowned goals.
- [ ] Implement validated registration/login with password hashing and public-field responses.
- [ ] Implement JWT/session expiry, refresh rotation/revocation where appropriate, logout and protected routes.
- [ ] Add ownership enforcement, account/profile APIs and password change.
- [ ] Test duplicate registration, invalid credentials, expired tokens and cross-user access.

Acceptance: two users cannot access each other's resources; existing data is preserved with explicit legitimate ownership decisions.

## Phase 3: career profile and first frontend

- [ ] Add profile fields and profile/dashboard APIs with documented completeness rules.
- [ ] Scaffold React/TypeScript/Vite/Tailwind and routing incrementally.
- [ ] Build authentication, dashboard and profile pages with API integration.
- [ ] Add reusable accessible forms, loading/error/empty states and responsive navigation.

Acceptance: an authenticated user edits their profile and sees persisted real data after reload. No fabricated dashboard statistics.

## Phase 4: goals, tasks and skills

- [ ] Add owned goal list/detail/update/delete, bounded pagination, search/filter/sort.
- [ ] Add priorities, deadlines, subtasks, completion and overdue views.
- [ ] Add skill catalog/user proficiency, categories and learning progress.
- [ ] Build connected goal/skill UI and test ownership and progress calculations.

## Phase 5: projects, certifications and experience

- [ ] Add owned CRUD, dates, descriptions and outcomes.
- [ ] Associate skills, projects and goals; validate external URLs.
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
