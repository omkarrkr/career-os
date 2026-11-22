# CareerOS architecture

Verified 17 November 2026. This document separates implemented behavior from intended design.

## Current system

```text
server.ts -> load dotenv -> Prisma $connect -> app.listen(3000)
                                                |
HTTP JSON -> app.ts -> route -> controller -> service -> Prisma -> PostgreSQL
```

`app.ts` constructs Express and mounts routers without opening a listening socket. `server.ts` owns startup and waits for the database before accepting connections. This separation lets tests import the app independently, although no automated tests exist yet.

- Routes select handlers by HTTP method and URL.
- Controllers select request fields and form HTTP responses.
- Services contain application operations. Currently only the goal service persists anything.
- `config/prisma.ts` exports one Prisma client with `PrismaPg` and `DATABASE_URL`.
- `schema.prisma` describes the Goal record. SQL migrations describe changes to the database over time.
- The generated Prisma client supplies database types and query methods; it is ignored and must be generated locally.

The goal path is `POST /api/goals -> createGoalController -> createGoal -> prisma.goal.create -> PostgreSQL`. Profile returns static data; registration echoes input. Root information is returned directly from `app.ts`. There is no frontend or AI layer.

## Configuration and boundaries

The backend is an ESM Node/TypeScript package. Source imports use `.js` paths for compiled execution. Development uses tsx, compilation uses tsc, production start expects `dist/server.js`. Strict TypeScript checks do not validate incoming JSON at runtime. The current compiler project includes the root Prisma config outside its source root and fails TS6059.

Prisma CLI uses `prisma7.config.ts`; pass this filename explicitly. Runtime and CLI both use `DATABASE_URL`. Schema validation passed, but live database connectivity failed during the audit. A checked-in migration is evidence of intended structure, not proof it is currently applied remotely.

## Planned architecture

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

Zod, bcrypt, JWT and the frontend stack are desired choices, not installed implementations. Prefer authentication before exposing more user-owned CRUD. Model User ownership explicitly. For existing Goal rows, plan a non-destructive ownership transition: inspect counts without exposing data, decide legitimate ownership, add a compatible nullable relation if needed, backfill deliberately, then enforce required ownership only after verification. Never assign old records arbitrarily to a new account.

Add relational models only as their feature is implemented. User/Profile anchor skills, projects, goals and later roadmaps/applications. Multi-record writes should use transactions. Index ownership and proven query patterns; paginate lists. Document cascade/delete behavior before migrations.

## Security and AI design constraints

Hash passwords, return explicit public user fields, protect routes, and scope each resource lookup/mutation to its owner. Decide refresh-token storage, rotation, expiry, logout and CSRF strategy before implementing account sessions. Log sanitized operational context instead of raw bodies/secrets.

Keep AI provider calls behind a service interface with prompt templates, validated structured outputs, timeouts, controlled retries, per-user limits and cost awareness. Retrieve only the authenticated user's relevant data. Model output must never directly execute database commands. Use deterministic, documented calculations for scores; distinguish suggested resources from verified resources. Uploaded resumes require private ownership-scoped storage, upload constraints and safe extraction.

## Engineering tradeoffs

Continue with the small route/controller/service structure; there is no evidence that microservices or a repository abstraction are needed now. Add shared state management only when the UI needs it. Keep tests and security work alongside each feature rather than postponing all verification to the final phases. Deployment readiness requires successful builds, database verification, environment validation, graceful shutdown, monitoring, backups and safe migration procedures.
