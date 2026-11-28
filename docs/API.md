# CareerOS API contracts

Updated 28 November 2026. Development base URL: http://localhost:3000. Registration, login, session refresh/logout, password changes and protected profile are implemented. Goals/subtasks, personal skills and projects use ownership-scoped APIs. Password changes revoke sessions. Production deployment and the later roadmap features remain pending.

## POST /api/goals

Requires Authorization: Bearer <accessToken>. The active session must be valid. The server sets userId from that session; a body-supplied userId is ignored. Send an application/json object:

| Field | Contract |
| --- | --- |
| title | Required string, trimmed, 1-200 characters after trimming |
| category | Required string, trimmed, 1-100 characters after trimming; free text for now |
| description | Optional string, up to 5000 characters; empty string allowed, null rejected |
| targetDate | Optional valid YYYY-MM-DD date or ISO timestamp with Z/numeric timezone offset; empty/null values rejected |

Date-only input is interpreted by the existing service as midnight UTC. Timestamps with offsets represent the corresponding instant. Future UI deadline/date semantics should be decided explicitly before introducing calendar features. Past dates are allowed; no future-only rule has been introduced. Extra fields are stripped and cannot set id, status or other database fields.

Example valid body:

```json
{"title":"Learn SQL","category":"Development","targetDate":"2026-12-15"}
```

Success remains 201 with `{message: "Goal created successfully", data: <saved Goal>}`. Goal fields include the server-assigned userId. Older NULL-owned goals are never claimed by signup or goal creation.

Invalid goal data returns 400, for example:

```json
{
  "message": "Invalid goal data",
  "errors": [{"field": "title", "message": "Title is required"}]
}
```

Errors identify fields without returning the submitted body. Malformed JSON and parser-rejected primitive bodies return 400 `{message: "Invalid JSON body"}`. Bodies exceeding Express JSON parser's default 100kb limit return 413 `{message: "Request body is too large"}`. JSON parser checks happen before controller validation. Unknown routes/methods return 404 `{message: "Route not found"}` without reflecting the URL or query string.

Unexpected goal-service failures now propagate through Express 5's async error handling to the shared final middleware, returning 500 `{message: "Internal server error"}`. The log contains only a fixed error event, not raw exception data, request bodies or credentials. This replaces the old `Failed to create goal` response. Structured diagnostics/request IDs and broader startup logging remain future work.

## GET /api/goals and GET /api/goals/:id

Both require a valid Bearer access token and active session. Lists return 200 `{data:[Goal],nextCursor:number|null}` ordered by id ascending by default (descending with sort=newest), scoped to the signed-in user. Optional limit is an integer string 1-50 (default 20); afterId is a positive PostgreSQL Int ID. Send the previous nextCursor as afterId for the next page. Invalid IDs/query values return 400 `Invalid goal ID` or `Invalid goal query`. Pagination retrieves at most 51 rows per request. Unknown query fields, including userId, cannot change the owner filter.

Detail returns 200 `{data:Goal}` only when both id and userId match. A foreign-owned, NULL-owned legacy or nonexistent goal returns the identical 404 `{message:"Goal not found"}`. Missing/invalid/revoked authentication returns 401 before goal queries. Authenticated responses use no-store. Owned PATCH/DELETE are documented below; no claim-legacy endpoint exists.

Migration 20261124120000_protect_goal_data_api enables Goal RLS without public policies, closing ordinary-role direct Supabase Data API access. It refuses unexpected existing policies. The owning backend role can still access rows and must enforce userId in every operation. Service-role/admin credentials remain privileged and must stay private. This changes security metadata only: existing goal fields and NULL ownership are preserved.

## Existing user and root routes

- GET / returns app information, not a live readiness check.
- GET /api/users/profile requires an access token and returns that account's public profile.
- POST /api/users/register creates a validated account as described below. It does not establish a session.

## GET /api/users/career-profile

Requires a Bearer access token and active session. Returns 200 `{data:CareerProfile|null,completeness:{completedFields,missingFields,totalFields:5,isComplete}}`. An account with no saved profile receives data:null and all five core fields missing; GET never creates a row. The response uses no-store. The existing GET /api/users/profile account-identity contract is unchanged.

