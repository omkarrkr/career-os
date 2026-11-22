# CareerOS learning and milestone notes

## M0, step 1: restore compilation (22 November 2026)

### Feature and project notes

We need a reliable build before adding features. `backend/tsconfig.json` now includes `src/**/*.ts` explicitly. Previously, TypeScript's default inclusion also selected `prisma7.config.ts`, which is outside `rootDir: ./src`. The Prisma configuration stays where it is and remains available to Prisma CLI through `--config prisma7.config.ts`.

Once that error was removed, TypeScript exposed a second error: the goal service passed properties containing `undefined` to Prisma while `exactOptionalPropertyTypes` is enabled. `backend/src/services/goal.service.ts` now conditionally includes description and targetDate. Strict checking stays enabled. Date presence follows the previous truthy-value behavior; date/input validation is still pending under M1.

### Concept notes and important code

- `rootDir` defines the source directory structure used when emitting files; it does not limit which files TypeScript initially includes.
- `include` selects the project's source files. Imported dependencies are still followed.
- `outDir` specifies where compiled JavaScript is written: `backend/dist`.
- An omitted property and a property explicitly assigned `undefined` are different under strict optional-property checking.
- Conditional object spread adds optional data only when its condition holds. Description checks against `undefined` so an intentionally supplied empty string is preserved.
- Compilation checks type compatibility; it does not validate user requests or prove a database connection works.

### Architecture/data flow

Build: TypeScript source -> tsc -> JavaScript under dist -> Node starts dist/server.js.

Goal runtime flow is unchanged: request -> route -> controller -> service -> Prisma -> PostgreSQL. Only the optional fields sent by the service are constructed differently.

### Verification and commands

In a PowerShell terminal:

```powershell
Set-Location C:\PROJECTS\career-os\backend
.\node_modules\.bin\tsc.cmd --noEmit
npm.cmd run build
.\node_modules\.bin\prisma.cmd validate --config prisma7.config.ts
```

Expected: type checking completes without errors, build completes, and Prisma reports a valid schema. These commands do not apply migrations. `npm.cmd` avoids the PowerShell script shim issue observed during the audit.

An additional one-off behavioral check replaced the Prisma create method with an in-memory stub: missing optional fields were omitted, supplied description and date were retained, empty description was retained, and the service returned the stubbed record. This check did not connect to or write to PostgreSQL. It is not a persistent automated test suite.

### Interview questions and answers

1. Why did setting rootDir not exclude the Prisma CLI config? Because rootDir controls source/output structure; source selection is controlled separately by include/files and imports.
2. Why keep exactOptionalPropertyTypes enabled? It catches mismatches between absent properties and explicit undefined values, making contracts more precise.
3. Does a successful build prove the API works? No. Runtime configuration, database connectivity, input validation and HTTP behavior need separate verification.

### Common mistakes

Disabling strict checks just to silence a type error; treating generated JavaScript as source to commit; treating build success as live database verification; expecting TypeScript annotations to reject bad JSON automatically.

### Small challenge

Explain the difference between `{}` and `{ description: undefined }`, then explain why an empty description string should not be accidentally discarded by a truthiness check.

### Remaining M0 work

Read-only database diagnosis and migration verification, normal server startup, safe environment example, accurate setup instructions, and reconciliation of intended Prisma version pinning. Do not start M1 as though M0 were fully verified.

## M0, step 2: database, startup and setup verified (22 November 2026)

### What we verified

The existing Supabase connection works. A read-only SQL check returned a successful connection; migration metadata shows the initial migration finished, and Goal column metadata matches the intended model. Prisma reports the database up to date. The compiled backend connected before opening port 3000, and GET / returned 200 with project CareerOS. The temporary process was stopped afterward. No application records were read or changed, and no migration was applied. The earlier connection failure did not recur; we do not know its historical cause.

### New concepts in simple words

- Environment variable: a setting outside application source, such as DATABASE_URL. `.env` holds the real local value; `.env.example` is a safe template with invented placeholders.
- Connection string: the address and credentials needed to reach a database. Treat it like a key, not ordinary text to share.
- Connection pooler: a service that manages database connections for applications. The existing URL uses Supabase's pooler.
- Migration: saved instructions describing a database structure change. Checking status reads which instructions have been applied; applying a migration changes structure.
- Metadata: information about the database itself, such as column types or migration names, rather than people's goal records.
- Read-only transaction: a group of queries in which PostgreSQL disallows ordinary data writes. The verification transaction ended with ROLLBACK.
- Version pin: `7.10.0` selects that exact version; `^7.10.0` permits compatible newer versions during dependency resolution. We pinned existing versions without upgrading them.
- Lockfile: records resolved dependency versions so installations can be reproduced with `npm ci`. All resolved package records were preserved.

### Files and architecture

`backend/.env.example` is a safe setup template. `package.json` now provides typecheck and explicit-config Prisma generate/validate/status scripts. `package-lock.json` mirrors the three exact Prisma declarations. README documents Windows setup, expected output, secret safety and placeholder endpoints.

Normal startup: private environment settings -> shared Prisma client -> database connection -> Express listens -> browser receives JSON. Checking schema validity alone does not prove the connection; checking migration history alone does not prove every live schema detail is identical.

### Try it yourself

In PowerShell, with your existing `.env` preserved:

```powershell
Set-Location C:\PROJECTS\career-os\backend
npm.cmd run prisma:status
npm.cmd run typecheck
npm.cmd run build
npm.cmd start
```

Expected: database up to date, no type/build errors, then Database connected and Server is running. In a second terminal, run `Invoke-RestMethod -Uri http://localhost:3000/`; expect project CareerOS. Use Ctrl+C in the server terminal to stop it. These are optional repeat-verification steps: the agent already ran the equivalent checks successfully. Do not run another server on an occupied port.

### Interview questions and common mistakes

Q: Why keep a real `.env` out of Git? A: It may contain credentials. Commit a placeholder template so other developers know which settings are needed.

Q: Does checking migration status apply migrations? A: No. Checking and applying are different operations; application is reviewed separately.

Q: Why pin related Prisma packages together? A: To keep CLI, generated client and adapter on the intended tested version.

Avoid overwriting an existing `.env`, resetting a database to solve connectivity, assuming a temporary error has a proven cause, and claiming migration status verifies every security policy or schema constraint.

### Small challenge and next task

Explain why the backend should wait for its database before listening. Then describe why a goal with a missing title should produce a clear client error rather than an unexplained 500. That second question leads into M1: request validation and API safety. M0 is now verified; no authentication or production-readiness claim is implied.
