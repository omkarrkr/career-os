import assert from 'node:assert/strict';import test from 'node:test';import {readFile,readdir} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {checkProjectGoalStorage} from './helpers/project-goal-checks.mjs';
const directory=new URL('../prisma/migrations/',import.meta.url),migration='20261128180000_add_owned_project_goal_links';const sql=await readFile(new URL(`${migration}/migration.sql`,directory),'utf8');
test('project-goal links enforce same owner, preserve existing fields and cascade only connections',async()=>{
 const db=new PGlite();try{
  for(const name of (await readdir(directory)).filter(name=>/^\d/.test(name)&&name<migration).sort())await db.exec(await readFile(new URL(`${name}/migration.sql`,directory),'utf8'));
  const tables=['User','Goal','Project','Skill','UserSkill','ProjectSkill','Certification','CertificationSkill','Experience','ExperienceSkill','Subtask','CareerProfile','AuthSession','RefreshToken'],before={};for(const table of tables)before[table]=(await db.query(`SELECT * FROM "${table}"`)).rows;
  await db.exec(sql);await checkProjectGoalStorage(db);for(const table of tables)assert.deepEqual((await db.query(`SELECT * FROM "${table}"`)).rows,before[table]);
 }finally{await db.close();}
});
test('link migration rolls back parent indexes when a later table conflicts',async()=>{
 const db=new PGlite();try{await db.exec('CREATE TABLE "Goal" (id INT,"userId" INT);CREATE TABLE "Project" (id INT,"userId" INT);CREATE TABLE "ProjectGoal" (id INT)');await assert.rejects(db.exec(sql),e=>e.code==='42P07');await db.exec('ROLLBACK');assert.equal((await db.query(`SELECT to_regclass('public."Goal_id_userId_key"') AS name`)).rows[0].name,null);}finally{await db.close();}
});