A saved CareerProfile returns only userId, institution, degree, graduationYear, targetRole, weeklyLearningHours, interests, bio, createdAt and updatedAt. It does not include passwords, session fields or another account’s data. There is no endpoint to choose a different owner.

## PATCH /api/users/career-profile

Bearer authentication is required; cookies alone do not authorize a save. Send application/json with at least one supported field. Omitted fields retain their current values. Nullable fields accept null to clear; interests accepts [] to clear. Blank text is rejected rather than silently converted to null.

| Field | Contract |
| --- | --- |
| institution | Trimmed nonblank text, at most 200 characters, or null |
| degree | Trimmed nonblank text, at most 100 characters, or null |
| graduationYear | JSON integer 1990–2100, or null; numeric strings are rejected |
| targetRole | Trimmed nonblank text, at most 100 characters, or null; free text until a later maintained role catalog |
| weeklyLearningHours | JSON integer 1–40, or null; learning time per week |
| interests | At most 10 trimmed nonblank strings, each at most 50 characters; case-insensitive duplicates keep the first spelling |
| bio | Trimmed nonblank text, at most 1000 characters, or null |

NUL and malformed Unicode text are rejected. Unknown fields—including userId, email, passwordHash and timestamps—return 400. Invalid input returns `{message:"Invalid career profile data",errors:[{field,message}]}` without echoing submitted values. Empty patches are invalid. Missing/invalid/revoked authentication returns 401.

A first save creates the signed-in account’s row; later saves update it. Both return 200 with the same data/completeness shape as GET. The database primary key userId enforces at most one profile per account; upsert handles simultaneous first saves and preserves disjoint partial changes. Concurrent updates to the same field use last-write-wins behavior; there is no version-conflict mechanism yet. Owner ID comes only from the verified session, and query parameters cannot redirect ownership.

Completeness counts the presence of institution, degree, graduationYear, targetRole and weeklyLearningHours. Interests/bio are optional and do not affect it. This is an explicit data-entry checklist, not a skill, employability or readiness score. Clearing a core field makes it incomplete again.

Migration 20261127120000_add_career_profile creates an initially empty table with a required unique owner FK, restrictive deletes, bounded numeric/list checks and RLS without public policies. Ordinary direct Data API roles cannot read or mutate these rows. The owning backend role still scopes every query to the authenticated account. No existing account/session/goal data was rewritten and no profile was invented during rollout.

## POST /api/users/register

Content-Type: application/json. Required fields:

| Field | Contract |
| --- | --- |
| name | Trimmed nonempty text, at most 100 characters |
| email | Trimmed, lowercased valid email, at most 254 characters; uniqueness follows this application normalization policy |
| password | At least 15 Unicode code points and at most 72 UTF-8 bytes; not trimmed/normalized; NUL, malformed Unicode and whitespace-only values rejected |

Unknown fields are ignored; clients cannot choose id, passwordHash, role or ownership. Email normalization does not remove provider-specific dots or plus tags. Password length is not a guarantee of password strength; comprehensive compromised-password screening remains a public-launch prerequisite.

Success: 201 `{message:"User registered successfully",data:{id,name,email,createdAt}}`, with createdAt serialized as a date string. No password/hash/token/session fields or cookie are returned. bcrypt cost 12 generates a random salt; the hash is persisted and explicit public fields are selected from Prisma and serialized again at the controller boundary.

Validation failure: 400 `{message:"Invalid registration data",errors:[{field,message}]}` without echoing input. Duplicate email: 409 `{message:"An account with this email already exists"}`. PostgreSQL's unique constraint handles concurrency; both standard Prisma email-target metadata and the pinned PostgreSQL adapter's User_email_key constraint metadata are recognized. Unrelated uniqueness/database failures remain generic 500 errors, with no raw exception in response/logs.

Signup requests have an additional 10-attempt/IP/15-minute budget, before parsing/hashing; exhaustion returns 429 `{message:"Too many registration attempts; try again later"}`. The existing API-wide budget also applies. This explicit 409 makes registered email existence observable; privacy-preserving email-verification/recovery design remains future work.

