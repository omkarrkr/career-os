# CareerOS

> AI-powered career operating system for engineering students.

CareerOS is a full-stack AI platform that helps engineering students with:

- Personalized AI career roadmaps
- Resume analysis
- ATS score improvement
- AI career mentor
- Mock interviews
- Skill tracking
- Career progress dashboard

## Current Status

The backend foundation is verified. The frontend (React + TypeScript + Tailwind CSS) is **not yet built** — this repo currently contains only the Node.js/Express backend. Goal creation validates input and registration creates users with bcrypt-hashed passwords and public-field-only responses. Login, refresh rotation, logout and a protected real-user profile are implemented. Goal creation/list/detail now require a valid session and restrict access to the signed-in owner. Existing unassigned goals stay hidden pending verified account linkage; this is not a production-ready multi-user API.

The first release connects a target role, skill/project evidence, explained gaps, goals, a roadmap and a reviewed AI weekly plan. The features above describe the longer-term vision. See [the active milestones](docs/ROADMAP.md), [architecture](docs/ARCHITECTURE.md) and [historical audit](docs/PROJECT_AUDIT.md).

## Tech Stack

### Frontend (planned)
- React
- TypeScript
- Tailwind CSS

### Backend
- Node.js
- Express.js
- TypeScript
- Prisma ORM (PostgreSQL)

### Database
- PostgreSQL (via Supabase)
- Prisma ORM

### AI
- Planned: one LLM provider behind a separate AI service interface. No AI integration exists yet; Gemini was an early option.

## Backend Architecture

```
backend/
├── src/
│   ├── server.ts           # Loads/validates settings, starts server, handles shutdown signals
│   ├── server-lifecycle.ts # Connect-before-listen and bounded HTTP/database cleanup
│   ├── app.ts              # Express app: JSON middleware, health-check route, mounts routers
│   ├── config/
│   │   ├── env.ts          # Validates DATABASE_URL and PORT without exposing values
│   │   └── prisma.ts       # Singleton PrismaClient wired with the PrismaPg adapter (pg driver)
│   ├── controllers/        # HTTP layer — parses request/res, calls services
│   │   ├── goal.controller.ts
│   │   └── user.controller.ts
│   ├── services/           # Business logic layer
│   │   ├── goal.service.ts      # prisma.goal.create(...)
│   │   ├── user.service.ts      # Registration and public profile lookup
│   │   └── auth.service.ts      # Credential login, session/refresh rotation and revocation
│   ├── routes/             # Express routers
│   │   ├── goal.routes.ts       # Owned create/list/detail
│   │   ├── user.routes.ts       # Protected profile, public registration
│   │   └── auth.routes.ts       # CSRF bootstrap, login, refresh and logout
│   ├── middleware/         # HTTP security, bearer authentication and safe errors
│   ├── utils/              # Password hashing, token helpers and API errors
│   └── generated/prisma/   # Auto-generated Prisma Client
├── prisma/
│   ├── schema.prisma       # Goal, User, AuthSession and RefreshToken models
│   └── migrations/         # SQL migrations
├── .env                    # Private database, independent auth secrets and HTTP settings
├── package.json
└── tsconfig.json
```

### Data Model

```prisma
model Goal {
  id          Int      @id @default(autoincrement())
  title       String
  description String?
  category    String
  status      String   @default("ACTIVE")
  targetDate  DateTime?
  createdAt   DateTime @default(now())
  userId      Int?
}
```

This Goal field excerpt omits relation/index declarations; see the active Prisma schema for the full definition. User, AuthSession and RefreshToken support registration and login/session logic. Legacy Goal ownership remains nullable; new writes derive userId from the session and reads filter by owner. The Goal Data API is restricted with RLS; existing goals remain unassigned until explicit owner verification/backfill.

## API Endpoints

| Method | Path                  | Description              |
|--------|-----------------------|--------------------------|
| GET    | `/`                   | Health check / app info  |
| POST   | `/api/goals`          | Create a goal owned by the signed-in account |
| GET    | `/api/goals`           | List own goals with bounded cursor pagination |
| GET    | `/api/goals/:id`       | Read own goal; foreign/legacy/missing returns 404 |
| GET    | `/api/users/profile`   | Return authenticated account's public profile |
| POST   | `/api/users/register`  | Validate signup, hash password and create a user; return public fields |
| GET    | `/api/auth/csrf`       | Bootstrap session-bound CSRF protection |
| POST   | `/api/auth/login`      | Verify credentials and start a session |
| POST   | `/api/auth/refresh`    | Rotate refresh cookie and issue access token |
| POST   | `/api/auth/logout`     | Revoke current session and clear auth cookies |

## Getting Started

