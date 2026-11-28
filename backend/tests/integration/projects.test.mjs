import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import pg from 'pg';
const testUrl=process.env.TEST_DATABASE_URL;
test('project APIs isolate private work and related skill evidence on native PostgreSQL',{skip:!testUrl&&'Set a fresh local projects test database'},async t=>{
  const url=new URL(testUrl);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.search,'');assert.match(url.pathname,/^\/careeros_test_projects_[a-z0-9_]+$/);
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
    const request=(path='',method='GET',body,index=0)=>fetch(`http://127.0.0.1:${server.address().port}/api/projects${path}`,{method,headers:{...(index===null?{}:{Authorization:`Bearer ${tokens[index]}`}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    let projectId;
    const catalogBefore=(await db.query('SELECT * FROM "Skill" ORDER BY id')).rows;
    await t.test('anonymous project operations are denied',async()=>{
      for(const [path,method,body]of[['','GET'],['/1','GET'],['','POST',{title:'Hidden'}],['/1','PATCH',{title:'Changed'}],['/1','DELETE']])assert.equal((await request(path,method,body,null)).status,401);
    });
    await t.test('create is atomic, validates all fields and returns safe owned data',async()=>{
      assert.equal((await request('','POST',{title:'Bad',userId:users[1].id})).status,400);
      assert.equal((await request('','POST',{title:'Bad',skills:[{skillId:2147483647}]})).status,400);
      assert.equal((await db.query('SELECT * FROM "Project"')).rowCount,0);
      for(const body of [{title:'x',demoUrl:'javascript:alert(1)'},{title:'x',skills:[{skillId:1},{skillId:1}]},{title:'x',startDate:'2026-11-28',endDate:'2026-11-27'}])assert.equal((await request('','POST',body)).status,400);
      const response=await request('','POST',{title:'Private tracker',startDate:'2026-11-01',endDate:'2026-11-28',skills:[{skillId:1,evidence:'Built private forms'}]});
      assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');const {data}=await response.json();projectId=data.id;
      assert.equal(data.status,'PLANNED');assert.equal(data.userId,undefined);assert.equal(data.skills[0].evidence,'Built private forms');assert.equal(data.skills[0].skill.users,undefined);
    });
    await t.test('list/detail and all related writes isolate owners and missing IDs',async()=>{
      assert.deepEqual((await(await request('','GET',undefined,1)).json()).data,[]);
      for(const target of [projectId,2147483647])for(const [method,body]of [['GET',undefined],['PATCH',{title:'Foreign',skills:[]}],['DELETE',undefined]])assert.equal((await request('/'+target,method,body,1)).status,404);
      assert.equal((await request('?userId=1')).status,400);assert.equal((await request('?limit=51')).status,400);assert.equal((await request('/bad')).status,400);
      assert.equal((await(await request('/'+projectId)).json()).data.title,'Private tracker');
      await request('','POST',{title:'Second tracker'},1);assert.equal((await(await request('','GET',undefined,1)).json()).data.length,1);
    });
    await t.test('patch merges dates and rolls back invalid evidence replacement',async()=>{
      assert.equal((await request('/'+projectId,'PATCH',{startDate:'2026-11-29'})).status,400);
      assert.equal((await request('/'+projectId,'PATCH',{title:'Rolled back',skills:[{skillId:2147483647}]})).status,400);
      let saved=(await(await request('/'+projectId)).json()).data;assert.equal(saved.title,'Private tracker');assert.equal(saved.skills[0].evidence,'Built private forms');
      assert.equal((await request('/'+projectId,'PATCH',{endDate:null,outcome:'Built a working tracker',status:'COMPLETED',skills:[{skillId:2,evidence:'Typed API responses'}]})).status,200);
      saved=(await(await request('/'+projectId)).json()).data;assert.equal(saved.startDate.slice(0,10),'2026-11-01');assert.equal(saved.endDate,null);assert.equal(saved.skills.length,1);assert.equal(saved.skills[0].skillId,2);
      await db.query('INSERT INTO "UserSkill" ("userId","skillId","updatedAt") VALUES ($1,2,NOW())',[users[0].id]);await db.query('DELETE FROM "UserSkill" WHERE "userId"=$1',[users[0].id]);
      assert.equal((await(await request('/'+projectId)).json()).data.skills.length,1);
    });
    await t.test('concurrent partial dates cannot combine into an invalid range',async()=>{
      await request('/'+projectId,'PATCH',{startDate:'2026-11-01',endDate:'2026-11-28'});
      assert.equal((await request('/'+projectId,'PATCH',{startDate:'2026-11-28'})).status,200);
      assert.equal((await request('/'+projectId,'PATCH',{endDate:'2026-11-28'})).status,200);
      await request('/'+projectId,'PATCH',{startDate:'2026-11-01',endDate:'2026-11-28'});
      const results=await Promise.all([request('/'+projectId,'PATCH',{startDate:'2026-11-20'}),request('/'+projectId,'PATCH',{endDate:'2026-11-10'})]);
      assert.deepEqual(results.map(response=>response.status).sort(),[200,400]);
      const saved=(await(await request('/'+projectId)).json()).data;assert.ok(saved.startDate<=saved.endDate);
    });
    await t.test('paging is bounded and removal cascades only project evidence',async()=>{
      await request('','POST',{title:'Another project'});const page=await(await request('?limit=1')).json();assert.equal(page.data.length,1);assert.equal(page.data[0]._count.skills,1);assert.ok(page.nextCursor);
      const next=await(await request('?limit=1&afterId='+page.nextCursor)).json();assert.equal(next.data.length,1);assert.equal(next.nextCursor,null);
      assert.equal((await request('/'+projectId,'DELETE')).status,204);assert.equal((await request('/'+projectId)).status,404);
      assert.equal((await db.query('SELECT * FROM "ProjectSkill" WHERE "projectId"=$1',[projectId])).rowCount,0);
      assert.equal((await(await request('','GET',undefined,1)).json()).data.length,1);assert.deepEqual((await db.query('SELECT * FROM "Skill" ORDER BY id')).rows,catalogBefore);
    });
    await t.test('revoked sessions cannot read or mutate projects',async()=>{
      await db.query('UPDATE "AuthSession" SET "revokedAt"=NOW() WHERE id=$1',[sessions[0]]);
      for(const [path,method,body]of[['','GET'],['','POST',{title:'Denied'}],['/1','PATCH',{skills:[]}],['/1','DELETE']])assert.equal((await request(path,method,body)).status,401);
    });
  }finally{if(server)await new Promise(resolve=>server.close(resolve));if(prisma)await prisma.$disconnect();await db.end();}
});
