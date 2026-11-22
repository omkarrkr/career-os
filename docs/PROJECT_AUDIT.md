# CareerOS repository audit

Audit date: 17 November 2026. Source code is authoritative. This audit changes documentation only.

## A. Actual project structure

```text
career-os/
  .gitignore
  README.md
  backend/
    .env                         # local, ignored; values not disclosed
    .gitignore
    package.json
    package-lock.json
    tsconfig.json
    prisma7.config.ts
    prisma/
      schema.prisma
      migrations/
        migration_lock.toml
        20260915165713_init/migration.sql
    src/
      app.ts
      server.ts
      config/prisma.ts
      controllers/{goal,user}.controller.ts
      routes/{goal,user}.routes.ts
      services/{goal,user}.service.ts
      generated/prisma/          # local generated client, ignored
    node_modules/                # installed, ignored
  docs/                          # created by this audit
    PROJECT_AUDIT.md
    MASTER_CONTEXT.md
    ROADMAP.md
    ARCHITECTURE.md
```

Routes map URLs to controllers. Controllers translate HTTP input/output. Services perform application work. `config` owns shared infrastructure. `prisma` holds the schema and migration history. There is no frontend, middleware directory, utilities directory, test suite, CI configuration, deployment configuration, or previous docs directory. No applicable AGENTS.md was found. Dependencies and generated source were excluded from source review; lockfile metadata and generated-client presence were checked.

## B. Existing implementation

- Express 5 app with JSON body parsing and four declared endpoints.
- Startup loads dotenv, awaits Prisma connection, then listens on fixed port 3000. Connection failure logs an error and exits.
- A singleton Prisma client uses the PostgreSQL adapter and `DATABASE_URL`.
- Goal creation passes title, description, category, and optional converted date to `prisma.goal.create`.
- Profile returns a fixed demonstration object; registration logs and echoes its request. Neither implements user accounts.
- ESM TypeScript setup, strict compiler options, one PostgreSQL migration, npm lockfile, development/build/start scripts.
- No AI integration. Gemini is mentioned in README as a direction, not implemented behavior.

## C. Backend/API audit

| Method/path | Request | Current response | Verification |
| --- | --- | --- | --- |
| `GET /` | None | 200 `{project:"CareerOS",version:"1.0.0",developer:"Omkar Kumar",status:"Backend Running ✅"}` | HTTP observed |
| `GET /api/users/profile` | None | 200 `{success:true,data:{id:1,name:"Demo User",role:"Student"}}` | HTTP observed; public placeholder |
| `POST /api/users/register` | Any JSON body | 200 `{message:"User received successfully!",data:<submitted body>}` | HTTP observed with synthetic, non-sensitive data |
| `POST /api/goals` | `{title,category,description?,targetDate?}` | 201 `{message:"Goal created successfully",data:<Goal>}`; caught failures return 500 `{message:"Failed to create goal"}` | Source verified; no insert performed |

Goal output has `id`, `title`, nullable `description`, `category`, `status`, nullable `targetDate`, and `createdAt`. Dates serialize as JSON date strings. The service supplies no status, so the database default applies. There is no runtime request schema; these are intended fields, not validated contracts. The controller destructures `req.body` and forwards values without checking types, length, categories, empty strings, or date validity. Missing/invalid data can become a 500 rather than an actionable 400. Unexpected input may reach Prisma despite TypeScript service signatures.

Goal errors are logged in full. There is no common error middleware, consistent response envelope, request identifier, custom JSON 404, validation middleware, authentication, authorization, password hashing, JWT/session handling, rate limiting, or security-header middleware. Express default parsing/error behavior remains in use. An unknown route returned HTML 404 in the HTTP probe. No CORS policy is configured for a future separately hosted frontend. CORS will not provide resource authorization.

There are no goal list/detail/update/delete endpoints, subtasks, ownership checks, priorities, search, pagination, sorting, or completion calculations. The profile service does not query the database. Registration has no persistence or uniqueness checks.

## D. Frontend audit

The frontend folder is absent. React, Vite, Tailwind, routing, API fetching, state management, pages, forms, components, accessibility, responsiveness, and loading/error/empty states are all unimplemented. README's frontend stack is a plan. No UI can currently demonstrate the career workflow.

## E. Database audit

The checked-in schema contains one model and one SQL table definition:

| Goal field | Prisma type | SQL definition / behavior |
| --- | --- | --- |
| id | Int | SERIAL, primary key |
| title | String | TEXT NOT NULL |
| description | String? | nullable TEXT |
| category | String | TEXT NOT NULL |
| status | String | TEXT NOT NULL DEFAULT 'ACTIVE' |
| targetDate | DateTime? | nullable TIMESTAMP(3) |
| createdAt | DateTime | TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP |

The only checked-in migration is `20260915165713_init`; its SQL agrees with this model. The migration lock selects PostgreSQL. There are no relationships, foreign keys, secondary indexes, status/category constraints, user identifiers, or updated timestamps. Database NOT NULL constraints do not reject empty text. The current data model cannot isolate multiple users.

