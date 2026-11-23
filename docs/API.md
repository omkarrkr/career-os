# CareerOS API contracts

Updated 24 November 2026. Development base URL: http://localhost:3000. Registration, login, session refresh/logout and protected real-user profile are implemented. Goal ownership enforcement is pending; do not expose this as a finished multi-user API.

## POST /api/goals

Send an application/json object:

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

Success remains 201 with `{message: "Goal created successfully", data: <saved Goal>}`. Goal fields are described in PROJECT_AUDIT.md.

Invalid goal data returns 400, for example:

```json
{
  "message": "Invalid goal data",
  "errors": [{"field": "title", "message": "Title is required"}]
}
```

Errors identify fields without returning the submitted body. Malformed JSON and parser-rejected primitive bodies return 400 `{message: "Invalid JSON body"}`. Bodies exceeding Express JSON parser's default 100kb limit return 413 `{message: "Request body is too large"}`. JSON parser checks happen before controller validation. Unknown routes/methods return 404 `{message: "Route not found"}` without reflecting the URL or query string.

Unexpected goal-service failures now propagate through Express 5's async error handling to the shared final middleware, returning 500 `{message: "Internal server error"}`. The log contains only a fixed error event, not raw exception data, request bodies or credentials. This replaces the old `Failed to create goal` response. Structured diagnostics/request IDs and broader startup logging remain future work.

## Existing user and root routes

- GET / returns app information, not a live readiness check.
- GET /api/users/profile requires an access token and returns that account's public profile.
- POST /api/users/register creates a validated account as described below. It does not establish a session.

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

Login allows 10 attempts/IP/15 minutes; /api/auth also has a 60-request/IP/15-minute budget, and the API-wide limit applies. Failed CSRF/validation attempts count. No schema change, real-account creation or legacy-goal claiming was needed. Password change, ownership enforcement, verification/recovery and session-history cleanup remain later work.

## Response convention

Keep current success contracts to avoid unnecessary rewrites. Errors return a safe `message`; validation errors additionally include `errors` with field/message pairs. Clients use HTTP status to distinguish request mistakes, missing routes, unavailable features and unexpected server failures. No raw error stack or arbitrary internal error message is exposed.

## Verification

`npm.cmd test` runs API behavior checks with goal persistence replaced in memory. `npm.cmd run typecheck` and `npm.cmd run build` verify application TypeScript. No live database insert is required by this suite.

## HTTP policies

Helmet headers precede routes and errors. In production, HSTS and CSP upgrade-insecure-requests are enabled; development/test avoid forcing local HTTPS. These headers do not install a TLS certificate or provide transport encryption themselves.

Origins are exact HTTP(S) origins from CORS_ORIGINS, separated by commas. Absent/empty configuration permits no explicit Origin values. Unapproved origins (including `null`) receive 403 `{message: "Origin is not allowed"}` before persistence; responses do not echo the origin. No-Origin root/goal tools remain usable; cookie-auth writes require a trusted Origin/Referer as above. Allowed origins receive explicit Access-Control-Allow-Origin and Vary: Origin; error responses retain CORS permissions. Cookie credentials are enabled only on /api/auth paths. Approved OPTIONS preflights return 204; permitted methods are GET/POST and headers are Content-Type/Authorization/X-CSRF-Token, with a 600-second preflight cache duration. Update methods/session policy alongside future APIs.

All /api paths share a fixed-window per-IP limit of 100 requests per 15 minutes; rejected validation and unknown API requests count too. Request 101 returns 429 `{message: "Too many requests; try again later"}`, with Retry-After, RateLimit and RateLimit-Policy headers exposed to approved browser origins. Preflights handled by CORS and GET / bypass this limit. Non-API paths also lie outside this API limiter. Memory counters are process-local and reset on restart. Proxy trust is intentionally false; deployment behind a reverse proxy requires a reviewed exact trust policy to avoid grouping all users under the proxy's IP or trusting forged addresses. The dedicated login/auth limits described above also apply.
