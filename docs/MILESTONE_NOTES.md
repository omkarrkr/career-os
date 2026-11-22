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

## M1, step 1: goal validation and safe parser errors

### Feature and project notes

Invalid goal requests now stop before database access. Zod 4.6.7 was added as the only new package. `src/schemas/goal.schema.ts` defines accepted fields. The goal controller uses validated output, returning 400 with field messages on failure; valid requests keep the existing 201 response. See API.md for exact limits and date formats. No authentication, schema migration or database write was added by this task.

### New concepts in simple words

- Validation: checking information before using it. TypeScript cannot stop someone sending a number as a title over HTTP; a runtime validator can.
- Schema: a checklist describing accepted data. This request schema is distinct from Prisma's database schema: one checks API input, the other describes stored records.
- `safeParse`: checks an unknown value and returns either validated data or a list of problems, letting the controller choose a response without using an exception for ordinary invalid input.
- Middleware: a function Express runs during request processing. Error middleware has four parameters, including `next`, so Express recognizes its special role.
- JSON parsing: converting the request's text into JavaScript data. Malformed JSON fails here, before field validation can run.
- Test double: a stand-in for a real dependency. API tests replace Prisma goal creation so they can exercise HTTP behavior without changing the real database.
- HTTP 400 means invalid request; 413 means body too large; 415 means unsupported request format/encoding; 500 means an unexpected server failure. A 201 still means a goal was created.

### Data flow and important decisions

Request -> Express JSON parser -> route -> controller/schema -> service -> Prisma -> database. Parser failures skip the route and reach final error middleware. Validation failures return 400 without calling the service. The controller passes `result.data`, not the original request body, so trimming and supported-field selection actually take effect.

Titles/categories are trimmed and bounded; descriptions are optional and preserve empty strings. Categories remain free text rather than introducing an enum prematurely. Deadlines accept valid calendar dates or timezone-qualified timestamps; ambiguous local timestamps and impossible calendar dates are rejected. Extra fields are ignored as before and cannot set id/status. Date-only values retain the existing service's UTC-midnight interpretation; future calendar semantics need an explicit product decision.

The final error middleware formats malformed JSON/oversized bodies, preserves other parser 4xx statuses with a generic response, and hides unexpected error details. It does not yet replace the goal controller's local catch/log. JSON 404 and removal of registration's raw-body logging/echo are still pending. Tests caught the parser returning HTML for a null body; fixing the parser-error boundary made that behavior safe JSON instead.

### Run and verify

From PowerShell:

```powershell
Set-Location C:\PROJECTS\career-os\backend
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
```

Expected: successful compilation and 23 passing tests (22 API subtests plus their parent). Tests start a temporary local server, use a dummy database URL and replace Prisma writes; they do not query Supabase. They cover rejected field/body values, date formats, ignored extra fields, successful responses, parser failures and no persistence calls for invalid requests. This does not test real PostgreSQL insertion or authorization.

To try a safe invalid request manually, start `npm.cmd run dev`, then in a second PowerShell terminal run:

```powershell
try {
    Invoke-RestMethod -Uri http://localhost:3000/api/goals -Method Post -ContentType application/json -Body '{"title":"   ","category":"Development"}'
} catch {
    $_.ErrorDetails.Message
}
```

Expect 400 with `Invalid goal data` and a title error. No goal is inserted for that invalid request. Valid manual requests would write to the configured database, so use the automated test suite for repeated success checks.

### Interview Q&A

Q: Why do we need validation when we use TypeScript? A: TypeScript checks our source code, while incoming HTTP data comes from outside that type system.

Q: Why use validated data afterward? A: It contains the checked/normalized fields; using the original body would discard those guarantees.

Q: Why is error middleware mounted after routes? A: Errors flow forward through Express's registered handlers, so the final handler can catch parser and route errors.

### Common mistakes and challenge

