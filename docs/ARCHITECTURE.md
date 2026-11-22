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
- Services contain application operations. Currently only the goal service persists anything.
- `config/prisma.ts` exports one Prisma client with `PrismaPg` and `DATABASE_URL`.
- `schema.prisma` describes the Goal record. SQL migrations describe changes to the database over time.
- The generated Prisma client supplies database types and query methods; it is ignored and must be generated locally.

The goal path is `POST /api/goals -> createGoalController -> Zod schema validation -> createGoal -> prisma.goal.create -> PostgreSQL`. Invalid input stops at the controller with a 400. The schema trims required strings and selects only supported fields. A JSON 404 handler follows routes; final error middleware follows that. Async goal-service rejections reach the shared handler through Express 5, returning a generic 500 and logging a fixed event without raw exception data. Profile returns static data; registration returns 501 without logging or echoing its body. Root information is returned directly from `app.ts`. There is no frontend or AI layer.

## Configuration and boundaries

The backend is an ESM Node/TypeScript package. Source imports use `.js` paths for compiled execution. Development uses tsx, compilation uses tsc, production start expects `dist/server.js`. Strict TypeScript checks do not validate incoming JSON at runtime. The compiler now explicitly includes `src/**/*.ts`, leaving the root Prisma CLI config outside the application build. Optional goal fields are omitted when absent, satisfying strict optional-property typing. No-emit checking and compilation pass as of 22 November 2026; this does not establish successful database startup.

Prisma CLI uses `prisma7.config.ts`; package scripts select this filename explicitly. Runtime and CLI both use `DATABASE_URL`. Schema validation, read-only live connectivity and migration status passed on 22 November 2026 after earlier audit failures. The initial migration is recorded as finished remotely; Goal column metadata agrees with the model. Compiled startup and GET / were verified. These checks do not establish every constraint, policy or backup state. Prisma CLI/client/adapter are pinned exactly to 7.10.0.

## Planned architecture

M2 account/session design is now recorded in AUTH_DESIGN.md (23 November 2026), not implemented. Proposed User -> AuthSession -> RefreshToken records support short-lived signed access tokens, refresh rotation and server-side revocation. Goal.userId starts nullable for compatibility, then a reviewed backfill links confirmed legacy goals to a verified real owner before a later required-owner constraint. Password hashes/token hashes remain private; browser cookie endpoints require deliberate credentialed CORS and CSRF handling. The owner confirmed existing goals are theirs, but no destination account or exact legacy ID snapshot exists yet. Runtime, Prisma schema and remote database remain unchanged by this design checkpoint.

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

Zod is installed for goal input validation. bcrypt, JWT and the frontend stack remain planned. Prefer authentication before exposing more user-owned CRUD. Model User ownership explicitly. For existing Goal rows, plan a non-destructive ownership transition: inspect counts without exposing data, decide legitimate ownership, add a compatible nullable relation if needed, backfill deliberately, then enforce required ownership only after verification. Never assign old records arbitrarily to a new account.

Add relational models only as their feature is implemented. User/Profile anchor skills, projects, goals and later roadmaps/applications. Multi-record writes should use transactions. Index ownership and proven query patterns; paginate lists. Document cascade/delete behavior before migrations.

## Security and AI design constraints

Hash passwords, return explicit public user fields, protect routes, and scope each resource lookup/mutation to its owner. Decide refresh-token storage, rotation, expiry, logout and CSRF strategy before implementing account sessions. Log sanitized operational context instead of raw bodies/secrets.

Keep AI provider calls behind a service interface with prompt templates, validated structured outputs, timeouts, controlled retries, per-user limits and cost awareness. Retrieve only the authenticated user's relevant data. Model output must never directly execute database commands. Use deterministic, documented calculations for scores; distinguish suggested resources from verified resources. Uploaded resumes require private ownership-scoped storage, upload constraints and safe extraction.

## Engineering tradeoffs

Continue with the small route/controller/service structure; there is no evidence that microservices or a repository abstraction are needed now. Add shared state management only when the UI needs it. Keep tests and security work alongside each feature rather than postponing all verification to the final phases. Deployment readiness requires successful builds, database verification, environment validation, graceful shutdown, monitoring, backups and safe migration procedures.
