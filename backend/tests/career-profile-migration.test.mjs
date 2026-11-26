import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("career-profile migration preserves existing rows and enforces private one-to-one profiles", async () => {
    const db = new PGlite();
    try {
        const directory = new URL("../prisma/migrations/", import.meta.url);
        const entries = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
        const latest = "20261127120000_add_career_profile"; assert.ok(entries.includes(latest));
        for (const entry of entries.filter(entry => entry < latest)) await db.exec(await readFile(new URL(`${entry}/migration.sql`, directory), "utf8"));
        await db.exec(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Fixture','fixture@example.test','not-real',NOW()); INSERT INTO "Goal" (title,category,"userId") VALUES ('Owned fictional goal','Development',1)`);
        const beforeUser = (await db.query('SELECT * FROM "User"')).rows;
        const beforeGoal = (await db.query('SELECT * FROM "Goal"')).rows;
        await db.exec(await readFile(new URL(`${latest}/migration.sql`, directory), "utf8"));
        assert.deepEqual((await db.query('SELECT * FROM "User"')).rows, beforeUser);
        assert.deepEqual((await db.query('SELECT * FROM "Goal"')).rows, beforeGoal);
        assert.equal((await db.query('SELECT * FROM "CareerProfile"')).rows.length, 0);
        await db.exec('INSERT INTO "CareerProfile" ("userId","updatedAt") VALUES (1,NOW())');
        for (const [statement, code] of [
            ['INSERT INTO "CareerProfile" ("userId","updatedAt") VALUES (1,NOW())', "23505"],
            ['INSERT INTO "CareerProfile" ("userId","updatedAt") VALUES (999,NOW())', "23503"],
            ['UPDATE "CareerProfile" SET "weeklyLearningHours"=41', "23514"],
            ['UPDATE "CareerProfile" SET "graduationYear"=2101', "23514"],
            ['UPDATE "CareerProfile" SET interests=NULL', "23502"],
        ]) await assert.rejects(db.exec(statement), error => error.code === code);
        await db.exec(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Profile-only owner','profile-only@example.test','fixture',NOW());
            INSERT INTO "CareerProfile" ("userId","updatedAt") VALUES (2,NOW())`);
        await assert.rejects(db.exec('DELETE FROM "User" WHERE id=2'), error => error.code === "23503");
        await db.exec(`CREATE ROLE career_untrusted NOLOGIN; GRANT USAGE ON SCHEMA public TO career_untrusted;
            GRANT SELECT,INSERT,UPDATE,DELETE ON "CareerProfile" TO career_untrusted; SET ROLE career_untrusted`);
        try {
            assert.equal((await db.query('SELECT * FROM "CareerProfile"')).rows.length, 0);
            await assert.rejects(db.exec('INSERT INTO "CareerProfile" ("userId","updatedAt") VALUES (1,NOW())'), error => error.code === "42501");
        } finally { await db.exec("RESET ROLE"); }
    } finally { await db.close(); }
});
