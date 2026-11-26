# CareerOS API contracts

Updated 27 November 2026. Development base URL: http://localhost:3000. Registration, login, session refresh/logout and protected real-user profile are implemented. Goal creation/list/detail are ownership-scoped, database ownership is required, and password change revokes sessions; update/delete remain pending; do not expose this as a finished multi-user API.

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

Both require a valid Bearer access token and active session. Lists return 200 `{data:[Goal],nextCursor:number|null}` ordered by id ascending, scoped to the signed-in user. Optional limit is an integer string 1-50 (default 20); afterId is a positive PostgreSQL Int ID. Send the previous nextCursor as afterId for the next page. Invalid IDs/query values return 400 `Invalid goal ID` or `Invalid goal query`. Pagination retrieves at most 51 rows per request. Unknown query fields, including userId, cannot change the owner filter.

Detail returns 200 `{data:Goal}` only when both id and userId match. A foreign-owned, NULL-owned legacy or nonexistent goal returns the identical 404 `{message:"Goal not found"}`. Missing/invalid/revoked authentication returns 401 before goal queries. Authenticated responses use no-store. Update/delete are not implemented; no claim-legacy endpoint exists.

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

Origins are exact HTTP(S) origins from CORS_ORIGINS, separated by commas. Absent/empty configuration permits no explicit Origin values. Unapproved origins (including `null`) receive 403 `{message: "Origin is not allowed"}` before persistence; responses do not echo the origin. No-Origin root and Bearer-authenticated goal tools remain usable; cookie-auth writes require a trusted Origin/Referer as above. Allowed origins receive explicit Access-Control-Allow-Origin and Vary: Origin; error responses retain CORS permissions. Cookie credentials are enabled only on /api/auth paths. Approved OPTIONS preflights return 204; permitted methods are GET/POST/PATCH and headers are Content-Type/Authorization/X-CSRF-Token, with a 600-second preflight cache duration. Update methods/session policy alongside future APIs.

All /api paths share a fixed-window per-IP limit of 100 requests per 15 minutes; rejected validation and unknown API requests count too. Request 101 returns 429 `{message: "Too many requests; try again later"}`, with Retry-After, RateLimit and RateLimit-Policy headers exposed to approved browser origins. Preflights handled by CORS and GET / bypass this limit. Non-API paths also lie outside this API limiter. Memory counters are process-local and reset on restart. Proxy trust is intentionally false; deployment behind a reverse proxy requires a reviewed exact trust policy to avoid grouping all users under the proxy's IP or trusting forged addresses. The dedicated login/auth limits described above also apply.