Registration does not log credentials, authenticate a user, issue tokens, create sessions or assign legacy goals. A valid manual request writes to the configured database; use the automated suites with fictional isolated data for practice rather than repeatedly creating live test accounts.

## Browser authentication and sessions

Configure the frontend's exact origin in CORS_ORIGINS. Browser calls to /api/auth use `credentials: "include"`. Unsafe auth requests require application/json, a trusted Origin (or trusted Referer origin when Origin is absent), matching cookies and X-CSRF-Token. Missing/invalid CSRF returns 403; unsupported content returns 415. Auth responses use Cache-Control: no-store.

1. GET /api/auth/csrf returns 200 `{csrfToken}` and sets anonymous binding and signed CSRF cookies. Keep the returned token in memory.
2. POST /api/auth/login sends `{email,password}` with X-CSRF-Token. Email/password validation follows signup's normalization and password boundaries. Invalid structure returns 400 `Invalid login data`; unknown account and incorrect password both return 401 `Invalid email or password`. Unknown accounts still perform a bcrypt comparison.
3. Successful login returns 200 `{message:"Logged in successfully",data:{accessToken,expiresIn,user:{id,name,email,createdAt},csrfToken}}`. Replace the in-memory CSRF token with this new session-bound value. The refresh token is sent only in an HttpOnly cookie, never in JSON.
4. GET /api/users/profile sends `Authorization: Bearer <accessToken>` and returns 200 `{success:true,data:{id,name,email,createdAt}}`. It verifies JWT identity and the database session before reading this user's public fields. Missing, invalid, expired or revoked authentication returns 401 `Invalid or expired session`. Cookies alone do not authenticate profile requests.
5. POST /api/auth/refresh sends `{}` with the session's CSRF header and cookies. Success returns 200 `{data:{accessToken,expiresIn}}` and replaces the refresh cookie. Invalid/expired/reused refresh credentials return 401 and clear all auth cookies. CSRF errors leave cookies intact. After reload, fetch /csrf with existing cookies before refreshing to recover an in-memory CSRF token.
6. POST /api/auth/logout sends `{}` with CSRF header and cookies. It revokes the matching session, clears all three cookies and returns 204. Existing access tokens for that session fail subsequent authentication. Already-authorized requests may finish. An unknown/already-revoked session is harmless when the request passes CSRF; database errors return safe 500 rather than falsely reporting revocation.

Access JWTs use HS256 with fixed issuer/audience/type and normally last 900 seconds. `expiresIn` is capped by the session's absolute expiry: seven days from login, without extension on refresh. JWTs are signed, not encrypted, and contain only identity/time claims. Keep access/CSRF tokens in memory, outside URLs/logs/localStorage. Only SHA-256 refresh hashes are stored, alongside consumed-token history. Refresh uses a database session-row lock; reusing a consumed token revokes the session in a committed transaction.

Serialize refreshes across the frontend, including tabs. Two requests with the same refresh token intentionally produce one success and one denial that revokes the session; the winner's token also becomes unusable. Do not blindly retry an ambiguous refresh network failure; require sign-in when the outcome is unknown. Expired/revoked refresh should clear frontend state and return to login.

Production cookies are `__Host-careeros_refresh`, `__Host-careeros_binding`, and `__Host-careeros_csrf`: Secure, HttpOnly, SameSite=Lax, Path=/, without Domain. Development uses `careeros_` names without Secure for local HTTP. This expects same-site frontend/backend deployment; different-site hosting needs a cookie/CSRF review. CORS_ORIGINS must include even a same-origin UI's origin for unsafe auth requests. CLI auth writes require a configured Origin/Referer plus cookies and CSRF.

Login allows 10 attempts/IP/15 minutes; /api/auth also has a 60-request/IP/15-minute budget, and the API-wide limit applies. Failed CSRF/validation attempts count. No schema change, real-account creation or legacy-goal claiming was needed. Legacy backfill and required ownership are complete. Password change is described below. Verification/recovery and session-history cleanup remain later work.

