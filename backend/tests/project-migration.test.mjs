import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const directory = new URL('../prisma/migrations/', import.meta.url);
const migration = '20261128120000_add_projects_and_skill_evidence';
const sql = await readFile(new URL(`${migration}/migration.sql`, directory), 'utf8');

test('projects preserve previous records and enforce evidence, dates, limits and private access', async () => {
  const db = new PGlite();
  try {
    for (const name of (await readdir(directory)).filter(name => /^\d/.test(name) && name < migration).sort()) await db.exec(await readFile(new URL(`${name}/migration.sql`, directory), 'utf8'));
    await db.exec(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Fixture','projects@example.test','synthetic',NOW());
      INSERT INTO "Goal" (title,category,"userId") VALUES ('Existing','Test',1);
      INSERT INTO "Subtask" ("goalId",title,"updatedAt") VALUES (1,'Existing step',NOW());
      INSERT INTO "UserSkill" ("userId","skillId",notes,"updatedAt") VALUES (1,1,'Existing private notes',NOW())`);
    const tables = ['User','Goal','Subtask','CareerProfile','AuthSession','RefreshToken','Skill','UserSkill'], before = {};
    for (const table of tables) before[table] = (await db.query(`SELECT * FROM "${table}"`)).rows;
    await db.exec(sql);
    for (const table of tables) assert.deepEqual((await db.query(`SELECT * FROM "${table}"`)).rows, before[table]);
    await db.exec(`INSERT INTO "Project" ("userId",title,"updatedAt") VALUES (1,'Career tracker',NOW());
      INSERT INTO "ProjectSkill" ("projectId","skillId",evidence,"updatedAt") VALUES (1,1,'Built form validation',NOW())`);
    assert.equal((await db.query('SELECT status FROM "Project"')).rows[0].status,'PLANNED');
    for (const [statement,code] of [
      [`UPDATE "Project" SET title='   '`,'23514'],
      [`UPDATE "Project" SET status='UNKNOWN'`,'23514'],
      [`UPDATE "Project" SET "startDate"='2026-11-28',"endDate"='2026-11-27'`,'23514'],
      [`UPDATE "Project" SET "demoUrl"='javascript:alert(1)'`,'23514'],
      [`UPDATE "Project" SET description=repeat('x',3001)`,'22001'],
      [`UPDATE "ProjectSkill" SET evidence=repeat('x',1001)`,'22001'],
      ['INSERT INTO "ProjectSkill" ("projectId","skillId","updatedAt") VALUES (1,1,NOW())','23505'],
      ['INSERT INTO "ProjectSkill" ("projectId","skillId","updatedAt") VALUES (999,1,NOW())','23503'],
      ['INSERT INTO "ProjectSkill" ("projectId","skillId","updatedAt") VALUES (1,999,NOW())','23503'],
      ['DELETE FROM "Skill" WHERE id=1','23503'],
    ]) await assert.rejects(db.exec(statement), error => error.code === code);
    await db.exec(`CREATE ROLE project_untrusted NOLOGIN; GRANT USAGE ON SCHEMA public TO project_untrusted; GRANT SELECT,INSERT,UPDATE,DELETE ON "Project","ProjectSkill" TO project_untrusted; SET ROLE project_untrusted`);
    try {
      for (const table of ['Project','ProjectSkill']) {
        assert.equal((await db.query(`SELECT * FROM "${table}"`)).rows.length,0);
        assert.equal((await db.query(`DELETE FROM "${table}" RETURNING *`)).rows.length,0);
        assert.equal((await db.query(`UPDATE "${table}" SET "updatedAt"=NOW() RETURNING *`)).rows.length,0);
      }
      await assert.rejects(db.exec('INSERT INTO "ProjectSkill" ("projectId","skillId","updatedAt") VALUES (1,2,NOW())'),error=>error.code==='42501');
    } finally { await db.exec('RESET ROLE'); }
    await db.exec('DELETE FROM "UserSkill" WHERE "userId"=1');
    assert.equal((await db.query('SELECT * FROM "ProjectSkill"')).rows.length,1);
    await db.exec('DELETE FROM "Project" WHERE id=1');
    assert.equal((await db.query('SELECT * FROM "ProjectSkill"')).rows.length,0);
    assert.equal((await db.query('SELECT * FROM "Skill"')).rows.length,8);
  } finally { await db.close(); }
});

test('project migration rolls back early DDL on a later conflict', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "User" (id INT PRIMARY KEY); CREATE TABLE "Skill" (id INT PRIMARY KEY); CREATE TABLE "ProjectSkill" (id INT)');
    await assert.rejects(db.exec(sql),error=>error.code==='42P07'); await db.exec('ROLLBACK');
    assert.equal((await db.query(`SELECT to_regclass('public."Project"') AS name`)).rows[0].name,null);
  } finally { await db.close(); }
});
