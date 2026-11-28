import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { checkCareerRecords } from './helpers/career-record-checks.mjs';
const directory=new URL('../prisma/migrations/',import.meta.url), migration='20261128140000_add_certifications_and_experience';
const sql=await readFile(new URL(`${migration}/migration.sql`,directory),'utf8');
test('certification/experience storage preserves prior work and enforces dates, links, limits and privacy',async()=>{
  const db=new PGlite();try{
    for(const name of (await readdir(directory)).filter(name=>/^\d/.test(name)&&name<migration).sort())await db.exec(await readFile(new URL(`${name}/migration.sql`,directory),'utf8'));
    await db.exec(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Fixture','before-records@example.test','synthetic',NOW());
      INSERT INTO "UserSkill" ("userId","skillId",notes,"updatedAt") VALUES (1,1,'Private level',NOW());
      INSERT INTO "Project" ("userId",title,"updatedAt") VALUES (1,'Existing work',NOW());
      INSERT INTO "ProjectSkill" ("projectId","skillId",evidence,"updatedAt") VALUES (1,1,'Existing contribution',NOW())`);
    const tables=['User','AuthSession','RefreshToken','CareerProfile','Goal','Subtask','Skill','UserSkill','Project','ProjectSkill'], before={};
    for(const table of tables)before[table]=(await db.query(`SELECT * FROM "${table}"`)).rows;
    await db.exec(sql);await checkCareerRecords(db);
    for(const table of tables)assert.deepEqual((await db.query(`SELECT * FROM "${table}"`)).rows,before[table]);
    for(const table of ['Certification','CertificationSkill','Experience','ExperienceSkill'])assert.equal((await db.query(`SELECT * FROM "${table}"`)).rows.length,0);
  }finally{await db.close();}
});
test('career-record migration rolls back early tables if a later table conflicts',async()=>{
  const db=new PGlite();try{
    await db.exec('CREATE TABLE "User" (id INT PRIMARY KEY);CREATE TABLE "Skill" (id INT PRIMARY KEY);CREATE TABLE "Experience" (id INT)');
    await assert.rejects(db.exec(sql),error=>error.code==='42P07');await db.exec('ROLLBACK');
    assert.equal((await db.query(`SELECT to_regclass('public."Certification"') AS name`)).rows[0].name,null);
  }finally{await db.close();}
});
