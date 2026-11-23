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

The backend foundation is verified as of 22 November 2026: type checking, compilation, database connectivity, migration status and compiled startup pass. The frontend (React + TypeScript + Tailwind CSS) is **not yet built** — this repo currently contains only the Node.js/Express backend. Goal creation now validates input and has automated API tests. User endpoints are placeholders, and goal creation is not authenticated; this is not a production-ready multi-user API.

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
│   │   └── user.service.ts      # static demo profile only
│   ├── routes/             # Express routers
│   │   ├── goal.routes.ts       # POST /api/goals
│   │   └── user.routes.ts       # GET /api/users/profile, POST /api/users/register
│   └── generated/prisma/   # Auto-generated Prisma Client
├── prisma/
│   ├── schema.prisma       # Database schema (Goal model)
│   └── migrations/         # SQL migrations
├── .env                    # Environment variables (DATABASE_URL)
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
}
```

## API Endpoints

| Method | Path                  | Description              |
|--------|-----------------------|--------------------------|
| GET    | `/`                   | Health check / app info  |
| POST   | `/api/goals`          | Create a new goal        |
| GET    | `/api/users/profile`   | Return a static demo profile |
| POST   | `/api/users/register`  | Placeholder: returns 501; does not log or echo submitted data |

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

### M2 migration proposal (not deployed)

The account/session schema and additive SQL draft are under [prisma/proposals/auth](backend/prisma/proposals/auth/README.md), outside the active schema/migration path. `npm.cmd run prisma:validate:auth-proposal` validates that draft; `npm.cmd run test:migration:auth` checks it against fictional legacy goals in an in-memory PGlite PostgreSQL engine. Those database-engine tests also run in the full test suite and check preservation, constraints and transactional rollback. They do not connect to Supabase or replace target-server staging/backup verification. No new auth tables or owner column are deployed, and registration remains a placeholder. Do not run the proposal SQL against the existing database yet.

## Environment Variables

| Variable       | Description                  |
|----------------|------------------------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Optional HTTP port, integer 1-65535; defaults to 3000 |
| `NODE_ENV` | development (default), test, or production |
| `CORS_ORIGINS` | Comma-separated exact HTTP(S) frontend origins; absent/empty allows no explicit browser origins |

Startup validates settings before constructing the database client. Missing/invalid settings produce a message containing setting names only and exit code 1. A well-formed URL can still have incorrect credentials or point to an unavailable database: syntax validation does not prove connectivity. If you select a different port, use that port in browser/API requests too. Never overwrite your working `.env` with the example template.

## HTTP safeguards

Helmet supplies security headers and hides Express's identifying header. HTTPS-only browser directives are enabled in production mode and disabled for local development; production hosting still must actually provide HTTPS.

Set `CORS_ORIGINS=http://localhost:5173` locally when the future Vite frontend needs access. Origins must match exactly, with no path, credentials, wildcard or trailing slash; multiple origins are comma-separated. Your existing private `.env` was not modified. An explicit unapproved Origin receives JSON 403 before route processing. No-Origin clients such as PowerShell still work. CORS permissions currently cover GET/POST and Content-Type/Authorization, with cookie credentials disabled; revisit this deliberately when choosing the authentication session strategy. CORS is not authentication or a replacement for CSRF protection.

API paths share a limit of 100 requests per IP per 15 minutes, counting successes and failures. Exceeding it returns JSON 429 with Retry-After and standard rate-limit headers. Approved CORS preflights and the root app-information route do not consume that budget. The counter is in memory per server process, resets on restart, and is not distributed DDoS protection; shared-IP users also share a budget. Express retains trust-proxy=false so caller-supplied forwarding headers cannot choose their own rate-limit identity. Review the actual trusted proxy chain and shared counter requirements before production deployment.

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