## POST /api/auth/change-password

Requires a valid Bearer access token, active session, approved Origin/Referer, application/json, session cookies and X-CSRF-Token. The binding cookie must match the Bearer token’s session ID; mixing browser sessions returns 403 `Session binding mismatch`. Send `{currentPassword,newPassword}`. Extra fields cannot select a different account. Both passwords retain exact characters and use signup’s 15-code-point/72-UTF-8-byte boundaries; newPassword must differ.

Invalid structure/policy returns 400 `Invalid password change data`. Incorrect current password returns 400 `Current password is incorrect`; hash/session state is unchanged. Missing/expired/revoked authentication returns 401; origin/CSRF failures return 403. A dedicated five-attempt/IP/15-minute limit applies before parsing, in addition to auth/API budgets; exhaustion returns 429 `Too many password change attempts; try again later`.

Success returns 200 `{message:"Password changed successfully; sign in again"}`, clears all three auth cookies and uses no-store. A transaction saves a new salted bcrypt cost-12 hash and revokes ALL existing sessions for that account, including the calling session; other accounts are untouched. No password/hash/token is returned. The frontend must discard in-memory access/CSRF state and ask for sign-in. This changes a known password; it is not a forgotten-password/reset endpoint.

Login and password change lock the same User row. Login rechecks the hash after locking before creating a session, preventing an old-password login from creating a late session after the change. Password change rechecks current hash and calling session under this lock, then updates hash and revokes sessions atomically. A concurrent refresh either fails or produces a token whose session is revoked by the completed password change. Already-authorized in-flight requests may finish. Unexpected failure rolls the transaction back and returns safe 500 without clearing cookies or falsely reporting success.

## Mandatory database ownership

After verified account linkage/backfill, migration 20261126190000_require_goal_owner makes Goal.userId NOT NULL while retaining its foreign key, index and RLS. It refuses to run when NULL owners remain and never assigns an owner automatically. Missing/NULL owners are rejected at the database layer as well as by application logic. Existing goal/account/session values were preserved through a fresh backup/restore and exact SQL rehearsal. Historical migration tests still exercise the earlier nullable transition; current integration fixtures use explicit fictional owners.

## Response convention

Keep current success contracts to avoid unnecessary rewrites. Errors return a safe `message`; validation errors additionally include `errors` with field/message pairs. Clients use HTTP status to distinguish request mistakes, missing routes, unavailable features and unexpected server failures. No raw error stack or arbitrary internal error message is exposed.

## Verification

`npm.cmd test` runs API behavior checks with goal persistence replaced in memory. `npm.cmd run typecheck` and `npm.cmd run build` verify application TypeScript. No live database insert is required by this suite.

## HTTP policies

Helmet headers precede routes and errors. In production, HSTS and CSP upgrade-insecure-requests are enabled; development/test avoid forcing local HTTPS. These headers do not install a TLS certificate or provide transport encryption themselves.

Origins are exact HTTP(S) origins from CORS_ORIGINS, separated by commas. Absent/empty configuration permits no explicit Origin values. Unapproved origins (including `null`) receive 403 `{message: "Origin is not allowed"}` before persistence; responses do not echo the origin. No-Origin root and Bearer-authenticated goal tools remain usable; cookie-auth writes require a trusted Origin/Referer as above. Allowed origins receive explicit Access-Control-Allow-Origin and Vary: Origin; error responses retain CORS permissions. Cookie credentials are enabled only on /api/auth paths. Approved OPTIONS preflights return 204; permitted methods are GET/POST/PATCH/DELETE and headers are Content-Type/Authorization/X-CSRF-Token, with a 600-second preflight cache duration. Update methods/session policy alongside future APIs.

All /api paths share a fixed-window per-IP limit of 100 requests per 15 minutes; rejected validation and unknown API requests count too. Request 101 returns 429 `{message: "Too many requests; try again later"}`, with Retry-After, RateLimit and RateLimit-Policy headers exposed to approved browser origins. Preflights handled by CORS and GET / bypass this limit. Non-API paths also lie outside this API limiter. Memory counters are process-local and reset on restart. Proxy trust is intentionally false; deployment behind a reverse proxy requires a reviewed exact trust policy to avoid grouping all users under the proxy's IP or trusting forged addresses. The dedicated login/auth limits described above also apply.


