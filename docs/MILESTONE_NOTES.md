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
