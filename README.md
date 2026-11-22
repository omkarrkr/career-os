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

The first release connects a target role, skill/project evidence, explained gaps, goals, a roadmap and a reviewed AI weekly plan. The features above describe the longer-term vision. See [the active milestones](docs/ROADMAP.md), [architecture](docs/ARCHITECTURE.md), [historical audit](docs/PROJECT_AUDIT.md) and [learning notes](docs/MILESTONE_NOTES.md).

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
│   ├── server.ts           # Entry point: loads dotenv, connects Prisma, starts HTTP server on :3000
│   ├── app.ts              # Express app: JSON middleware, health-check route, mounts routers
│   ├── config/
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
| POST   | `/api/users/register`  | Placeholder: logs/echoes submitted JSON; do not send credentials |

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

Expected output includes `Database connected`, then `Server is running on http://localhost:3000`. In a second PowerShell terminal:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/
```

Expect `project: CareerOS` and `status: Backend Running`. Stop the server with Ctrl+C. The root route returns application information, not a continuous database readiness check. Do not run both modes on port 3000 at the same time.

If the database check fails, preserve `.env` and collect only sanitized error details. If port 3000 is occupied, identify your existing server before stopping anything.

### Tests

From `backend`, run `npm.cmd test`. The Node test runner uses tsx to import the TypeScript app. API tests start a temporary loopback server and replace Prisma goal writes with an in-memory test double using a dummy database URL; no Supabase connection or records are used. Tests cover invalid goal data, valid requests, deadlines, unexpected fields, malformed JSON and oversized bodies. See [API contracts](docs/API.md) and [learning notes](docs/MILESTONE_NOTES.md). These are API tests with database access replaced, not live-database integration tests.

## Environment Variables

| Variable       | Description                  |
|----------------|------------------------------|
| `DATABASE_URL` | PostgreSQL connection string |

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
