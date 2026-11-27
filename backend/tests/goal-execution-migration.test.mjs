import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const directory = new URL('../prisma/migrations/', import.meta.url);
const migration = '20261127210000_add_goal_priority_and_subtasks';
const sql = await readFile(new URL(`${migration}/migration.sql`, directory), 'utf8');

test('goal execution migration preserves existing fields, defaults priority and enforces private child records', async () => {
    const db = new PGlite();
    try {
        for (const entry of (await readdir(directory)).filter(name => name < migration && /^\d/.test(name)).sort()) await db.exec(await readFile(new URL(`${entry}/migration.sql`, directory), 'utf8'));
        await db.exec(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Fixture','execution@example.test','fixture',NOW());
            INSERT INTO "Goal" (title,category,status,"userId") VALUES ('Existing goal','Learning','ARCHIVED',1);
            INSERT INTO "CareerProfile" ("userId","targetRole","updatedAt") VALUES (1,'Engineer',NOW())`);
        const goal = (await db.query('SELECT * FROM "Goal"')).rows[0];
        const profile = (await db.query('SELECT * FROM "CareerProfile"')).rows;
        const users = (await db.query('SELECT * FROM "User"')).rows;
        await db.exec(sql);
        const { priority, ...preserved } = (await db.query('SELECT * FROM "Goal"')).rows[0];
        assert.equal(priority, 'MEDIUM'); assert.deepEqual(preserved, goal);
        assert.deepEqual((await db.query('SELECT * FROM "User"')).rows, users);
        assert.deepEqual((await db.query('SELECT * FROM "CareerProfile"')).rows, profile);
        assert.equal((await db.query('SELECT * FROM "Subtask"')).rows.length, 0);
        await db.exec(`INSERT INTO "Subtask" ("goalId",title,"updatedAt") VALUES (1,'First step',NOW())`);
        assert.equal((await db.query('SELECT "isCompleted" FROM "Subtask"')).rows[0].isCompleted, false);
        for (const [statement, code] of [
            [`UPDATE "Goal" SET priority='URGENT'`, '23514'], [`UPDATE "Goal" SET priority=NULL`, '23502'],
            [`INSERT INTO "Subtask" ("goalId",title,"updatedAt") VALUES (999,'No parent',NOW())`, '23503'],
            [`UPDATE "Subtask" SET title='  '`, '23514'], [`UPDATE "Subtask" SET title=repeat('x',201)`, '22001'],
        ]) await assert.rejects(db.exec(statement), error => error.code === code);
        await db.exec(`CREATE ROLE execution_untrusted NOLOGIN; GRANT USAGE ON SCHEMA public TO execution_untrusted;
            GRANT SELECT,INSERT,UPDATE,DELETE ON "Subtask" TO execution_untrusted;
            GRANT USAGE ON SEQUENCE "Subtask_id_seq" TO execution_untrusted; SET ROLE execution_untrusted`);
        try {
            assert.equal((await db.query('SELECT * FROM "Subtask"')).rows.length, 0);
            assert.equal((await db.query(`UPDATE "Subtask" SET title='Denied' RETURNING id`)).rows.length, 0);
            assert.equal((await db.query('DELETE FROM "Subtask" RETURNING id')).rows.length, 0);
            await assert.rejects(db.exec(`INSERT INTO "Subtask" ("goalId",title,"updatedAt") VALUES (1,'Denied',NOW())`), error => error.code === '42501');
        } finally { await db.exec('RESET ROLE'); }
        await db.exec('DELETE FROM "Goal" WHERE id=1');
        assert.equal((await db.query('SELECT * FROM "Subtask"')).rows.length, 0);
        assert.equal((await db.query('SELECT * FROM "User"')).rows.length, 1);
    } finally { await db.close(); }
});

test('goal execution migration rolls back its new column if later DDL fails', async () => {
    const db = new PGlite();
    try {
        await db.exec('CREATE TABLE "Goal" (id SERIAL PRIMARY KEY); CREATE TABLE "Subtask" (id INTEGER)');
        await assert.rejects(db.exec(sql), error => error.code === '42P07'); await db.exec('ROLLBACK');
        assert.equal((await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name='Goal' AND column_name='priority'`)).rows.length, 0);
    } finally { await db.close(); }
});