## First frontend integration

The React client at localhost:5173 uses the Vite /api proxy by default. Its auth requests include cookies and fresh CSRF headers; protected profile calls omit cookies and attach the memory-only access token. The client serializes refresh across tabs, verifies the refreshed identity, retries only a denied protected request once and never blindly retries a network-ambiguous refresh or save. Registration still requires a separate sign-in. Profile PATCH sends changed fields only, preserving omission/null/[] semantics and displaying server validation errors. No API contract, migration or real Supabase data changed in the frontend step. See frontend/README.md for setup and the isolated browser-test fixture.

## Dashboard read API

`GET /api/users/dashboard` requires a live Bearer session and returns `{ data: { asOf, overdueBefore, profile, completeness, goals, recentGoals } }`. Ownership comes exclusively from the authenticated account; caller query parameters cannot choose another account.

`profile` is null or the five core career-profile fields. `completeness` uses the existing five-field checklist. `goals` contains total, active, completed, other and overdue counts. Active means exact `ACTIVE`; completed means exact `COMPLETED`; all remaining status strings count as other. Overdue is a subset of active: targetDate is strictly before today's UTC midnight. Today's deadlines, missing dates and completed/other statuses are excluded from overdue.

`recentGoals` contains at most five owned records, ordered by createdAt descending then id descending, selecting only id, title, category, status, targetDate and createdAt. Dates are ISO strings. Counts include all owned records, not just this list. Empty accounts return zero counts and an empty list. One PostgreSQL repeatable-read transaction reads a consistent snapshot without modifying records. The response includes no credentials, owner identifiers or goal descriptions. The existing authentication, CORS and rate limits apply.

## Goal updates and deletion

`PATCH /api/goals/:id` requires a live Bearer session. Accepts a strict nonempty partial object with title, category, description, targetDate and/or status. Existing creation bounds/date validation apply. Title/category cannot be null; description/targetDate accept null to clear. Status accepts exact ACTIVE or COMPLETED; omitted legacy status strings remain untouched. Unknown fields (including id, userId and createdAt) are rejected. Successful response: 200 `{ data: goal }`. Invalid IDs/body return 400 with safe field issues; unavailable or foreign goal IDs return identical 404 `{ message: "Goal not found" }`.

`DELETE /api/goals/:id` requires the same session and owner scope. Successful deletion returns 204 with no body. A missing/foreign/already-deleted goal returns the same 404; malformed IDs return 400. This permanently removes the record; no soft-delete or undo is implemented. The frontend requests explicit confirmation, but API authorization is enforced independently by the backend.

Both services include id and session userId in the mutation predicate itself. PATCH uses updateManyAndReturn to return the changed owned row; DELETE uses deleteMany and checks its count. There is no separate read-then-write ownership gap. PATCH leaves omitted fields intact, but simultaneous writes to the same supplied field use last accepted write wins; version conflicts/If-Match are not implemented. Mutations use the existing limits, no-store responses and session checks. CORS now permits DELETE alongside GET/POST/PATCH. No schema change is required.

## Goal search, status and sorting

GET /api/goals now additionally accepts q (trimmed literal case-insensitive substring, at most 100 characters), status (ALL, ACTIVE, COMPLETED or OTHER) and sort (oldest or newest). Defaults remain empty search, ALL statuses and oldest, preserving existing clients. Search covers title, category and description, combined with the status filter and session owner in the database query. Percent, underscore and backslash are escaped as literal search text. OTHER means any stored status other than exact ACTIVE/COMPLETED; it does not reclassify legacy data. Invalid/repeated supported parameters return 400.

