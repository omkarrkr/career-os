# CareerOS frontend

React/TypeScript/Vite, Tailwind, React Router and TanStack Query. The shell includes sign-in, account registration, the private career-profile form and a real profile/goal dashboard. Password-change UI, account recovery and hosted deployment remain later steps.

## Run with the real development backend

Complete the backend setup in the repository README first. Keep its private `.env` and existing database intact. In separate PowerShell terminals:

```powershell
cd C:\PROJECTS\career-os\backend
npm.cmd run dev
```

```powershell
cd C:\PROJECTS\career-os\frontend
npm.cmd ci
npm.cmd run dev
```

Open **http://localhost:5173** and sign in with your existing CareerOS account; no new registration is needed. Normal profile saves intentionally persist your details in the configured backend database. Do not paste passwords into chat or command history.

The default Vite proxy forwards `/api` to `http://127.0.0.1:3000` and preserves the browser Origin. The backend must allow `http://localhost:5173` in CORS_ORIGINS. Use the printed localhost URL rather than changing it to 127.0.0.1: cookie hosts and approved origins must stay consistent.

Optional public configuration is documented in `.env.example`. CAREEROS_API_PROXY_TARGET changes the development proxy target; VITE_API_ORIGIN selects an explicit API origin instead of the proxy. All VITE_ values are public build configuration. Never put database URLs, signing secrets or credentials there. Production needs HTTPS, same-site cookie planning, exact approved origins and SPA fallback routing; a production build alone does not deploy the application.

## Behavior

- Access tokens and identity stay in memory. HttpOnly cookies belong to the backend; localStorage/sessionStorage never store tokens or drafts.
- Startup renews a cookie session once, verifies the authenticated identity and then opens the dashboard. Duplicate Strict Mode effects share the same restoration promise.
- Same-tab renewal is single-flight. Web Locks serialize auth operations across tabs; every refresh obtains the current CSRF token. A network-ambiguous refresh is not retried. Browsers without Web Locks require fresh sign-in rather than unsafe automatic renewal.
- BroadcastChannel carries session-change notices only, not credentials. Other tabs clear local identity/query data on sign-out/account changes. Generation and renewed-identity checks stop stale requests from applying an old account's edit to another account.
- Cookie credentials are included only for `/api/auth`; ordinary profile requests omit cookies and use Bearer authentication. A denied protected request may refresh and retry once. There are no automatic retries for network-failed saves or refreshes.
- Registration creates an account, then asks for explicit sign-in. Confirmed logout clears local identity/cache; a failed logout does not falsely announce success.
- The form loads real saved data, sends only changed fields, supports explicit clearing and shows backend field errors. The checklist describes saved fields, not unsaved edits or job readiness.
- Failed saves keep the current form. Reload/sign-out confirm before discarding unsaved changes; browser unload is guarded. Session changes clear the protected screen, and unsaved drafts are not persisted across reauthentication.
- Mobile navigation supports focus containment, Escape/close, focus return and an inert background. Labels, error/status messages, keyboard focus, reduced motion and 390px overflow are checked. This is not a comprehensive accessibility certification.

## Checks

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

The 13 client/form unit tests use mocked requests, not Supabase. Six real-browser flows cover persisted edits/clearing/reload/logout, bad credentials, mobile failed-save recovery/navigation, concurrent tab reloads, registration and denied-read renewal. Browser tests refuse to start writes without matching an explicitly guarded backend fixture.

### Isolated browser testing

Create a **fresh disposable local PostgreSQL database** named `careeros_test_browser_<suffix>`. The fixture requires loopback, no connection-query overrides and an empty public schema; it applies committed migrations and inserts fictional records. Never use the application database. The fixture endpoint exists only in this test entry point, never production server code.

Backend terminal:

```powershell
cd C:\PROJECTS\career-os\backend
$env:TEST_DATABASE_URL="postgresql://LOCAL_USER:LOCAL_PASSWORD@127.0.0.1:5432/careeros_test_browser_ui"
$env:E2E_FIXTURE_KEY="careeros-local-ui-check"
$env:TEST_BACKEND_PORT="3001"
npm.cmd run test:browser-server
```

Frontend terminal:

```powershell
cd C:\PROJECTS\career-os\frontend
$env:CAREEROS_API_PROXY_TARGET="http://127.0.0.1:3001"
npm.cmd run dev
```

Test terminal:

```powershell
cd C:\PROJECTS\career-os\frontend
$env:E2E_FIXTURE_KEY="careeros-local-ui-check"
npm.cmd run test:e2e
```

E2E_FIXTURE_KEY is a test marker, not an application secret. Windows defaults to installed Edge with temporary test profiles; other platforms use Playwright Chromium (install through `npx playwright install chromium`). E2E_BROWSER_CHANNEL can select another installed supported channel. Tests use `ui-student@example.test` / `Fictional browser test passphrase!`, never real account credentials. Stop owned test servers with Ctrl+C when finished. Recreate a new empty test database for another fixture run; the fixture deliberately refuses existing data rather than resetting it.

## Source layout

`src/App.tsx` composes auth screens, protected shell and the profile form. `src/lib/auth-client.ts` owns memory-only session/request behavior; `auth.ts` supplies browser locks/notifications. `profile-form.ts` derives partial saves; `types.ts` describes API response shapes. TanStack Query owns server-loaded profile state, while React owns unsaved input. The backend remains authoritative for validation, identity and ownership.

