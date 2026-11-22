# CareerOS API contracts

Updated 22 November 2026. Development base URL: http://localhost:3000. Authentication is not implemented. Do not expose this as a finished multi-user API.

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
- GET /api/users/profile returns a static demonstration profile.
- POST /api/users/register returns 501 `{message: "Registration is not implemented yet"}` without logging/echoing its body or creating an account. This deliberately replaces the earlier misleading success response. Real registration is planned for M2.

## Response convention

Keep current success contracts to avoid unnecessary rewrites. Errors return a safe `message`; validation errors additionally include `errors` with field/message pairs. Clients use HTTP status to distinguish request mistakes, missing routes, unavailable features and unexpected server failures. No raw error stack or arbitrary internal error message is exposed.

## Verification

`npm.cmd test` runs API behavior checks with goal persistence replaced in memory. `npm.cmd run typecheck` and `npm.cmd run build` verify application TypeScript. No live database insert is required by this suite.

## HTTP policies

Helmet headers precede routes and errors. In production, HSTS and CSP upgrade-insecure-requests are enabled; development/test avoid forcing local HTTPS. These headers do not install a TLS certificate or provide transport encryption themselves.

Origins are exact HTTP(S) origins from CORS_ORIGINS, separated by commas. Absent/empty configuration permits no explicit Origin values. Unapproved origins (including `null`) receive 403 `{message: "Origin is not allowed"}` before persistence; responses do not echo the origin. No-Origin requests remain usable, so this is not user authorization or comprehensive CSRF prevention. Allowed origins receive explicit Access-Control-Allow-Origin and Vary: Origin; error responses retain CORS permissions. Cookie credentials are not enabled. Approved OPTIONS preflights return 204; permitted methods are GET/POST and headers are Content-Type/Authorization, with a 600-second preflight cache duration. Update methods/session policy alongside future APIs.

All /api paths share a fixed-window per-IP limit of 100 requests per 15 minutes; rejected validation and unknown API requests count too. Request 101 returns 429 `{message: "Too many requests; try again later"}`, with Retry-After, RateLimit and RateLimit-Policy headers exposed to approved browser origins. Preflights handled by CORS and GET / bypass this limit. Non-API paths also lie outside this API limiter. Memory counters are process-local and reset on restart. Proxy trust is intentionally false; deployment behind a reverse proxy requires a reviewed exact trust policy to avoid grouping all users under the proxy's IP or trusting forged addresses. Dedicated authentication limits are still needed with M2.
