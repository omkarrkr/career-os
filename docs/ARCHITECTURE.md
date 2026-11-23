# CareerOS architecture

Audited 17 November 2026; build configuration updated 22 November 2026. This document separates implemented behavior from intended design.

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
- `schema.prisma` describes Goal, User, AuthSession and RefreshToken. SQL migrations describe database changes over time.
- The generated Prisma client supplies database types and query methods; it is ignored and must be generated locally.

The goal path is `POST /api/goals -> createGoalController -> Zod schema validation -> createGoal -> prisma.goal.create -> PostgreSQL`. Invalid input stops at the controller with a 400. The schema trims required strings and selects only supported fields. A JSON 404 handler follows routes; final error middleware follows that. Async failures reach the shared handler through Express 5, returning a generic 500 and fixed safe log event. Profile requires authentication and selects the signed-in user’s public fields. Registration follows schema validation -> user service -> asynchronous bcrypt hash -> Prisma create with public-field selection; the controller serializes public fields again. A deliberate ApiError maps the known email uniqueness violation to 409 without exposing adapter diagnostics. No frontend or AI layer exists.

## Configuration and boundaries

The backend is an ESM Node/TypeScript package. Source imports use `.js` paths for compiled execution. Development uses tsx, compilation uses tsc, production start expects `dist/server.js`. Strict TypeScript checks do not validate incoming JSON at runtime. The compiler now explicitly includes `src/**/*.ts`, leaving the root Prisma CLI config outside the application build. Optional goal fields are omitted when absent, satisfying strict optional-property typing. No-emit checking and compilation pass as of 22 November 2026; this does not establish successful database startup.

Prisma CLI uses `prisma7.config.ts`; package scripts select this filename explicitly. Runtime and CLI both use `DATABASE_URL`. Schema validation, read-only live connectivity and migration status passed on 22 November 2026 after earlier audit failures. The initial migration is recorded as finished remotely; Goal column metadata agrees with the model. Compiled startup and GET / were verified. These checks do not establish every constraint, policy or backup state. Prisma CLI/client/adapter are pinned exactly to 7.10.0.

## Planned architecture

M2 database foundations are active as of 23 November 2026. Migration `20261123140042_add_auth_sessions_and_goal_owner` was restore-rehearsed on native PostgreSQL 17 and applied through Prisma after freshness/permission/drift checks. User -> AuthSession -> RefreshToken tables and nullable indexed Goal.userId now exist; the runtime client was regenerated and read-only smoke checked. Credential/session tables have RLS enabled without public policies, preventing ordinary non-owner API roles from accessing rows despite possible default grants; the owning backend database role can manage them. Row ownership checks in backend services remain necessary because the owner bypasses RLS. No accounts/sessions were created and no goals were reassigned. The historical proposal is no longer a deployment source. Auth endpoints/session logic are implemented; verified legacy ownership backfill remains pending. Goal Data API/RLS access must be reviewed alongside the protected multi-user rollout, not assumed safe merely because the new credential tables are guarded.

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

Zod validates goal/signup inputs and bcrypt hashes registration passwords at cost 12. A separate signup limiter precedes parsing/hashing. JWT/session flow is implemented; the frontend remains planned. Registration creates no session. Existing Goal ownership remains nullable until verified account linkage/backfill. Never assign old records to the first signup. Unit/API tests replace persistence; the separately gated local PostgreSQL integration test verifies actual Prisma writes and duplicate races without touching Supabase.

Add relational models only as their feature is implemented. User/Profile anchor skills, projects, goals and later roadmaps/applications. Multi-record writes should use transactions. Index ownership and proven query patterns; paginate lists. Document cascade/delete behavior before migrations.

## Security and AI design constraints

Hash passwords, return explicit public user fields, protect routes, and scope each resource lookup/mutation to its owner. Session routes use jose-signed access JWTs, hashed opaque refresh tokens, transactional rotation/replay revocation, HttpOnly cookies and csrf-csrf session-bound double-submit protection. Every protected request also checks the active database session. Log sanitized operational context instead of raw bodies/secrets.

Keep AI provider calls behind a service interface with prompt templates, validated structured outputs, timeouts, controlled retries, per-user limits and cost awareness. Retrieve only the authenticated user's relevant data. Model output must never directly execute database commands. Use deterministic, documented calculations for scores; distinguish suggested resources from verified resources. Uploaded resumes require private ownership-scoped storage, upload constraints and safe extraction.

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

## Engineering tradeoffs

Continue with the small route/controller/service structure; there is no evidence that microservices or a repository abstraction are needed now. Add shared state management only when the UI needs it. Keep tests and security work alongside each feature rather than postponing all verification to the final phases. Deployment readiness requires successful builds, database verification, environment validation, graceful shutdown, monitoring, backups and safe migration procedures.
