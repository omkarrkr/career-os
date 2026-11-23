# Auth schema proposal archive

Promoted on 23 November 2026. This folder retains the reviewed design snapshot; it is not an active migration source and its SQL must not be replayed.

Authoritative implementation:

- Active models: ../../schema.prisma
- Applied migration: ../../migrations/20261123140042_add_auth_sessions_and_goal_owner/migration.sql
- Regression checks: npm.cmd run test:migration:auth (tests the active migration)

The applied SQL adds User/AuthSession/RefreshToken, nullable indexed Goal.userId, uniqueness and restrictive references. Credential/session tables use RLS with no public policies. Transactional DDL has bounded lock/statement waits. Native PostgreSQL restore rehearsal and post-apply checks verified preservation; no legacy ownership was assigned and no account was created.

The archived schema has no runtime client generator. The original draft SQL was updated during review with RLS/timeouts, then copied into the active migration. Model-only diff generation does not represent these SQL-only safeguards; never regenerate/overwrite an applied migration from a datamodel diff. Make later changes in new reviewed migrations.

Application authentication, session security and deliberate legacy backfill remain separate M2 steps. Recovery artifacts are private/local. See docs/AUTH_DESIGN.md for behavior and remaining work.
