# CareerOS master context

Updated 22 November 2026. Use PROJECT_AUDIT.md for historical audit evidence and ROADMAP.md for the active milestone order. Reinspect actual code before relying on this snapshot.

## Product and learning goal

CareerOS is a personal career operating system for students, graduates and job seekers. It should connect career profiles, skills, goals, projects, learning roadmaps, resumes, opportunities, applications and interviews. It should help a user understand their current position, gaps, next actions and progress. The final result should be a secure, polished, demonstrable full-stack portfolio product, built with the owner in manageable learning milestones.

## Verified present state

- Backend only: Node, TypeScript, Express 5, Prisma 7, PostgreSQL adapter, dotenv, tsx.
- One Goal model and initial migration; only goal creation persists data.
- Public static profile and request-echo registration are placeholders.
- No frontend, actual accounts, AI provider integration, tests or deployment setup.
- Lockfile resolves Prisma to 7.10.0; package declarations use caret ranges.
- TypeScript verification fails TS6059; schema validates; live DB checks failed during audit.
- Existing local DATABASE_URL is private. Historical successful database use was reported by the owner, but not reverified during this audit.

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
- Never log passwords, expose hashes, commit environment secrets or query another user's resources.
- Preserve the existing Supabase database. Never reset, drop, truncate or recreate migrations to fix normal issues. Explain and review additive schema changes before safe application.
- Do not ask the owner to share passwords, tokens or full environment contents.

## Next recommended milestone

M0: foundation repair and verification, starting with the TypeScript build boundary, followed by database/setup/startup verification. Then M1 API safety and M2 authentication/ownership. The audit itself made no application changes; track subsequent verification in ROADMAP.md.