Avoid returning entire invalid payloads, treating client mistakes as 500s, relying only on `new Date` to detect impossible calendar dates, and running tests against real user data. A test double proves HTTP-to-service behavior, not live database integration.

Challenge: predict the response to `{ "title": " Learn SQL ", "category": "Development", "status": "COMPLETED" }`. Explain which fields reach Prisma and why the client cannot choose status through this endpoint.

## M1, step 2: safe placeholders and shared API errors

### What changed and why

Registration is not implemented, so the endpoint now honestly returns 501 with a fixed message. It no longer logs or echoes incoming data. The route remains available for replacement with real registration in M2. Goal creation no longer catches/logs raw database errors locally; unexpected failures flow to shared error middleware. Unknown paths and unsupported methods return JSON 404 without reflecting the URL/query string. Successful goal/root/demo-profile contracts stay unchanged; goal failure responses now use the shared generic message.

### New concepts and architecture

- Centralized error handling: one shared place decides how unexpected request failures are logged and returned. This keeps controllers focused and prevents inconsistent error leaks.
- Async rejection: an asynchronous operation can fail instead of returning a result. Express 5 forwards rejected route-handler promises to error middleware, so the controller can await its service without a duplicate catch.
- 404: no route handles this method/path. This app uses a safe fixed JSON message.
- 501: the requested feature has not been implemented. Returning this for the placeholder avoids falsely claiming an account was created.
- Git commit versus push: a commit saves a local checkpoint; a push sends commits to the configured remote repository. A normal push does not overwrite divergent remote history. GitHub browser sign-in and command-line Git credentials can differ.

Flow: JSON parser -> route/controller -> service -> success response. On unexpected failure: rejected promise -> shared error middleware -> fixed safe log event + generic 500. When no route matches: JSON 404 handler. The 404 handler belongs after routes, before the final error middleware.

### Files and verification

`user.controller.ts` stops raw-body handling; `goal.controller.ts` delegates failures; `error.middleware.ts` exports the 404 handler; `app.ts` mounts handlers in order. `tests/api-safety.test.mjs` adds credential non-disclosure and route regression tests; the goal tests add a simulated database-failure case. All tests use a dummy URL, and goal writes are replaced in memory.

In PowerShell under `C:\PROJECTS\career-os\backend`, run `npm.cmd run typecheck`, `npm.cmd run build`, then `npm.cmd test`. Expected: no compiler errors and 29 passing tests (27 API cases and two parents). No real database reads/writes are involved. New assertions check both response bodies and console calls for accidental disclosure.

### Interview Q&A, common mistakes and challenge

Q: Why not return the underlying database error? A: Internal messages can contain private details; clients need a safe stable response, while operational logging should deliberately select safe diagnostic fields.

Q: Why remove the local catch? A: Express 5 already forwards asynchronous failures. The shared handler provides one consistent policy without repeating it in every controller.

Avoid pretending placeholder registration succeeded, logging whole request bodies, returning request URLs that may contain tokens, and assuming a browser login guarantees Git push authentication.

Challenge: explain why an invalid title returns 400, a missing route returns 404, placeholder registration returns 501, and a database outage returns 500. Next we will validate startup settings and handle shutdown safely; M1 is still in progress.

## M1, step 3: check settings and stop cleanly

### What we built, in plain English

Think of the backend as a shop. Before opening, it checks its address/settings and makes sure its database is available. At closing time, it stops letting new people in, finishes serving people already inside, then closes the database connection. If closing gets stuck, it reports failure instead of waiting forever.

The server now checks DATABASE_URL and PORT before starting. PORT is the numbered entrance where it receives HTTP requests: our usual value is 3000. You can choose another integer from 1 to 65535; leaving PORT absent still uses 3000. Existing `.env` values were not edited.

DATABASE_URL must have PostgreSQL URL structure, a host and a database path. The checker reports setting names without printing values. It cannot tell whether the password is correct or the database is reachable; connecting is a separate check.