`prisma7.config.ts` explicitly selects the schema, migrations folder and `DATABASE_URL`. Runtime connectivity is independently configured in `src/config/prisma.ts` using that same variable. It is a custom config filename: use `--config prisma7.config.ts` explicitly in CLI instructions. README omits this flag. `.env` exists and defines `DATABASE_URL`; its value was not printed. The configured URL targets Supabase, but live schema, existing row count, historical inserts, migration application state, backups and Supabase policies could not be verified in this session.

## F. Technical findings, ordered by priority

1. **High: registration exposes submitted data.** `user.controller.ts` logs and returns the whole body. A submitted password would be exposed in logs and response. This endpoint is not registration and should not accept real account data.
2. **High: goal creation is public and unowned.** Anyone able to reach it can attempt database inserts. There is no User model or resource boundary. Do not expose as a production multi-user API.
3. **High: type/build verification fails.** `tsc --noEmit` reports TS6059: root-level `prisma7.config.ts` is included by default but lies outside `rootDir: ./src`. The same project configuration is used by `npm run build`; production build readiness is unverified. Correct compiler inclusion deliberately rather than moving working runtime code blindly.
4. **High: database readiness is currently unverified.** Network-enabled read-only PostgreSQL check failed with code `XX000`; Prisma migration status also failed with a generic schema engine error. This is insufficient evidence to identify the cause. Inspect connection mode and sanitized diagnostics before changing settings. Do not reset the database.
5. **Medium: input validation and API errors are incomplete.** Invalid dates and missing fields can produce 500s; strings and categories are unconstrained. No central error policy or JSON 404.
6. **Medium: operational safeguards are missing.** Fixed port, no validated environment configuration, no graceful HTTP/Prisma shutdown, no request logging policy, no request rate limit, no monitoring or deployment setup. Root response is app information, not a live database readiness probe.
7. **Medium: reproducibility/documentation gaps.** Package ranges are `^7.10.0`, not exact Prisma pins, though the lockfile resolves the three Prisma packages to 7.10.0. No node engine declaration, `.env.example`, test script, lint script, CI, or automated tests. README's Node v18+ guidance needs compatibility verification; its `.env` copy command copies a file to itself. Do not follow its migration instructions automatically against valuable data.
8. **Low: cleanup opportunities.** Commented old app/tsconfig examples, inconsistent response shapes, `package.json` main pointing at absent `index.js`, and mostly empty package metadata. No substantial duplicated business logic found; two small controller/service paths are a reasonable initial layering choice.

Scaling is not yet the immediate constraint. Later list endpoints need bounded pagination and ownership indexes; status/deadline queries need indexes based on actual query patterns. AI and document processing need independent limits, timeouts and cost controls when introduced.

## Verification evidence and limits

| Check | Result |
| --- | --- |
| Initial `git status --short` | Clean |
| Node / npm | v24.22.1 / 11.19.1 |
| Lockfile | v3; Prisma CLI/client/adapter 7.10.0; Express 5.2.1; TypeScript 7.0.2; tsx 4.23.1; pg 8.23.0 |
| `tsc.cmd --noEmit` | Failed TS6059 as above |
| `prisma.cmd validate --config prisma7.config.ts` | Passed |
| HTTP probes using imported app on temporary loopback port | Root/profile/register returned 200; unknown route returned HTML 404 |
| `SELECT 1` with existing environment configuration | Failed with PostgreSQL code XX000; no database mutations |
| `prisma.cmd migrate status --config prisma7.config.ts` | Failed, generic schema engine error; live status unknown |
| Tests | No tests or test script exist |
| Ignore checks | `.env`, node_modules and generated Prisma client are ignored |

PowerShell blocked the `npm` script shim; `npm.cmd` worked without changing execution policy. Initial sandbox networking blocked loopback HTTP; those probes were repeated successfully with approved network access. The HTTP check imported `app.ts` directly and therefore does not prove `server.ts` can pass its database startup gate. No user data was queried, no goal was created, no migration was applied, and no dependencies were upgraded. No external vulnerability advisory audit was performed; this report does not certify dependency security or historical Git secret safety.

## G. Completion estimate

Approximately **3–5% of the full stated production product**, a judgment based on the breadth of the 16 modules rather than a calculated metric. Only backend scaffolding and one goal write path exist. None of the 16 complete product modules is delivered; authentication/profile are placeholders, goals are partial, and the remaining modules are absent. Phase 0 has documentation and source verification, but live database verification and build repair remain open.

## H. Next milestone

Recommend a small **foundation repair and verification** milestone: resolve the compiler include boundary; introduce a secret-free environment example and explicit Prisma commands; diagnose read-only DB connectivity/migration status; then verify normal server startup. Next establish validated API/error handling and remove request-body exposure before implementing secure authentication and goal ownership. See ROADMAP.md for the full ordered checklist. Substantial source changes await the owner's approval.
