import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const initialSql = await readFile(new URL("../prisma/migrations/20260915165713_init/migration.sql", import.meta.url), "utf8");
const migrationSql = await readFile(new URL("../prisma/migrations/20261123140042_add_auth_sessions_and_goal_owner/migration.sql", import.meta.url), "utf8");
const rejectsWithCode = (operation, code) => assert.rejects(operation, (error) => error.code === code);

test("auth foundation migration preserves legacy goals and enforces relational constraints", async (t) => {
    // PGlite is an embedded PostgreSQL engine. No URL, network or real records.
    const db = new PGlite();
    try {
        await db.exec(initialSql);
        await db.query(`INSERT INTO "Goal" (title, description, category, status, "targetDate", "createdAt")
            VALUES ($1, $2, $3, $4, $5, $6), ($7, NULL, $8, $9, NULL, $10)`, [
            "Synthetic SQL goal", "Fictional test description", "Development", "ACTIVE", "2026-12-15", "2026-11-01",
            "Synthetic completed goal", "Technical Skills", "COMPLETED", "2026-11-02",
        ]);
        const before = (await db.query('SELECT * FROM "Goal" ORDER BY id')).rows;
        await db.exec(migrationSql);

        await t.test("preserves every legacy value and leaves ownership unassigned", async () => {
            const after = (await db.query('SELECT * FROM "Goal" ORDER BY id')).rows;
            assert.deepEqual(after.map(({ userId, ...goal }) => goal), before);
            assert.ok(after.every((goal) => goal.userId === null));
        });

        await t.test("does not invent users, sessions or refresh credentials", async () => {
            for (const table of ["User", "AuthSession", "RefreshToken"]) {
                const result = await db.query(`SELECT COUNT(*)::integer AS count FROM "${table}"`);
                assert.equal(result.rows[0].count, 0);
            }
        });

        const user = (await db.query(`INSERT INTO "User" (name, email, "passwordHash", "updatedAt")
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING id`, [
            "Fictional test user", "student@example.test", "synthetic-not-a-real-password-hash",
        ])).rows[0];

        await t.test("rejects duplicate normalized email and nonexistent goal owners", async () => {
            await rejectsWithCode(db.query(`INSERT INTO "User" (name, email, "passwordHash", "updatedAt")
                VALUES ('Other fictional user', 'student@example.test', 'synthetic', CURRENT_TIMESTAMP)`), "23505");
            await rejectsWithCode(db.query(`INSERT INTO "Goal" (title, category, "userId")
                VALUES ('Synthetic orphan', 'Development', 999999)`), "23503");
        });

        await t.test("restricts deleting a user referenced by an owned goal", async () => {
            await db.query(`INSERT INTO "Goal" (title, category, "userId") VALUES ($1, $2, $3)`, [
                "Synthetic owned goal", "Development", user.id,
            ]);
            await rejectsWithCode(db.query('DELETE FROM "User" WHERE id = $1', [user.id]), "23503");
        });

        const sessionId = randomUUID();
        await t.test("requires sessions to reference a real user", async () => {
            await rejectsWithCode(db.query(`INSERT INTO "AuthSession" (id, "userId", "expiresAt")
                VALUES ($1, 999999, '2026-12-01')`, [randomUUID()]), "23503");
            await db.query(`INSERT INTO "AuthSession" (id, "userId", "expiresAt")
                VALUES ($1, $2, '2026-12-01')`, [sessionId, user.id]);
        });

        await t.test("requires real token sessions and unique token hashes; preserves session on delete", async () => {
            const hash = "a".repeat(64);
            await rejectsWithCode(db.query(`INSERT INTO "RefreshToken" (id, "sessionId", "tokenHash", "expiresAt")
                VALUES ($1, $2, $3, '2026-12-01')`, [randomUUID(), randomUUID(), hash]), "23503");
            await db.query(`INSERT INTO "RefreshToken" (id, "sessionId", "tokenHash", "expiresAt")
                VALUES ($1, $2, $3, '2026-12-01')`, [randomUUID(), sessionId, hash]);
            await rejectsWithCode(db.query(`INSERT INTO "RefreshToken" (id, "sessionId", "tokenHash", "expiresAt")
                VALUES ($1, $2, $3, '2026-12-01')`, [randomUUID(), sessionId, hash]), "23505");
            await rejectsWithCode(db.query('DELETE FROM "AuthSession" WHERE id = $1', [sessionId]), "23503");
        });

        await t.test("ownership is nullable and indexed for the transition", async () => {
            const column = await db.query(`SELECT is_nullable FROM information_schema.columns
                WHERE table_name = 'Goal' AND column_name = 'userId'`);
            assert.equal(column.rows[0].is_nullable, "YES");
            const indexes = (await db.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`)).rows;
            for (const name of ["Goal_userId_idx", "AuthSession_userId_idx", "RefreshToken_sessionId_idx"]) {
                assert.ok(indexes.some((index) => index.indexname === name));
            }
        });

        await t.test("RLS denies credential/session access to an ordinary role even with table grants", async () => {
            await db.exec(`CREATE ROLE auth_untrusted_test NOLOGIN;
                GRANT USAGE ON SCHEMA public TO auth_untrusted_test;
                GRANT SELECT, INSERT, UPDATE, DELETE ON "User", "AuthSession", "RefreshToken" TO auth_untrusted_test;
                SET ROLE auth_untrusted_test;`);
            try {
                for (const table of ["User", "AuthSession", "RefreshToken"]) {
                    const rows = (await db.query(`SELECT COUNT(*)::integer AS count FROM "${table}"`)).rows;
                    assert.equal(rows[0].count, 0);
                }
                await rejectsWithCode(db.query(`INSERT INTO "User" (id,name,email,"passwordHash","updatedAt")
                    VALUES (999999,'Untrusted','untrusted@example.test','synthetic',CURRENT_TIMESTAMP)`), "42501");
            } finally {
                await db.exec("RESET ROLE");
            }
            assert.equal((await db.query('SELECT COUNT(*)::integer AS count FROM "User"')).rows[0].count, 1);
        });
    } finally {
        await db.close();
    }
});

test("auth migration transaction rolls back early DDL if a later statement fails", async () => {
    const db = new PGlite();
    try {
        await db.exec(initialSql);
        await db.exec(`INSERT INTO "Goal" (title, category) VALUES ('Synthetic preserved goal', 'Development');
            CREATE TABLE "User" (id INTEGER);`);
        await rejectsWithCode(db.exec(migrationSql), "42P07");
        await db.exec("ROLLBACK");
        const added = await db.query(`SELECT column_name FROM information_schema.columns
            WHERE table_name = 'Goal' AND column_name = 'userId'`);
        assert.equal(added.rows.length, 0);
        const goals = (await db.query('SELECT title FROM "Goal"')).rows;
        assert.deepEqual(goals, [{ title: "Synthetic preserved goal" }]);
    } finally {
        await db.close();
    }
});