### Prerequisites
- Verified development environment: Node.js v24.22.1 and npm 11.19.1. Other versions have not been verified for this repository.
- A PostgreSQL database (e.g., [Supabase](https://supabase.com/))

### Setup

```powershell
Set-Location C:\PROJECTS\career-os\backend
npm.cmd ci
```

For an existing checkout with a working `.env`, preserve it. For a new checkout, create it only if missing:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
```

Edit the placeholder `DATABASE_URL` locally using your own Supabase connection settings. Never commit or share the real value. The backend loads `.env` from the backend working directory. `.env.example` contains placeholders only.

Generate the client, validate the schema, check migration status without applying changes, and compile:

```powershell
npm.cmd run prisma:generate
npm.cmd run prisma:validate
npm.cmd run prisma:status
npm.cmd run typecheck
npm.cmd run build
```

These Prisma scripts explicitly select `prisma7.config.ts`. `prisma:status` checks migration history; it does not establish that every live database detail is free of drift. The existing database currently reports up to date. Applying migrations is a separate reviewed action, not an automatic setup repair. Never reset the database or recreate existing migrations to resolve ordinary errors.

`npm ci` installs the versions recorded in the lockfile. The Prisma CLI, client and adapter are pinned to 7.10.0. No package upgrade is required for this milestone. Windows examples use `npm.cmd` to avoid a PowerShell script-shim execution-policy issue; macOS/Linux users can use `npm` from the equivalent backend directory.

### Running

```powershell
# Development mode (hot reload)
npm.cmd run dev

# Or compiled mode (stop development mode first)
npm.cmd run build
npm.cmd start
```

With the default port, expected output includes `Database connected`, then `Server is running on http://localhost:3000`. In a second PowerShell terminal:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/
```

Expect `project: CareerOS` and `status: Backend Running`. Stop the server with Ctrl+C; after successful startup, its SIGINT handler stops new connections, waits for active requests, and disconnects Prisma. Expect `Server shutdown started`, then `Server shutdown completed`. Cleanup has a 10-second deadline; failure/timeout exits with code 1 rather than claiming success. SIGTERM is handled for hosting platforms that deliver it. Force-killing a process bypasses graceful handling. The root route returns application information, not a continuous database readiness check. Do not run both modes on the same port.

If the database check fails, preserve `.env` and collect only sanitized error details. If port 3000 is occupied, identify your existing server before stopping anything.

### Tests

From `backend`, run `npm.cmd test`. The Node test runner uses tsx to import TypeScript. Tests use temporary local servers, dummy database settings and in-memory database stand-ins; no Supabase connection or records are used. Coverage includes API validation/errors/non-disclosure and startup settings, occupied ports, request draining, cleanup failures/timeouts, repeated shutdown events and entry-point failure safety. Signal wiring tests emit Node events internally; they do not claim to test real OS signal delivery. See [API contracts](docs/API.md). These are not live-database integration tests.

### M2 authentication database foundation

Migration `20261123140042_add_auth_sessions_and_goal_owner` adds account/session tables and nullable Goal.userId, with indexes, restrictive foreign keys and RLS on the three credential/session tables. It was rehearsed on an isolated native PostgreSQL 17 restore, then applied on 23 November 2026. Existing goal values and original migration history were preserved; no ownership backfill or account creation occurred during migration. Registration now creates accounts but does not sign them in or claim old goals.

The active schema/migrations are authoritative; [the proposal folder](backend/prisma/proposals/auth/README.md) is now historical reference. `npm.cmd run test:migration:auth` tests the committed migration against fictional old goals in PGlite, including preservation, uniqueness, references, transaction rollback and ordinary-role RLS denial. The default suite currently reports 80 passing tests. Keep backup/recovery artifacts local and ignored. For another environment, review pending SQL and deployment readiness before applying committed migrations with `prisma migrate deploy --config prisma7.config.ts`; regenerate the runtime client after its target schema is compatible. Do not replay the archived proposal SQL or edit applied migration history.

### Registration

POST /api/users/register accepts name, email and password; see [the API contract](docs/API.md). Identity strings are trimmed and email is lowercased. Passwords are unchanged, at least 15 Unicode code points and at most 72 UTF-8 bytes; bcrypt cost 12 uses a random salt. Responses include only id/name/email/createdAt. Duplicate normalized emails return 409, including concurrent signup races. Signup has its own 10-attempt/IP/15-minute limit before hashing. This explicit conflict response reveals email registration status; reconsider that tradeoff with the future verification/recovery flow. Email verification and comprehensive compromised-password screening remain future work. Login/session behavior is described below.

`npm.cmd run test:integration:registration` exercises real Prisma/PostgreSQL registration using TEST_DATABASE_URL. It skips without that variable and refuses non-loopback URLs, query overrides, database names without the `careeros_test_registration_` prefix, or a nonempty public schema. Supply a fresh disposable database named `careeros_test_registration_<suffix>` on your own local PostgreSQL server. The integration suite applies committed migrations and inserts fictional data; never point it at the application database. It verified hash storage, real duplicate-error mapping, simultaneous duplicate requests and no session/legacy-goal claiming. The default unit/API suite uses stand-ins for persistence; the separately run integration suite reports five passing tests including its parent.

### Login and sessions

See [the authentication API flow](docs/API.md#browser-authentication-and-sessions). Access JWTs last up to 15 minutes and are checked against a database session on protected requests. HttpOnly refresh cookies rotate on use; consumed-token reuse revokes the session. Sessions expire absolutely after seven days. Logout revokes the current session and clears cookies. The profile route now returns only the authenticated account’s public fields. Owned goal creation/list/detail are implemented. Verified legacy backfill, update/delete and password change remain pending.

Set both auth secrets in your private backend/.env using independent crypto.randomBytes(32) values encoded as hex; placeholders in .env.example are intentionally invalid. Never use the public test-only keys from tests/setup-env.mjs for a real environment. Keep access/CSRF tokens in memory in the future UI, and serialize refresh requests across tabs. Production requires HTTPS and same-site frontend/backend hosting under the current cookie policy.

`npm.cmd run test:integration:auth` requires a fresh local PostgreSQL database named `careeros_test_auth_<suffix>` through TEST_DATABASE_URL. It refuses non-loopback targets, URL query overrides and nonempty schemas, applies committed migrations and inserts fictional fixtures. It verifies credential failures, public profiles, rotation, replay, concurrent refresh, logout and expiry. The separately run native suite reports eight passing tests including its parent; registration still reports five.

### Goal ownership

Goal routes require a valid Bearer token and active session. POST assigns ownership from that session, ignoring a submitted userId. GET list/detail query only the signed-in owner; foreign/missing/NULL-owned goal details share a 404 response. Lists use limit (default 20, maximum 50) and afterId cursor pagination. Update/delete remain later work.

Migration 20261124120000_protect_goal_data_api enables Goal RLS without public policies, preventing ordinary direct Supabase API access from bypassing the backend. It was applied after a fresh scoped backup/restore proof and native PostgreSQL rehearsal; goal rows and unassigned ownership were preserved. Backend owner/admin roles still need application ownership checks.

`npm.cmd run test:integration:goals` requires a fresh loopback database named careeros_test_goals_<suffix> through TEST_DATABASE_URL, refuses query overrides/nonempty schemas, and verifies two-user isolation, spoofed ownership, legacy preservation, pagination, revocation and direct-role RLS denial. Nine reported tests pass including the parent; registration/session suites report five/eight. No automated fixtures are written to Supabase.

## Environment Variables

| Variable       | Description                  |
|----------------|------------------------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_JWT_SECRET` | Required random 32-byte secret encoded as 64 hex characters |
| `AUTH_CSRF_SECRET` | Required independent random 32-byte secret encoded as 64 hex characters |
| `PORT` | Optional HTTP port, integer 1-65535; defaults to 3000 |
| `NODE_ENV` | development (default), test, or production |
| `CORS_ORIGINS` | Comma-separated exact HTTP(S) frontend origins; absent/empty allows no explicit browser origins |

Startup validates settings before constructing the database client. Missing/invalid settings produce a message containing setting names only and exit code 1. A well-formed URL can still have incorrect credentials or point to an unavailable database: syntax validation does not prove connectivity. If you select a different port, use that port in browser/API requests too. Never overwrite your working `.env` with the example template.

## HTTP safeguards

Helmet supplies security headers and hides Express's identifying header. HTTPS-only browser directives are enabled in production mode and disabled for local development; production hosting still must actually provide HTTPS.

Set `CORS_ORIGINS=http://localhost:5173` locally when the future Vite frontend needs access. Origins must match exactly, with no path, credentials, wildcard or trailing slash; multiple origins are comma-separated. Keep your private `.env` local; auth setup requires two independent secrets. An explicit unapproved Origin receives JSON 403 before route processing. No-Origin root/goal clients such as PowerShell still work; goal operations require a Bearer token. CORS covers GET/POST and Content-Type/Authorization/X-CSRF-Token. Cookie credentials are enabled only on /api/auth paths for exact approved origins. Unsafe auth writes additionally require a trusted Origin/Referer and CSRF protection. CORS is not authentication or a replacement for CSRF protection.

API paths share a limit of 100 requests per IP per 15 minutes, counting successes and failures. Exceeding it returns JSON 429 with Retry-After and standard rate-limit headers. Approved CORS preflights and the root app-information route do not consume that budget. The counter is in memory per server process, resets on restart, and is not distributed DDoS protection; shared-IP users also share a budget. Express retains trust-proxy=false so caller-supplied forwarding headers cannot choose their own rate-limit identity. Review the actual trusted proxy chain and shared counter requirements before production deployment.

POST /api/users/register additionally has a 10-attempt/IP/15-minute budget; failed attempts count too. These IP-based limits do not provide complete account-abuse prevention.

## Roadmap

- [ ] Build React frontend (TypeScript + Tailwind)
- [ ] User authentication
- [ ] Resume analysis & ATS scoring
- [ ] Validated AI weekly planning first; broader career assistant later
- [ ] Mock interview module
- [ ] Skill tracking
- [ ] Career progress dashboard

## License

ISC
