# CareerOS master context

Updated 23 November 2026. Use PROJECT_AUDIT.md for historical audit evidence, ROADMAP.md for the active milestone order and AUTH_DESIGN.md for the proposed M2 design. Reinspect actual code before relying on this snapshot.

## Product and learning goal

CareerOS is a personal career operating system for students, graduates and job seekers. It should connect career profiles, skills, goals, projects, learning roadmaps, resumes, opportunities, applications and interviews. It should help a user understand their current position, gaps, next actions and progress. The final result should be a secure, polished, demonstrable full-stack portfolio product, built with the owner in manageable learning milestones.

## Verified present state

- Backend only: Node, TypeScript, Express 5, Prisma 7, PostgreSQL adapter, dotenv, tsx.
- One Goal model and initial migration; only goal creation persists data.
- Profile is a public static placeholder; registration returns 501 without logging/echoing submitted data or creating accounts.
- No frontend, actual accounts, AI provider integration or deployment setup. Automated goal API tests now run through Node's test runner with database access replaced in memory.
- Goal creation uses Zod runtime validation; invalid fields return 400 with field messages. Shared middleware formats parser errors and unexpected goal failures safely; unknown routes return JSON 404. Startup validates DATABASE_URL/PORT/NODE_ENV/CORS_ORIGINS, uses a configurable port and safe failure messages, and handles bounded graceful shutdown. Helmet headers, exact browser-origin rules and an in-memory 100-request/15-minute per-IP API limit are implemented.
- Prisma CLI/client/adapter are exactly pinned to 7.10.0 in manifest and lockfile; resolved packages were not upgraded.
- On 22 November 2026, no-emit checking, compilation, client generation and schema validation pass. Read-only DB connectivity and Prisma migration status pass; the initial migration is finished. Compiled server startup connected before listening and GET / returned 200.
- Existing local DATABASE_URL is private and unchanged. Earlier audit database failures did not recur; their cause remains unproven. M0 verification did not read application records, write data or apply migrations.
- M2 design is documented only; no auth tables, migration or runtime authentication exists yet. On 23 November the owner confirmed all currently stored goals are theirs. Backfill must still target a captured legacy set and a verified future owner account, never the first signup. See AUTH_DESIGN.md for session/cookie/CSRF choices and migration prerequisites.

## Intended capabilities

The list below is the long-term vision. The first release focuses on target role -> skills/project evidence -> explained gaps -> goals and roadmap -> reviewed AI weekly plan -> progress. Start with one role template and one AI workflow. Follow with manual application tracking and limited resume/job-description alignment. Broad chat, mock interviews, job-feed integrations, voice and advanced analytics are deferred. Use explained requirement coverage rather than an unsupported career-readiness score. See ROADMAP.md milestones M0-M9 for acceptance criteria.

1. Authentication and account management: hashed passwords, JWT sessions, protected resources, settings and ownership.
2. Career profile: education, interests, roles, skills, certifications, projects and experience.
3. Dashboard: real backend data, clear empty/error/loading states and practical next actions.
4. Goals/tasks: owned CRUD, deadlines, priorities, subtasks, search and progress.
5. Skills/gaps: proficiency and role requirements with explainable gap assessment.
6. Personalized roadmaps: phases, resources, projects, milestones, dependencies and progress.
7. Learning recommendations: reliable sources and clearly identified AI suggestions.
8. Project portfolio: outcomes, technology, repository/deployment links and skill associations.
9. Resumes: private uploads, extraction, versions and validated analysis without fabricated achievements.
10. ATS-style analysis: job-description comparison and explainable heuristic matching, never claims of an employer's actual ATS score; user approval for resume edits.
11. Opportunities: legitimate APIs/sources, search, filters, saved listings, source/expiry disclosure.
12. Applications: statuses, notes, resume association, interviews, pipeline and statistics.
13. Interview preparation: contextual questions, answers, feedback and history; voice considered later.
14. Career assistant: permission-scoped context and actionable advice without invented user facts.
15. Notifications: in-app first, preferences and deduplication; email later.
16. Analytics: documented deterministic metrics and honest limits on readiness estimates.

## Technical direction

Preserve the existing backend stack and Prisma 7.10.0 direction. Do not upgrade major dependencies casually. Planned frontend: React, TypeScript, Vite, Tailwind, React Router and suitable API fetching. Planned backend additions: Zod, bcrypt and JWT. Provider-neutral AI layer; README's Gemini mention is not an implemented provider commitment. Use relational ownership, migrations, pagination, justified indexes and transactions for related writes.

The UI should be professional, responsive, accessible and consistent. Avoid hardcoded metrics, inactive controls, crowded layouts, excessive gradients and unnecessary animation. Build real vertical slices with loading, empty, error and success behavior.

## Working agreement

- Inspect before editing. Preserve working functionality and useful documentation.
- The initial audit was documentation-only. On 22 November 2026, the owner authorized continuing development in small teaching milestones and making local Git checkpoints when appropriate. Avoid whole-product generation and preserve the learning/verification gates.
- Explain what and why in simple terms, show the data flow, break work into small steps, implement, verify and explain important decisions.
- Provide exact directories and commands. When owner-run verification is required, wait for their results before advancing the major phase.
- At major feature milestones, prepare concept/project notes, flow, key code explanations, interview Q&A, common mistakes and a small practice challenge.
- Keep controllers thin, business logic in services, proper TypeScript types and runtime external-input validation. Avoid unnecessary abstractions/dependencies.
- Test important behavior, review diffs and secrets before meaningful commits; preserve the lockfile.
- The owner authorized pushing verified checkpoints to the existing GitHub remote on 22 November 2026. Push normally without force; never upload secrets. Resolve authentication through the user's normal sign-in flow, not by requesting tokens in chat.
- Keep learning notes simple and current at each step. If additional Supabase access is genuinely needed, explain the exact access/action required; use existing authorized read-only access when sufficient and never ask for secrets in chat.
- Never log passwords, expose hashes, commit environment secrets or query another user's resources.
- Preserve the existing Supabase database. Never reset, drop, truncate or recreate migrations to fix normal issues. Explain and review additive schema changes before safe application.
- Do not ask the owner to share passwords, tokens or full environment contents.

## Next recommended milestone

M0 and scoped M1 were verified on 22 November 2026 with 52 reported tests passing. On 23 November, M2 account/session and non-destructive ownership design was documented without code, schema or database changes. Next prepare/review an additive migration in isolation and establish backup readiness before any remote application. Proposed auth: bcrypt per original requirement, short-lived in-memory JWT access, HttpOnly rotating refresh cookie, hashed refresh records, session-based revocation checks and tested CSRF protection before browser cookie auth. The app remains unauthenticated and not production-ready. Exact token lifetimes are proposed defaults, not implemented configuration. Preserve existing goal data and do not infer destination ownership from signup order.