Setup follows the official [Vite guide](https://vite.dev/guide/), [React Router installation](https://reactrouter.com/start/declarative/installation) and [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite). Exact installed versions and the reproducible dependency tree are recorded in package.json/package-lock.json.

## Dashboard

Sign-in now opens `/dashboard`. DashboardPage reads the account-scoped summary API; profile saves invalidate its query. Recent goals are read-only in this step. No fake trend, readiness score or AI output is displayed. The profile navigation guard allows cancelling or discarding unsaved edits.

For concurrent development and browser tests, use a separate frontend port and `CAREEROS_VITE_CACHE_DIR` for the fixture server. Set `TEST_FRONTEND_ORIGIN` and `E2E_BASE_URL` to that frontend origin. Clear `VITE_API_ORIGIN` for the fixture so API requests go through its isolated proxy. If Vite reports its project lock, its `--bypass-lock` option is only appropriate with this separate test port and cache. The fixture marker must still match before tests run; browser tests abort off-origin API requests. Never point the fixture at Supabase.

## Keyboard accessibility

Screen changes move keyboard focus to the new main content after rendering, including authentication restoration and unknown routes. Focus does not move during ordinary profile edits or dashboard refreshes. The skip link targets this same content. Password visibility controls have explicit Show password/Hide password names. Visible focus styles, labeled inputs, alert/status messages, reduced-motion styles and the mobile drawer remain supported. The drawer keeps Tab/Shift+Tab inside its links and buttons; Escape closes it and restores focus to its opener. These are focused browser checks, not a full assistive-technology or WCAG conformance audit.

## Goals screens

Use Goals in the sidebar, or View all goals on the dashboard. `/goals` lists owned records oldest first, 20 per page with Load more. `/goals/new` accepts title (200 characters), category (100), optional description (5,000) and optional UTC calendar target date. New goals use the backend default Active status. `/goals/:goalId` opens saved details and management actions; inaccessible/invalid IDs reveal no other account's records. Confirmed creation refreshes list/dashboard data; the new record survives reload.

Creation is not retried automatically. If a network/server failure makes the result uncertain, input remains visible and another submission is disabled until the user checks saved goals and starts a fresh form. Leaving a draft asks for confirmation. Editing, completion and deletion are now available from goal details. The browser fixture uses fictional records; never run it against Supabase.

Browser fixture isolation: each spec verifies the marker and uses a nonce-checked test-only new-suite endpoint to select an unused Express app prebuilt before startup, resetting in-memory rate counters while keeping fictional database records/sessions. Missing nonce returns 403. This endpoint exists only in the guarded loopback test entry point, never the production application. Run specs sequentially (workers=1); create a fresh empty database for a new fixture run. Production request/login limits are unchanged.

## Editing, completion and deletion

Open a goal's details to edit title/category/description/target date, mark it completed, or delete it. Editing sends only changed fields; clearing optional fields removes those saved values. Cancel editing and navigation protect unsaved drafts. Completion and successful saves refresh list/dashboard queries. Delete goal asks for confirmation naming the goal and explaining that deletion is permanent. Cancel sends no delete request. No undo is available.

Network/server failures do not falsely report success. Saved details can be reloaded while keeping an edit draft; an uncertain outcome blocks further changes until that read succeeds. Backend ownership checks apply independently to every PATCH/DELETE. The current UI offers completion; the API also accepts ACTIVE as an explicit status assignment. Concurrent same-field edits are last accepted write wins.

## Search, filter and sort

Goals now has Search goals (title/category/description), Status (All, Active, Completed, Other) and Sort goals (oldest/newest added). Press Search or Enter to apply search text. Status/sort apply immediately. Reset filters clears the search, restores All and oldest first. No matching goals means the filters found nothing; it does not mean the account has no goals.

Filtering runs on the server before pagination. Changing criteria starts at the first page, including when returning to a previously loaded selection. Load more keeps the current criteria. Sorting uses insertion ID, and dates remain UTC. Search text is case-insensitive and literal, at most 100 characters. Search criteria live in component memory; returning from a detail page starts with defaults. Goal mutations invalidate all list-query variants for the account.

The priority/subtask storage migration is applied; priority selectors and subtask controls are now connected as described below. Goal deletion confirmation now explicitly includes subtasks because the database cascades child deletion. Backend/API and screen support are provided by the following increment.

## Priority and subtasks

Choose Low/Medium/High priority when creating or editing a goal; the saved level appears in its details. The default is Medium. On the detail screen, Subtasks lets you add, rename, check/uncheck and permanently delete smaller steps. Deletion requires confirmation. Completed goals can still manage their steps. Checklist completion is independent from Mark completed on the parent goal.

Whole-goal completed/total counts appear above the list. Pages load 20 at a time, with Load more up to a maximum of 100 subtasks per goal. Save or discard a child draft before using parent goal actions; route changes/sign-out/unload protect drafts. Mutations wait for server confirmation rather than announcing optimistic success. Uncertain failures retain input and require Reload subtasks before another mutation. Criteria and drafts remain in memory only. Concurrent edits to a supplied field use last accepted write wins.

Native verification: test:integration:subtasks requires a fresh empty loopback careeros_test_subtasks_<suffix> database through TEST_DATABASE_URL. It covers parent/child ownership, safe validation, completion independence, paging/summary, concurrent cap enforcement, cascade and session revocation. Never point the test fixture at Supabase.
