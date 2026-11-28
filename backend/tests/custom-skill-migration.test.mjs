import assert from 'node:assert/strict';import test from 'node:test';import {readFile,readdir} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const directory=new URL('../prisma/migrations/',import.meta.url),migration='20261128160000_expand_catalog_and_add_private_custom_skills';
const sql=await readFile(new URL(`${migration}/migration.sql`,directory),'utf8');
test('expanded catalog preserves old identities and links, with account-scoped custom names',async()=>{
 const db=new PGlite();try{
  for(const name of (await readdir(directory)).filter(name=>/^\d/.test(name)&&name<migration).sort())await db.exec(await readFile(new URL(`${name}/migration.sql`,directory),'utf8'));
  await db.exec(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('A','custom-a@example.test','fixture',NOW()),('B','custom-b@example.test','fixture',NOW());INSERT INTO "UserSkill" ("userId","skillId",notes,"updatedAt") VALUES (1,5,'Existing note',NOW());INSERT INTO "Project" ("userId",title,"updatedAt") VALUES (1,'Existing project',NOW());INSERT INTO "ProjectSkill" ("projectId","skillId",evidence,"updatedAt") VALUES (1,5,'Existing evidence',NOW())`);
  const before=(await db.query('SELECT * FROM "Skill" ORDER BY id')).rows,links=(await db.query('SELECT * FROM "ProjectSkill"')).rows;
  await db.exec(sql);assert.equal((await db.query('SELECT * FROM "Skill"')).rows.length,77);
  const original=(await db.query('SELECT id,slug,name,category,"createdAt","updatedAt" FROM "Skill" WHERE id<=8 ORDER BY id')).rows;assert.deepEqual(original,before);assert.deepEqual((await db.query('SELECT * FROM "ProjectSkill"')).rows,links);
  await db.exec(`INSERT INTO "Skill" (slug,name,category,"nameKey","ownerId","updatedAt") VALUES ('custom-a','Personal tool','Custom','personal tool',1,NOW()),('custom-b','Personal tool','Custom','personal tool',2,NOW())`);
  await assert.rejects(db.exec(`INSERT INTO "Skill" (slug,name,category,"nameKey","ownerId","updatedAt") VALUES ('custom-duplicate','Personal Tool','Custom','personal tool',1,NOW())`),e=>e.code==='23505');
  await assert.rejects(db.exec(`INSERT INTO "Skill" (slug,name,category,"nameKey","updatedAt") VALUES ('shared-duplicate','JavaScript','Language','javascript',NOW())`),e=>e.code==='23505');
  await db.exec(`CREATE ROLE custom_untrusted NOLOGIN;GRANT USAGE ON SCHEMA public TO custom_untrusted;GRANT SELECT,UPDATE,DELETE ON "Skill" TO custom_untrusted;SET ROLE custom_untrusted`);assert.equal((await db.query('SELECT * FROM "Skill"')).rows.length,0);assert.equal((await db.query('DELETE FROM "Skill" RETURNING *')).rows.length,0);await db.exec('RESET ROLE');
 }finally{await db.close();}
});
test('catalog expansion rolls back metadata changes if a seed conflicts',async()=>{
 const db=new PGlite();try{
  for(const name of (await readdir(directory)).filter(name=>/^\d/.test(name)&&name<migration).sort())await db.exec(await readFile(new URL(`${name}/migration.sql`,directory),'utf8'));
  await db.exec(`INSERT INTO "Skill" (slug,name,category,"updatedAt") VALUES ('c','Existing C','Language',NOW())`);
  await assert.rejects(db.exec(sql),e=>e.code==='23505');await db.exec('ROLLBACK');assert.equal((await db.query(`SELECT * FROM information_schema.columns WHERE table_name='Skill' AND column_name='ownerId'`)).rows.length,0);
 }finally{await db.close();}
});
