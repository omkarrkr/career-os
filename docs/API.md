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

Errors identify fields without returning the submitted body. Malformed JSON and parser-rejected primitive bodies return 400 `{message: "Invalid JSON body"}`. Bodies exceeding Express JSON parser's default 100kb limit return 413 `{message: "Request body is too large"}`. JSON parser checks happen before controller validation. Unknown routes still use Express's default 404 behavior; a consistent JSON 404 is pending.

The existing controller still catches goal-service failures and returns 500 `{message: "Failed to create goal"}`; centralized service-error handling and sanitized goal error logging remain pending. The new final error middleware returns a generic 500 for otherwise unhandled request errors. This is an incremental contract, not a claim that all API errors have already been standardized.

## Existing user and root routes

- GET / returns app information, not a live readiness check.
- GET /api/users/profile returns a static demonstration profile.
- POST /api/users/register still logs and echoes submitted JSON. Do not submit credentials. Removing raw-body exposure is the next safety task before real authentication.

## Verification

`npm.cmd test` runs API behavior checks with goal persistence replaced in memory. `npm.cmd run typecheck` and `npm.cmd run build` verify application TypeScript. No live database insert is required by this suite.
