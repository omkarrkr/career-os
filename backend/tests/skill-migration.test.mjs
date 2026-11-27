import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const directory = new URL('../prisma/migrations/', import.meta.url);
const migration = '20261128100000_add_skill_catalog_and_user_skills';
const sql = await readFile(new URL(`${migration}/migration.sql`, directory), 'utf8');
test('skill storage preserves existing records, separates catalog from private levels and enforces relations', async () => {
    const db = new PGlite();
    try {
        for (const name of (await readdir(directory)).filter(name => /^\d/.test(name) && name < migration).sort()) await db.exec(await readFile(new URL(`${name}/migration.sql`,directory),'utf8'));
        await db.exec(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Fixture','skills@example.test','synthetic',NOW());
            INSERT INTO "Goal" (title,category,priority,"userId") VALUES ('Existing','Test','HIGH',1);
            INSERT INTO "Subtask" ("goalId",title,"isCompleted","updatedAt") VALUES (1,'Existing step',true,NOW())`);
        const tables=['User','Goal','Subtask','CareerProfile','AuthSession','RefreshToken'], before={};
        for(const table of tables)before[table]=(await db.query(`SELECT * FROM "${table}"`)).rows;
        await db.exec(sql);
        for(const table of tables)assert.deepEqual((await db.query(`SELECT * FROM "${table}"`)).rows,before[table]);
        assert.equal((await db.query('SELECT * FROM "Skill"')).rows.length,8);
        assert.equal((await db.query('SELECT * FROM "UserSkill"')).rows.length,0);
        await db.exec('INSERT INTO "UserSkill" ("userId","skillId","updatedAt") VALUES (1,1,NOW())');
        assert.equal((await db.query('SELECT level FROM "UserSkill"')).rows[0].level,'BEGINNER');
        for(const [statement,code] of [
            ['INSERT INTO "UserSkill" ("userId","skillId","updatedAt") VALUES (1,1,NOW())','23505'],
            ['INSERT INTO "UserSkill" ("userId","skillId","updatedAt") VALUES (999,1,NOW())','23503'],
            ['INSERT INTO "UserSkill" ("userId","skillId","updatedAt") VALUES (1,999,NOW())','23503'],
            [`UPDATE "UserSkill" SET level='EXPERT'`,'23514'],
            [`UPDATE "UserSkill" SET notes=repeat('x',1001)`,'22001'],
            ['DELETE FROM "Skill" WHERE id=1','23503'],
            [`UPDATE "Skill" SET slug='Invalid Slug' WHERE id=1`,'23514'],
            [`INSERT INTO "Skill" (slug,name,category,"updatedAt") VALUES ('javascript','Duplicate','Test',NOW())`,'23505'],
        ])await assert.rejects(db.exec(statement),error=>error.code===code);
        await db.exec(`CREATE ROLE skill_untrusted NOLOGIN; GRANT USAGE ON SCHEMA public TO skill_untrusted; GRANT SELECT,INSERT,UPDATE,DELETE ON "Skill","UserSkill" TO skill_untrusted; SET ROLE skill_untrusted`);
        try {
            for(const table of ['Skill','UserSkill']) {
                assert.equal((await db.query(`SELECT * FROM "${table}"`)).rows.length,0);
                assert.equal((await db.query(`UPDATE "${table}" SET ${table==='Skill'?'name':'notes'}='Denied' RETURNING *`)).rows.length,0);
                assert.equal((await db.query(`DELETE FROM "${table}" RETURNING *`)).rows.length,0);
            }
            await assert.rejects(db.exec('INSERT INTO "UserSkill" ("userId","skillId","updatedAt") VALUES (1,2,NOW())'),error=>error.code==='42501');
        } finally { await db.exec('RESET ROLE'); }
        assert.equal((await db.query('SELECT * FROM "Skill"')).rows.length,8);
        await db.exec('DELETE FROM "UserSkill" WHERE "userId"=1 AND "skillId"=1');
        assert.equal((await db.query('SELECT * FROM "Skill"')).rows.length,8);
    } finally { await db.close(); }
});
test('skill migration rolls back early DDL if a later table already exists', async () => {
    const db=new PGlite();
    try {
        await db.exec('CREATE TABLE "User" (id INT PRIMARY KEY); CREATE TABLE "UserSkill" (id INT)');
        await assert.rejects(db.exec(sql),error=>error.code==='42P07'); await db.exec('ROLLBACK');
        assert.equal((await db.query(`SELECT to_regclass('public."Skill"') AS name`)).rows[0].name,null);
    } finally { await db.close(); }
});