Sorting uses insertion ID: oldest ascends, newest descends. Each page remains bounded to at most 50 (frontend 20). The numeric nextCursor is the final returned ID if more matches exist. Repeat the same q/status/sort with afterId for the next page; IDs greater than afterId are used for oldest, less for newest. No cursor row lookup is needed, so deleting that row does not break continuation. Changed filters/sort require a fresh first page. These are live reads rather than a cross-page snapshot; concurrent writes can change later results. Search/filtering is not limited to previously loaded records. Responses retain `{data,nextCursor}` and all existing authentication/privacy policies.

## Priority/subtask storage stage

Storage is prepared for LOW/MEDIUM/HIGH priorities and subtasks. Existing goals default to MEDIUM. The storage checkpoint initially added no controls; the owned APIs and frontend support are now documented below. Ordinary direct Data API roles cannot access the new table. Parent goal deletion cascades to its subtasks, and the frontend confirmation now names this effect. Subsequent API work must enforce ownership via the parent goal, validate inputs and keep lists bounded. Completing subtasks does not currently change parent status automatically.

## Owned subtask APIs and goal priority

Goal POST/PATCH now accept priority LOW/MEDIUM/HIGH. Omission on POST uses the database MEDIUM default; omission on PATCH preserves the stored value. Null/unknown priorities return 400. Priority does not change status or reorder existing oldest/newest lists.

All subtask routes require the existing Bearer token and a live session:

- GET /api/goals/:id/subtasks: limit 1–50 (default 20), optional afterId; returns `{data,nextCursor,summary:{total,completed}}`. ID-ascending cursor pagination; summary covers the entire owned goal, not just loaded rows. A repeatable-read transaction keeps one response internally consistent. Unknown/repeated query fields return 400.
- POST /api/goals/:id/subtasks: strict `{title}`; trimmed nonblank text, max 200 characters. Returns 201 `{data:subtask}`. New records start unchecked. Parent ownership is checked while holding a parent row lock; additions serialize per goal and reject a 101st subtask with 409. The database FK handles parent deletion consistently.
- PATCH /api/goals/:id/subtasks/:subtaskId: strict nonempty partial `{title?,isCompleted?}`. Completion must be an explicit boolean. Returns 200 `{data:subtask}`. Cannot move a child, set its owner/ID/timestamps or supply other fields.
- DELETE /api/goals/:id/subtasks/:subtaskId: returns 204 after owned deletion; there is no undo. Frontend confirmation is additional UX, independent of backend authorization.

Records select only id, goalId, title, isCompleted, createdAt and updatedAt. GET/POST return Goal not found for unavailable/foreign parents. PATCH/DELETE return identical Subtask not found for missing, foreign or wrong-parent child IDs. Malformed IDs or payloads return safe 400; anonymous/invalid/revoked sessions return 401. Every child mutation includes both parent ID and the relation to the signed-in account in the mutation predicate. Existing rate limits, CORS, no-store and safe-error policies apply. Checking/unchecking/renaming subtasks never changes parent goal status or priority. Completed goals remain editable. No new migration is required in this increment.

## Skills storage stage

A shared Skill catalog and private UserSkill links are being introduced as a storage-only increment. There are no skill endpoints or screen controls in this stage. The catalog contains eight maintained starter labels; no account is assigned personal skills. Future APIs will expose self-reported levels and private notes with session-derived ownership; they must not present those levels as verified proficiency or a job-readiness score. Current goal/subtask/auth/profile endpoints remain unchanged.

## Skills catalog and private self-assessment APIs

Every /api/skills endpoint requires a Bearer token and active session; authenticated responses remain no-store. GET /api/skills/catalog returns safe id/slug/name/category fields with case-insensitive literal q search (trimmed, max 80), ID-ascending pagination, limit 1–50 (default20), optional afterId. GET /api/skills returns only the signed-in account's skill links with skillId, level, notes, timestamps and the nested safe catalog fields. Both use `{data,nextCursor}`; the cursor continues after the last returned catalog/skill ID, without requiring that row still exist. Unsupported/repeated query fields return400.

POST /api/skills accepts strict `{skillId,level?,notes?}`. skillId must be a positive PostgreSQL Int JSON number. Levels are BEGINNER/INTERMEDIATE/ADVANCED; omitted level defaults BEGINNER. Notes may be omitted, text up to1000 characters or null. Returns201 `{data:personalSkill}`. A concurrent/already-present duplicate returns409 without replacing level/notes; missing catalog ID returns404. The composite database key enforces duplicate safety.

