import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import pg from 'pg';
const testUrl=process.env.TEST_DATABASE_URL;
test('custom skills are private across all linking APIs on native PostgreSQL',{skip:!testUrl&&'Set a fresh local custom skills test database'},async t=>{
  const url=new URL(testUrl);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.search,'');assert.match(url.pathname,/^\/careeros_test_custom_skills_[a-z0-9_]+$/);
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
    let skillId,peerSkillId;
    await t.test('expanded shared catalog is searchable and custom endpoint is authenticated/strict',async()=>{
      assert.equal((await db.query('SELECT * FROM "Skill" WHERE "ownerId" IS NULL')).rowCount,77);
      assert.equal((await request('/custom','POST',{name:'Hidden'},null)).status,401);
      for(const body of [{name:' '},{name:'x'.repeat(81)},{name:'Tool',ownerId:users[1].id},{name:'Tool',slug:'published'}])assert.equal((await request('/custom','POST',body)).status,400);
      const docker=await(await request('/catalog?q=docker')).json();assert.equal(docker.data[0].name,'Docker');
      const shared=await(await request('/custom','POST',{name:'  Ｒｅａｃｔ  ',category:'Override'})).json();assert.equal(shared.data.id,5);assert.equal(shared.data.category,'Frontend');
    });
    await t.test('concurrent duplicate names reuse the private identity and never overwrite',async()=>{
      const responses=await Promise.all([request('/custom','POST',{name:'  Quantum   Toolkit ',category:'Personal research'}),request('/custom','POST',{name:'quantum toolkit',category:'Second category'})]);
      for(const response of responses)assert.equal(response.status,200);
      const a=(await responses[0].json()).data,b=(await responses[1].json()).data;skillId=a.id;assert.equal(a.id,b.id);assert.equal(a.ownerId,undefined);assert.equal(a.nameKey,undefined);
      const repeated=(await(await request('/custom','POST',{name:'QUANTUM TOOLKIT',category:'Overwrite'})).json()).data;assert.equal(repeated.id,skillId);assert.equal(repeated.category,a.category);
      peerSkillId=(await(await request('/custom','POST',{name:'Quantum Toolkit'},1)).json()).data.id;assert.notEqual(peerSkillId,skillId);
    });
    await t.test('search and personal assessment writes reject another account custom ID',async()=>{
      for(const [index,own,foreign]of [[0,skillId,peerSkillId],[1,peerSkillId,skillId]]){
        const matches=(await(await request('/catalog?q=quantum','GET',undefined,index)).json()).data;assert.deepEqual(matches.map(item=>item.id),[own]);
        assert.equal((await request('','POST',{skillId:foreign},index)).status,404);assert.equal((await request('','POST',{skillId:2147483647},index)).status,404);
        assert.equal((await request('','POST',{skillId:own,notes:'Own assessment'},index)).status,201);
      }
    });
    await t.test('every evidence create/update validates visible skills and rolls back foreign links',async()=>{
      const root='http://127.0.0.1:'+server.address().port+'/api/';
      const resource=(endpoint,path,method,body)=>fetch(root+endpoint+path,{method,headers:{Authorization:'Bearer '+tokens[0],'Content-Type':'application/json'},body:JSON.stringify(body)});
      for(const [endpoint,required]of [['projects',{}],['certifications',{issuer:'Fictional'}],['experiences',{organization:'Fictional'}]]){
        const base={title:'Owned '+endpoint,...required};
        assert.equal((await resource(endpoint,'','POST',{...base,skills:[{skillId:peerSkillId}]})).status,400);
        const created=await resource(endpoint,'','POST',{...base,skills:[{skillId,evidence:'Private evidence'}]});assert.equal(created.status,201);const entry=(await created.json()).data;
        assert.equal((await resource(endpoint,'/'+entry.id,'PATCH',{title:'Should roll back',skills:[{skillId:peerSkillId}]})).status,400);
        const saved=await fetch(root+endpoint+'/'+entry.id,{headers:{Authorization:'Bearer '+tokens[0]}});const data=(await saved.json()).data;assert.equal(data.title,base.title);assert.equal(data.skills[0].skillId,skillId);
      }
    });
    await t.test('removing an assessment preserves custom choices/evidence and revoked writes are denied',async()=>{
      assert.equal((await request('/'+skillId,'DELETE')).status,204);assert.equal((await(await request('/catalog?q=quantum')).json()).data[0].id,skillId);
      assert.equal((await db.query('SELECT * FROM "ProjectSkill" WHERE "skillId"=$1',[skillId])).rowCount,1);
      await db.query('UPDATE "AuthSession" SET "revokedAt"=NOW() WHERE id=$1',[sessions[0]]);assert.equal((await request('/custom','POST',{name:'Denied'})).status,401);
    });
  }finally{if(server)await new Promise(resolve=>server.close(resolve));if(prisma)await prisma.$disconnect();await db.end();}
});
