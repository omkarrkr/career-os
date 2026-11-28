import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
export async function checkProjectGoalStorage(db){
 await db.query('BEGIN');try{
  const suffix=randomUUID();const users=(await db.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('A',$1,'fixture',NOW()),('B',$2,'fixture',NOW()) RETURNING id`,[`link-a-${suffix}@example.test`,`link-b-${suffix}@example.test`])).rows;
  const project=(await db.query(`INSERT INTO "Project" ("userId",title,"updatedAt") VALUES ($1,'Fixture project',NOW()) RETURNING id`,[users[0].id])).rows[0].id;
  const goals=(await db.query(`INSERT INTO "Goal" ("userId",title,category) VALUES ($1,'Own goal','Fixture'),($2,'Foreign goal','Fixture') RETURNING id`,[users[0].id,users[1].id])).rows;
  await db.query('INSERT INTO "ProjectGoal" ("projectId","goalId","userId") VALUES ($1,$2,$3)',[project,goals[0].id,users[0].id]);
  for(const [goal,user,code]of [[goals[1].id,users[0].id,'23503'],[goals[1].id,users[1].id,'23503'],[goals[0].id,users[0].id,'23505']]){
   await db.query('SAVEPOINT denied');let rejected=false;try{await db.query('INSERT INTO "ProjectGoal" ("projectId","goalId","userId") VALUES ($1,$2,$3)',[project,goal,user]);}catch(error){assert.equal(error.code,code);rejected=true;await db.query('ROLLBACK TO SAVEPOINT denied');}assert.equal(rejected,true);
  }
  const role='links_'+randomUUID().replaceAll('-','');await db.query(`CREATE ROLE "${role}" NOLOGIN`);await db.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON "ProjectGoal" TO "${role}"`);await db.query(`SET ROLE "${role}"`);
  assert.equal((await db.query('SELECT * FROM "ProjectGoal"')).rows.length,0);assert.equal((await db.query('DELETE FROM "ProjectGoal" RETURNING *')).rows.length,0);assert.equal((await db.query('UPDATE "ProjectGoal" SET "createdAt"=NOW() RETURNING *')).rows.length,0);
  await db.query('SAVEPOINT private_insert');let denied=false;try{await db.query('INSERT INTO "ProjectGoal" ("projectId","goalId","userId") VALUES ($1,$2,$3)',[project,goals[0].id,users[0].id]);}catch(error){assert.equal(error.code,'42501');denied=true;await db.query('ROLLBACK TO SAVEPOINT private_insert');}assert.equal(denied,true);await db.query('RESET ROLE');
  await db.query('DELETE FROM "Project" WHERE id=$1',[project]);assert.equal((await db.query('SELECT * FROM "ProjectGoal" WHERE "projectId"=$1',[project])).rows.length,0);assert.equal((await db.query('SELECT status FROM "Goal" WHERE id=$1',[goals[0].id])).rows[0].status,'ACTIVE');
  const second=(await db.query(`INSERT INTO "Project" ("userId",title,"updatedAt") VALUES ($1,'Second fixture',NOW()) RETURNING id`,[users[0].id])).rows[0].id;
  await db.query('INSERT INTO "ProjectGoal" ("projectId","goalId","userId") VALUES ($1,$2,$3)',[second,goals[0].id,users[0].id]);await db.query('DELETE FROM "Goal" WHERE id=$1',[goals[0].id]);assert.equal((await db.query('SELECT * FROM "ProjectGoal" WHERE "projectId"=$1',[second])).rows.length,0);assert.equal((await db.query('SELECT * FROM "Project" WHERE id=$1',[second])).rows.length,1);
 }finally{await db.query('ROLLBACK');}
}