PATCH /api/skills/:skillId accepts a strict nonempty partial `{level?,notes?}`. Omitted fields remain, null explicitly clears notes; null level is invalid. Returns200 `{data:personalSkill}`. DELETE on the same path returns204 and removes only the signed-in account's link/notes. Missing or foreign personal entries return identical404 Personal skill not found. When two accounts use the same catalog ID, each operation still targets only its own composite key. Removing a personal link leaves the catalog and other users untouched.

No shared-catalog administration endpoints are exposed; private choice creation is described below. Caller userId, IDs/timestamps/catalog name/slug/category changes are rejected in personal bodies. IDs/invalid bodies return safe400; missing/invalid/revoked sessions return401 before queries. Private notes never appear in catalog responses. Levels are self-reported labels, not verified skill or readiness scores. Updates/removals combine session userId and skillId in the database mutation predicate. Existing rate limits/CORS/error policies apply; no new schema/dependency is required.

## Projects and skill evidence

All `/api/projects` operations require an active CareerOS session and use its owner ID. Private responses are not cached. A foreign or missing project returns the same `404 Project not found`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/projects?limit=20&afterId=123` | Own projects, ascending ID cursor, limit 1–50, `{data,nextCursor}`. Each list row includes `_count.skills`. |
| GET | `/api/projects/:projectId` | `{data}` containing owned details and skill-evidence links. |
| POST | `/api/projects` | Creates project and optional evidence atomically; returns 201 `{data}`. |
| PATCH | `/api/projects/:projectId` | Strict, nonempty partial update; returns `{data}`. |
| DELETE | `/api/projects/:projectId` | Deletes own project and its evidence links; returns 204. |

Project input: required `title` (trimmed, 1–200); optional nullable `description` (3,000), `outcome` (2,000), `repositoryUrl`/`demoUrl` (2,048), `startDate`/`endDate` (valid `YYYY-MM-DD`). `status` is PLANNED (default), IN_PROGRESS or COMPLETED. If both dates exist, end must be on/after start. URLs must be HTTP/HTTPS with no embedded credentials or whitespace; the server does not fetch them or verify their contents. Clients should not store secret links. Caller ownership, IDs and timestamps are rejected in input.

Optional `skills` is an array of at most 20 unique `{skillId,evidence?}` entries. `skillId` references the shared catalog; nullable `evidence` is at most 1,000 characters. On PATCH, omitted fields/skills are preserved, `null` clears optional fields and `skills:[]` removes all links. A supplied skills array replaces the project's links as one transaction. A nonexistent catalog skill returns 400 and rolls back the entire write. Partial date edits lock the owned row and validate the merged saved range. Reads omit internal user ownership and credential fields.

Evidence belongs to the project and survives removal of a personal UserSkill assessment. Removing a project never deletes catalog entries or personal skill levels/notes. Linked skills and project status are self-reported; no verified proficiency/readiness score is calculated. Certifications, employment experience, goal associations and public portfolio sharing are separate future features.

## Certifications and experience

All endpoints require an active session and derive ownership from it. Foreign/missing IDs produce the same 404. Responses omit userId and private account fields and use no-store. No public sharing, credential verification or automatic proficiency scoring is performed.

| Method | Path | Response |
| --- | --- | --- |
| GET | `/api/certifications` or `/api/experiences` | `{data,nextCursor}`; strict `limit` 1–50 (default 20), optional positive `afterId`, ascending ID, `_count.skills` per row |
| GET | either path + `/:id` | `{data}` with safe details and related skills/explanations |
| POST | either collection | 201 `{data}`, nested skill links saved atomically |
| PATCH | either path + `/:id` | 200 `{data}`, strict nonempty partial edit |
| DELETE | either path + `/:id` | 204; only that owned record and its skill links are removed |

Certification input: required trimmed `title` and `issuer` (1–200 characters); optional nullable `description` (3,000), `credentialId` (200), `credentialUrl` (2,048), `issuedDate` and `expiresDate` (`YYYY-MM-DD`). Expiry must be on/after issue when both exist. Credential URL accepts only HTTP/HTTPS without whitespace or embedded credentials; the server never fetches it. Avoid secret links. Future/expired dates are stored as entered, without a verified/valid badge.

Experience input: required trimmed `title` (role) and `organization` (1–200); optional nullable `description` (3,000), `achievements` (2,000), `startDate`, `endDate`; optional `type` INTERNSHIP/EMPLOYMENT/FREELANCE/VOLUNTEERING/OTHER (default OTHER), and boolean `isCurrent` (default false). End must be on/after start when both exist; current experience must have no end date. PATCH setting current true must explicitly clear an existing endDate with null. The browser does this visibly; the API does not silently erase dates.

Both accept optional `skills:[{skillId,evidence?}]`, maximum 20 unique catalog IDs; nullable explanation maximum 1,000. On PATCH, omission preserves a field, null clears an optional value and an explicit skill array atomically replaces all links (`[]` removes all). Missing catalog skills return 400 and roll back the whole write. Related writes and partial calendar/current-state validation lock the owned parent in a transaction. Deleting a record leaves catalog entries, personal assessments, projects and other records intact; removing a personal assessment preserves these links.

## Expanded and custom skill choices

The maintained catalog now has 77 shared choices. GET `/api/skills/catalog` still returns the same safe fields and bounded search/cursor contract, but includes only shared choices plus the signed-in account's custom choices. Caller ownership filters are rejected. No other account's private names/categories are exposed.

POST `/api/skills/custom` accepts strict `{name,category?}` (name 1–80 characters after Unicode NFKC and whitespace normalization; optional category 1–80, default Custom). Returns 200 `{data:catalogSkill}` whether created or reused. Names use a normalized lowercase key: a matching shared choice is reused first, then an existing owned custom choice. Concurrent duplicates resolve to the same private ID without overwriting its original name/category. Slugs are server-generated; ownerId/nameKey are never accepted or returned. This endpoint creates a reusable choice only, not a self-assessment or evidence link, so retrying the same name after an uncertain response is safe.

Personal-skill POST rejects missing and foreign custom IDs with identical 404. Project/certification/experience create and partial updates validate every supplied skill ID inside the write transaction; missing/foreign choices return the same generic 400 and roll back all changes. No ordinary API can publish, rename, reassign or delete catalog/custom choices. Removing a personal assessment or an evidence link preserves its reusable choice. Existing authentication, validation, rate limits and no-store behavior apply.

## Project–goal connections

All operations require an active session and derive the owner from it. Foreign/missing project or goal parents return the same 404; missing/foreign unlink returns `404 Project–goal link not found`. Responses are no-store and omit internal userId. Connecting or removing a link never changes either record's status, fields, subtasks or skill evidence.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/projects/:projectId/goals` | `{data,nextCursor}` with goalId/projectId/createdAt and safe goal id/title/status/category/priority |
| POST | `/api/projects/:projectId/goals` | Strict `{goalId:number}`; 201 `{data}`. Both parents must belong to the session owner. Duplicate 409. |
| DELETE | `/api/projects/:projectId/goals/:goalId` | 204; removes just the owned connection |
| GET | `/api/goals/:id/projects` | `{data,nextCursor}` with projectId/goalId/createdAt and safe project id/title/status |

Lists accept only `limit` (1–50, default 20) and optional positive `afterId`. Project links sort/cursor by goalId; goal links by projectId. Parent/list reads use one repeatable-read transaction. A project can link at most 100 goals; additions serialize on the owned project and validate/lock the owned goal before insert, so concurrent requests cannot bypass this cap. The composite primary key prevents duplicate links. Completed projects/goals can still be linked; a connection records relevance rather than automatic completion.

Composite foreign keys include userId and reference unique `(id,userId)` parent keys, so cross-account links are rejected by PostgreSQL too. Deleting either parent cascades only its ProjectGoal connections; the other parent stays. RLS denies ordinary direct-client table access. No caller ownership or link timestamps are accepted in input.
