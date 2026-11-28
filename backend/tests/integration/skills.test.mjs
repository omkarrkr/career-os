import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import pg from 'pg';
const testUrl=process.env.TEST_DATABASE_URL;
test('skills APIs isolate private self-assessments on native PostgreSQL',{skip:!testUrl&&'Set a fresh local skills test database'},async t=>{
  const url=new URL(testUrl);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.search,'');assert.match(url.pathname,/^\/careeros_test_skills_[a-z0-9_]+$/);
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
    const request=(path='',method='GET',body,index=0)=>fetch(`http://127.0.0.1:${server.address().port}/api/skills${path}`,{method,headers:{...(index===null?{}:{Authorization:`Bearer ${tokens[index]}`}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const catalogBefore=(await db.query('SELECT * FROM "Skill" ORDER BY id')).rows;
    await t.test('anonymous catalog and personal operations are denied',async()=>{
      for(const [path,method,body]of[['/catalog','GET'],['','GET'],['','POST',{skillId:1}],['/1','PATCH',{level:'ADVANCED'}],['/1','DELETE']])assert.equal((await request(path,method,body,null)).status,401);
    });
    await t.test('catalog is searchable, bounded and contains no personal fields',async()=>{
      const response=await request('/catalog?q=SCRIPT&limit=1');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      const first=await response.json();assert.equal(first.data[0].slug,'javascript');assert.ok(first.nextCursor);assert.deepEqual(Object.keys(first.data[0]).sort(),['category','id','name','slug']);
      const next=await(await request(`/catalog?q=SCRIPT&limit=1&afterId=${first.nextCursor}`)).json();assert.equal(next.data[0].slug,'typescript');assert.equal(next.nextCursor,null);
      assert.deepEqual((await(await request('/catalog?q=%25_')).json()).data,[]);
    });
    await t.test('strict validation rejects ownership, catalog edits and malformed data',async()=>{
      for(const body of [{skillId:1,userId:users[1].id},{skillId:1,level:'EXPERT'},{skillId:'1'},{skillId:1,notes:'x'.repeat(1001)},{skillId:1,name:'Changed'}])assert.equal((await request('','POST',body)).status,400);
      for(const path of ['?userId=2','?limit=0','/catalog?q=a&q=b','/catalog?limit=51'])assert.equal((await request(path)).status,400);
      assert.equal((await request('/bad','PATCH',{level:'BEGINNER'})).status,400);
      assert.equal((await request('','POST',{skillId:2147483647})).status,404);
      assert.equal((await request('/catalog','POST',{name:'Not allowed'})).status,404);
    });
    await t.test('concurrent duplicate adds cannot overwrite an existing self-assessment',async()=>{
      const results=await Promise.all([request('','POST',{skillId:1,level:'INTERMEDIATE',notes:'A private note'}),request('','POST',{skillId:1,level:'INTERMEDIATE',notes:'A private note'})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
      assert.equal((await request('','POST',{skillId:1,notes:'Overwrite'})).status,409);
      const data=(await(await request()).json()).data;assert.equal(data.length,1);assert.equal(data[0].notes,'A private note');assert.equal(Object.hasOwn(data[0],'userId'),false);
    });
    await t.test('shared catalog IDs do not share notes or allow foreign-account updates/deletes',async()=>{
      assert.deepEqual((await(await request('','GET',undefined,1)).json()).data,[]);
      assert.equal((await request('/1','PATCH',{notes:'Denied'},1)).status,404);assert.equal((await request('/1','DELETE',undefined,1)).status,404);
      assert.equal((await request('','POST',{skillId:1,notes:'B private note'},1)).status,201);
      assert.equal((await request('/1','PATCH',{level:'ADVANCED'},1)).status,200);
      const a=(await(await request()).json()).data[0],b=(await(await request('','GET',undefined,1)).json()).data[0];assert.equal(a.level,'INTERMEDIATE');assert.equal(a.notes,'A private note');assert.equal(b.notes,'B private note');
      assert.equal((await request('/1','PATCH',{userId:users[1].id})).status,400);
    });
    await t.test('partial edits clear notes explicitly and cursor pages stay owned',async()=>{
      const response=await request('/1','PATCH',{notes:null});assert.equal(response.status,200);const entry=(await response.json()).data;assert.equal(entry.notes,null);assert.equal(entry.level,'INTERMEDIATE');
      assert.equal((await request('','POST',{skillId:2})).status,201);
      const first=await(await request('?limit=1')).json();assert.equal(first.data[0].skillId,1);assert.equal(first.nextCursor,1);
      const next=await(await request(`?limit=1&afterId=${first.nextCursor}`)).json();assert.equal(next.data[0].skillId,2);assert.equal(next.nextCursor,null);
    });
    await t.test('removal affects only the personal link and revoked sessions are denied',async()=>{
      assert.equal((await request('/1','DELETE')).status,204);assert.equal((await request('/1','DELETE')).status,404);assert.equal((await request('/1','PATCH',{notes:'Gone'})).status,404);
      assert.equal((await(await request('','GET',undefined,1)).json()).data[0].notes,'B private note');
      assert.deepEqual((await db.query('SELECT * FROM "Skill" ORDER BY id')).rows,catalogBefore);
      await db.query('UPDATE "AuthSession" SET "revokedAt"=NOW() WHERE id=$1',[sessions[1]]);
      for(const [path,method,body]of[['/catalog','GET'],['','GET'],['','POST',{skillId:3}],['/1','PATCH',{notes:'Denied'}],['/1','DELETE']])assert.equal((await request(path,method,body,1)).status,401);
    });
  }finally{if(server)await new Promise(resolve=>server.close(resolve));if(prisma)await prisma.$disconnect();await db.end();}
});