### The new concepts

- Startup validation: checking settings before opening the server. For example, PORT=70000 is rejected immediately rather than becoming a confusing listen error later.
- Signal: a message asking a process to stop. Ctrl+C normally produces SIGINT; hosting platforms commonly use SIGTERM. Support/delivery depends on the operating system.
- Graceful shutdown: stop accepting new connections, let current requests finish, then release database connections.
- Timeout/deadline: a maximum wait. We allow 10 seconds for shutdown. After that, remaining HTTP connections are closed and the process exits with failure.
- Exit code: a number telling the operating system how the program ended. We use 0 for a successful stop and 1 for configuration/startup/cleanup failure.
- Repeated-safe cleanup: pressing stop twice must not disconnect twice. The code remembers and returns the same cleanup promise.
- A promise represents work that may finish later. We wait for cleanup, but also race it against the deadline. The first completion determines whether shutdown succeeded in time.

### Which files do what?

| File | Simple responsibility |
| --- | --- |
| `src/config/env.ts` | Read and validate settings with Zod; return safe error names |
| `src/config/prisma.ts` | Use the validated database URL for Prisma |
| `src/server-lifecycle.ts` | Connect, listen, stop HTTP, disconnect database, enforce shutdown deadline |
| `src/server.ts` | Load environment, validate first, start the app and wire stop signals/logs |
| `.env.example` | Explain the optional PORT setting without real credentials |
| `tests/env.test.mjs` | Check settings and entry-point failure/signal wiring |
| `tests/server-lifecycle.test.mjs` | Check start/stop order, port conflict, request draining and cleanup failures |

We keep the start/stop function separate so tests can supply a fake database object. This is often called dependency injection: giving a function the tool it needs instead of making it always reach for the real tool itself.

### Data flow

```text
Start: load .env -> validate settings -> create database client
       -> connect database -> listen on PORT

Stop after startup: SIGINT/SIGTERM -> stop new connections
       -> finish active requests -> disconnect Prisma -> successful exit
       or -> cleanup error/deadline -> safe failure message and exit code 1
```

The shutdown handlers are installed after successful startup. Startup failures attempt a database disconnect and report a safe fixed message. A hard kill cannot be cleaned up by JavaScript. We are not claiming that a database connection attempt itself has a new 10-second deadline; the new deadline applies to shutdown.

### What we tested

Type checking/build pass; the full runner reports 43 passing tests including its two parent tests. New checks cover missing/invalid settings, safe error output, custom/default ports, connect-before-listen, occupied ports, an active request finishing before database disconnect, repeat stops, stuck requests, stuck/failed database cleanup, and entry-point signal handlers.

Signal tests emit SIGINT/SIGTERM events inside a test subprocess with fake database methods. This proves our handlers are wired; it does not reproduce actual OS signal delivery. Other lifecycle tests use real temporary local HTTP servers. No Supabase access, application data writes, migrations or dependency upgrades were needed.

### Commands and expected output

In PowerShell:

```powershell
Set-Location C:\PROJECTS\career-os\backend
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
```

Expect no compiler errors and 43 passing tests. These checks are already run by the agent; you can repeat them for learning.

Optional manual check using your existing configured database: run `node dist/server.js`, then press Ctrl+C in that terminal after the startup messages. Expect `Server shutdown started` followed by `Server shutdown completed`. This optional real-environment check was not needed for the automated test suite. If another server owns the chosen port, identify it or select a free PORT instead of killing an unknown process. Do not paste `.env` or credentials into chat.

### Interview questions, mistakes and a small challenge

Q: Why validate before making the database client? A: Invalid settings should produce a clear safe error before infrastructure starts.

Q: Why close HTTP before disconnecting Prisma? A: A request already being handled may still need its database connection to finish.

Q: Why use a shutdown deadline? A: A stuck request or database cleanup should not keep a deployment waiting forever. A timeout is a failure and may interrupt remaining work.

