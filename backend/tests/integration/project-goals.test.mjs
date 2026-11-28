import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import pg from 'pg';
const testUrl=process.env.TEST_DATABASE_URL;
test('project-goal APIs enforce ownership and independent progress on native PostgreSQL',{skip:!testUrl&&'Set a fresh local project-goals test database'},async t=>{
  const url=new URL(testUrl);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.search,'');assert.match(url.pathname,/^\/careeros_test_project_goals_[a-z0-9_]+$/);
  Object.assign(process.env,{DATABASE_URL:testUrl,NODE_ENV:'test',CORS_ORIGINS:''});
  const db=new pg.Client({connectionString:testUrl});await db.connect();let server,prisma;
  try{
    assert.equal((await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public'")).rowCount,0);
    const directory=new URL('../../prisma/migrations/',import.meta.url);
    for(const name of (await readdir(directory,{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort())await db.query(await readFile(new URL(`${name}/migration.sql`,directory),'utf8'));
    const users=(await db.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('A','a@example.test','fixture',NOW()),('B','b@example.test','fixture',NOW()) RETURNING id`)).rows;
    const tokens=[],sessions=[];const {tokenTools}=await import('../../src/utils/auth-tokens.ts');
    for(const user of users){const id=randomUUID(),expires=new Date(Date.now()+600000);sessions.push(id);await db.query('INSERT INTO "AuthSession" (id,"userId","expiresAt") VALUES ($1,$2,$3)',[id,user.id,expires]);tokens.push(await tokenTools(process.env).issue(user.id,id,expires));}
    const {default:app}=await import('../../src/app.ts');({default:prisma}=await import('../../src/config/prisma.ts'));server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const request=(path,method='GET',body,index=0)=>fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method,headers:{...(index===null?{}:{Authorization:'Bearer '+tokens[index]}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const projects=(await db.query(`INSERT INTO "Project" ("userId",title,"updatedAt") VALUES ($1,'A project',NOW()),($2,'B project',NOW()),($1,'Second A project',NOW()) RETURNING id`,[users[0].id,users[1].id])).rows;
    const goals=(await db.query(`INSERT INTO "Goal" ("userId",title,category,status) VALUES ($1,'A active goal','Fixture','ACTIVE'),($2,'B goal','Private','ACTIVE'),($1,'A completed goal','Fixture','COMPLETED') RETURNING id`,[users[0].id,users[1].id])).rows;
    const path='/projects/'+projects[0].id+'/goals';
    await t.test('anonymous calls, malformed bodies, IDs and unbounded queries are denied',async()=>{
      for(const [p,method,body]of [[path,'GET'],[path,'POST',{goalId:goals[0].id}],[path+'/'+goals[0].id,'DELETE'],['/goals/'+goals[0].id+'/projects','GET']])assert.equal((await request(p,method,body,null)).status,401);
      for(const body of [{},{goalId:'1'},{goalId:1,userId:users[1].id},{goalId:1,projectId:2}])assert.equal((await request(path,'POST',body)).status,400);
      assert.equal((await request(path+'?limit=51')).status,400);assert.equal((await request(path+'?userId=2')).status,400);assert.equal((await request('/projects/bad/goals')).status,400);
    });
    await t.test('missing/foreign parents and goals have identical denial behavior',async()=>{
      for(const projectId of [projects[1].id,2147483647]){assert.equal((await request('/projects/'+projectId+'/goals')).status,404);assert.equal((await request('/projects/'+projectId+'/goals','POST',{goalId:goals[0].id})).status,404);}
      for(const goalId of [goals[1].id,2147483647]){assert.equal((await request(path,'POST',{goalId})).status,404);assert.equal((await request('/goals/'+goalId+'/projects')).status,404);}
      assert.equal((await db.query('SELECT * FROM "ProjectGoal"')).rowCount,0);
    });
    await t.test('concurrent duplicate links are safe and do not alter completion',async()=>{
      const responses=await Promise.all([request(path,'POST',{goalId:goals[0].id}),request(path,'POST',{goalId:goals[0].id})]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
      const response=await request(path);assert.equal(response.headers.get('cache-control'),'no-store');const row=(await response.json()).data[0];assert.equal(row.userId,undefined);assert.equal(row.goal.userId,undefined);assert.equal(row.goal.status,'ACTIVE');
      assert.equal((await db.query('SELECT status FROM "Project" WHERE id=$1',[projects[0].id])).rows[0].status,'PLANNED');
    });
    await t.test('both directions paginate owned links and completed goals can be linked',async()=>{
      assert.equal((await request(path,'POST',{goalId:goals[2].id})).status,201);
      assert.equal((await request('/projects/'+projects[2].id+'/goals','POST',{goalId:goals[0].id})).status,201);
      const page=await(await request(path+'?limit=1')).json();assert.equal(page.nextCursor,goals[0].id);assert.equal((await(await request(path+'?limit=1&afterId='+page.nextCursor)).json()).data[0].goal.status,'COMPLETED');
      const reverse=await(await request('/goals/'+goals[0].id+'/projects?limit=1')).json();assert.equal(reverse.data[0].project.title,'A project');assert.equal(reverse.nextCursor,projects[0].id);
      assert.equal((await(await request('/goals/'+goals[0].id+'/projects?afterId='+reverse.nextCursor)).json()).data[0].projectId,projects[2].id);
    });
    await t.test('unlink is owner-scoped and leaves both records intact',async()=>{
      assert.equal((await request(path+'/'+goals[0].id,'DELETE',undefined,1)).status,404);assert.equal((await request(path+'/'+goals[0].id,'DELETE')).status,204);assert.equal((await request(path+'/'+goals[0].id,'DELETE')).status,404);
      assert.equal((await request('/projects/'+projects[0].id)).status,200);assert.equal((await request('/goals/'+goals[0].id)).status,200);
    });
    await t.test('serialized project cap cannot be bypassed by concurrent additions',async()=>{
      const capped=(await db.query(`INSERT INTO "Project" ("userId",title,"updatedAt") VALUES ($1,'Capped',NOW()) RETURNING id`,[users[0].id])).rows[0].id;
      const many=(await db.query(`INSERT INTO "Goal" ("userId",title,category) SELECT $1,'Cap goal '||n,'Fixture' FROM generate_series(1,101) n RETURNING id`,[users[0].id])).rows;
      for(const goal of many.slice(0,99))await db.query('INSERT INTO "ProjectGoal" ("projectId","goalId","userId") VALUES ($1,$2,$3)',[capped,goal.id,users[0].id]);
      const responses=await Promise.all(many.slice(99).map(goal=>request('/projects/'+capped+'/goals','POST',{goalId:goal.id})));assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal((await db.query('SELECT count(*)::int AS n FROM "ProjectGoal" WHERE "projectId"=$1',[capped])).rows[0].n,100);
    });
    await t.test('deleting either parent cleans links and revoked sessions are denied',async()=>{
      assert.equal((await request('/projects/'+projects[0].id,'DELETE')).status,204);assert.equal((await request('/goals/'+goals[2].id)).status,200);assert.equal((await db.query('SELECT * FROM "ProjectGoal" WHERE "projectId"=$1',[projects[0].id])).rowCount,0);
      assert.equal((await request('/goals/'+goals[0].id,'DELETE')).status,204);assert.equal((await request('/projects/'+projects[2].id)).status,200);assert.equal((await db.query('SELECT * FROM "ProjectGoal" WHERE "goalId"=$1',[goals[0].id])).rowCount,0);
      await db.query('UPDATE "AuthSession" SET "revokedAt"=NOW() WHERE id=$1',[sessions[0]]);assert.equal((await request('/projects/'+projects[2].id+'/goals')).status,401);assert.equal((await request('/projects/'+projects[2].id+'/goals','POST',{goalId:goals[2].id})).status,401);
    });
  }finally{if(server)await new Promise(resolve=>server.close(resolve));if(prisma)await prisma.$disconnect();await db.end();}
});