Common mistakes: confusing a valid-looking URL with a working login; logging whole connection errors; disconnecting the database while active requests need it; assuming force-kill runs cleanup; claiming simulated signal tests prove real OS behavior.

Challenge: a request is halfway through saving a goal when you press Ctrl+C. Explain why immediately disconnecting Prisma could break it, and what our shutdown order does instead.

For the underlying Node behavior, see [HTTP server close](https://nodejs.org/api/http.html#serverclosecallback) and [signal events](https://nodejs.org/api/process.html#signal-events). Next: basic HTTP security headers, request rate limits and frontend-origin policy. M1 is still in progress.

## M1, step 4: basic HTTP safeguards (M1 complete)

### What we built, in simple words

Imagine a reception desk. It checks the stated website address, gives browsers safety instructions, and stops one IP address from making unlimited API requests in a short time. These are useful safeguards, but the desk still needs proper user identification: that is M2 authentication and ownership.

- Security headers: instructions attached to a response. Helmet adds them for us. For example, `nosniff` tells the browser to respect the declared content type instead of guessing. Helmet also removes the Express-identifying header.
- Origin: a website's protocol + host + port, such as `http://localhost:5173`. A path is not part of an origin. Different ports are different origins.
- CORS: browser permission rules for reading responses across origins. Our configuration lists exact approved origins; we also explicitly reject unapproved Origin headers before routes. Anyone can use a non-browser tool and omit/spoof Origin, so this never proves who a user is.
- Preflight: a browser's OPTIONS request asking whether a cross-origin request method/headers are allowed. Approved preflights return 204 and do not use the API rate budget.
- Rate limit: an upper request allowance. We currently allow 100 requests per IP in a 15-minute window on /api paths, counting failed requests too. The next request returns 429 with a Retry-After delay.
- IP address: a network address, not a person. Classmates on the same network may share an address and budget. Authentication will later let some rules use user/account identity too.
- Proxy: a server between the caller and our app. We do not blindly trust forwarding headers from callers. Hosting behind a real proxy needs a deliberately configured trust rule.

### Settings and behavior

NODE_ENV can be development (default), test or production. Production enables HTTPS-only browser directives; local development does not, avoiding unexpected localhost upgrades. Setting production mode does not create HTTPS itself: hosting must provide it.

CORS_ORIGINS is a comma-separated list, for example `http://localhost:5173,https://career.example`. No wildcard, credentials, path or trailing slash is allowed. Leaving it absent/empty permits no explicit browser Origin values; PowerShell/no-Origin requests still work. The example file lists the future Vite development address, but your real `.env` was not edited. When we build the frontend, set its exact origin deliberately. CORS currently permits GET/POST and Content-Type/Authorization; cookie credentials are off until the session design is chosen.

The rate counter is held in server memory. Restarting clears it, and separate server instances do not share it. A multi-instance deployment will need shared storage. This is basic API throttling, not protection against every large attack. Root app information remains reachable when the API limit is exhausted.

### Files and request flow

`src/middleware/security.middleware.ts` groups Helmet, origin policy and rate limiting. `config/env.ts` validates the new settings. `app.ts` now exports createApp so tests can create independent app instances while its default export still supports startup. Package files record the new middleware and TypeScript declarations; existing dependency versions were not upgraded.

```text
Request -> security headers -> origin check/CORS -> API rate limit
        -> JSON parser -> controller validation -> service -> Prisma
                   or -> safe 403/429 response before route/database work
```

The order matters: allowed browsers need CORS headers even on errors, and rate-limited requests should stop before expensive parsing/route work. Requests blocked by our origin guard return 403; requests allowed through the guard still need normal validation and, later, authentication.

### What passed and how to repeat it

Type checking, compilation and 52 reported tests pass (including two parent tests). New cases cover local/production headers, allowed origins/preflights, lookalike/null origins, blocked writes, empty configuration, CORS on validation errors, the 100/101 boundary and a spoofed forwarded-IP header. Everything used local servers and database stand-ins; Supabase was not accessed.

```powershell
Set-Location C:\PROJECTS\career-os\backend
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
```

Expect successful commands and 52 passing tests. These checks already ran; you can repeat them to see the behavior. To inspect headers manually on a running backend, use `Invoke-WebRequest -Uri http://localhost:3000/` and inspect its Headers property. The automated tests demonstrate rate limiting without filling your real database.

### Interview Q&A and common mistakes

Q: Does allowing only our frontend make an API private? A: No. Origin is not trusted identity, and non-browser clients do not have to follow browser CORS rules. We still need authentication and per-resource ownership checks.

Q: Why use exact origins rather than `*`? A: Browser access should be deliberately limited to intended frontends, especially before introducing authenticated requests.

Q: Why not trust every X-Forwarded-For header? A: An untrusted caller can forge it and change the apparent IP address to evade rate limits.

Q: Why keep the counter in memory initially? A: It is simple for one process. Its restart/multi-instance limits are documented, and shared storage should be added when deployment requires it.

Avoid treating CORS as login/CSRF protection, enabling cookie credentials casually, using a trailing slash in an origin, forcing HTTPS on local HTTP development, and describing process-local throttling as distributed protection.

### Small challenge and milestone recap

Explain why a forbidden browser origin gets 403, too many requests get 429, but a PowerShell request with no Origin can still reach an unauthenticated API. What protection is still missing? Answer: verified user identity and ownership authorization, which we build in M2.

M1 now provides input checks, safe API errors/placeholders, validated settings, safe startup/shutdown, HTTP headers, bounded requests and automated verification. It does not make CareerOS production-ready or multi-user secure. Next we will explain the User/session design and safe ownership migration before changing the database.

References: [Helmet](https://github.com/helmetjs/helmet#readme), [Express CORS](https://expressjs.com/en/resources/middleware/cors/), [rate-limit configuration](https://github.com/express-rate-limit/express-rate-limit/blob/main/docs/reference/configuration.mdx).

## M2, design step: accounts, sessions and keeping your old goals

Date: 23 November 2026. Explanation/planning only: no application code, Prisma schema, migration or database data changed. The full technical plan is AUTH_DESIGN.md.

### Start with an everyday example

Imagine entering a college library. Your account is your identity record. Logging in is showing evidence that you are that person. A session is the library remembering your successful sign-in. An access token is a short-lived visitor badge. A refresh token is a private pass that can renew the badge. Checking whether you may edit a particular goal is like checking whose book-loan record you are allowed to change.

### Registration, login and password hashes

Registration creates your account. It will save your name, normalized unique email and a password hash. A hash is a one-way verifier, not a password we can decrypt. On login, bcrypt checks the attempted password against the saved verifier. We never save the original password or return the hash to the frontend.

We retain bcrypt because it was part of the original project requirements. OWASP now prefers Argon2id for new systems; bcrypt has important input-length and cost constraints. We will respect its 72-byte limit rather than silently cutting passwords off, and benchmark its cost before release. Bytes are storage units, so 72 bytes is not necessarily 72 characters when a password contains Unicode/emoji. None of this is implemented yet.

### Why sessions and two tokens?

HTTP does not automatically remember who made an earlier request. After login, the frontend needs a credential for later API calls, without resending the password each time.

Proposed access-token lifetime: 15 minutes. Keep it in frontend memory and send it as Authorization: Bearer <token>. Our JWT is signed so the server can detect alteration; its contents are readable, so it must contain identifiers and expiry rather than private information.

Proposed session lifetime: 7 days absolute. Keep the random refresh token in an HttpOnly cookie: browser JavaScript cannot read that cookie. Only a hash of the random token is stored in the database. Each refresh replaces it. This is rotation: the old renewal pass stops working. Reusing an already consumed token closes that session; the frontend must coordinate refreshes so two tabs do not accidentally race.

These durations are starting design choices, not standards or running features. Do not store tokens in localStorage/sessionStorage. Password hashes and refresh-token hashes solve different problems: human passwords need slow password hashing; high-entropy random tokens can use a cryptographic lookup hash.

### Logout and authorization

A JWT does not disappear merely because a user clicks logout. We will revoke its server-side session, clear the refresh cookie, and check session validity on protected requests. Subsequent requests then fail even if the access token has not expired yet. A request already authorized and running may finish. Password change will revoke all sessions.

Authentication asks: who are you? Authorization asks: is this goal yours? If Alice owns goal 12, Bob must not read/change it merely by guessing 12. The server derives user identity from verified authentication, never from a userId supplied in the request body.

### Cookies need another safety check

Browsers automatically send cookies in some requests. CSRF is when another website tries to make a signed-in browser perform an unwanted action. HttpOnly, SameSite and CORS do not solve every case by themselves. We will build/test the CSRF checks and exact-origin rules before enabling cookie-based login/refresh/logout. Current CORS still disables cookie credentials; it will be updated deliberately alongside that feature.

### Proposed database relationships

```text
User (your identity)
  ├── Goals (your work)
  └── AuthSessions (your signed-in devices/logins)
         └── RefreshTokens (current and consumed renewal passes, stored as hashes)
```

A foreign key is a database rule that a reference must point to a real row. Goal.userId will refer to User.id. An index helps the database find a user's goals efficiently. We will not add automatic deletion rules that wipe goals when a user record is removed.

### How we preserve your goals

You confirmed all current goals are yours. We will still wait until your actual account exists and its intended identity is verified.

1. Add the account/session tables and an optional owner field to Goal. Existing goals keep their IDs and every existing value; owner starts empty (NULL).
2. Capture the exact intended old-goal set, verify your destination account and update only those unassigned goals in a reviewed transaction. This is a backfill: filling a new field on old rows. A transaction groups related changes so they succeed together or are rolled back.
3. Check that no intended goals remain unassigned, then make the owner field required in a separate migration.

Never assign old goals to the first signup. Never publish a claim-all-goals endpoint. During transition, unassigned goals are hidden from normal users. All new authenticated goals get their owner from the server's verified user identity.

Before applying remote changes, check current metadata, review additive SQL, verify in an isolated test database, and confirm a usable backup/restore route. We do not reset Supabase, recreate the initial migration, or overwrite existing rows to make development easier. Adding compatible columns/tables can still require database locks, so review remains necessary.

### What happens next?

Small steps: draft/review additive schema -> isolated migration check and backup readiness -> real registration -> login/session/refresh/logout with CSRF -> protected profile/goals -> verified ownership backfill -> required ownership.

No commands need to be run by you today. This is a docs-only checkpoint, so existing tests were not rerun or claimed as new verification. Later database tests will use isolated data, not your real goal records. Additional Supabase access is not needed for this planning step; we will explain any exact requirement when it arises.

### Interview questions, mistakes and challenge

Q: Why not store the password? A: A database leak should not immediately expose the original password. Store a suitable verifier and never log it.

Q: Why have a session table with JWTs? A: We choose to check it so logout and password changes can revoke access before a JWT expires; this adds a deliberate database lookup.

Q: Why add ownership as optional first? A: Existing rows have no user to reference yet. Optional ownership preserves them while we establish the correct identity and backfill safely.

Common mistakes: confusing signed tokens with encrypted secrets; assuming login alone prevents cross-user access; trusting a client-supplied owner ID; assigning legacy data to the first registration; assuming an HttpOnly cookie eliminates CSRF.

Challenge: Bob signs in correctly and asks to update one of your goals. Explain why authentication passes but authorization must deny the request. Then explain why the old goals should remain unassigned until your real account is verified.
