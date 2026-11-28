import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import pg from 'pg';
const testUrl=process.env.TEST_DATABASE_URL;
test('certification and experience APIs isolate private records and skills on native PostgreSQL',{skip:!testUrl&&'Set a fresh local records test database'},async t=>{
  const url=new URL(testUrl);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.search,'');assert.match(url.pathname,/^\/careeros_test_records_[a-z0-9_]+$/);
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
    const request=(endpoint,path='',method='GET',body,index=0)=>fetch(`http://127.0.0.1:${server.address().port}/api/${endpoint}${path}`,{method,headers:{...(index===null?{}:{Authorization:`Bearer ${tokens[index]}`}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const catalogBefore=(await db.query('SELECT * FROM "Skill" ORDER BY id')).rows;
    for(const [endpoint,model,organization,start,end] of [['certifications','Certification','issuer','issuedDate','expiresDate'],['experiences','Experience','organization','startDate','endDate']]){
      let id;
      const base={title:'Private '+model,[organization]:'Fictional provider'};
      await t.test(endpoint+': anonymous operations and caller ownership are denied',async()=>{
        for(const [path,method,body]of [['','GET'],['/1','GET'],['','POST',base],['/1','PATCH',{title:'Denied'}],['/1','DELETE']])assert.equal((await request(endpoint,path,method,body,null)).status,401);
        assert.equal((await request(endpoint,'','POST',{...base,userId:users[1].id})).status,400);assert.equal((await request(endpoint,'?userId=1')).status,400);assert.equal((await request(endpoint,'?limit=51')).status,400);
      });
      await t.test(endpoint+': nested creation is atomic and returns only safe fields',async()=>{
        assert.equal((await request(endpoint,'','POST',{...base,skills:[{skillId:2147483647}]})).status,400);assert.equal((await db.query('SELECT * FROM "'+model+'"')).rowCount,0);
        const response=await request(endpoint,'','POST',{...base,[start]:'2026-11-01',[end]:'2026-11-28',skills:[{skillId:1,evidence:'Private skill explanation'}]});assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');
        const {data}=await response.json();id=data.id;assert.equal(data.userId,undefined);assert.equal(data.skills[0].evidence,'Private skill explanation');assert.equal(data.skills[0].skill.users,undefined);
      });
      await t.test(endpoint+': foreign/missing reads and mutations have identical 404 responses',async()=>{
        assert.deepEqual((await(await request(endpoint,'','GET',undefined,1)).json()).data,[]);
        for(const target of [id,2147483647])for(const [method,body]of [['GET',undefined],['PATCH',{title:'Foreign',skills:[]}],['DELETE',undefined]])assert.equal((await request(endpoint,'/'+target,method,body,1)).status,404);
        assert.equal((await(await request(endpoint,'/'+id)).json()).data.title,base.title);await request(endpoint,'','POST',base,1);
      });
      await t.test(endpoint+': partial dates, current state and invalid links preserve saved data',async()=>{
        assert.equal((await request(endpoint,'/'+id,'PATCH',{[start]:'2026-11-29'})).status,400);
        assert.equal((await request(endpoint,'/'+id,'PATCH',{[start]:'2026-11-28'})).status,200);
        await request(endpoint,'/'+id,'PATCH',{[start]:'2026-11-01'});
        const simultaneous=await Promise.all([request(endpoint,'/'+id,'PATCH',{[start]:'2026-11-20'}),request(endpoint,'/'+id,'PATCH',{[end]:'2026-11-10'})]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,400]);
        if(endpoint==='experiences'){
          assert.equal((await request(endpoint,'/'+id,'PATCH',{isCurrent:true})).status,400);
          assert.equal((await request(endpoint,'/'+id,'PATCH',{isCurrent:true,endDate:null})).status,200);
          assert.equal((await request(endpoint,'/'+id,'PATCH',{endDate:'2026-11-28'})).status,400);
          assert.equal((await request(endpoint,'/'+id,'PATCH',{isCurrent:false,endDate:'2026-11-28'})).status,200);
        }
        assert.equal((await request(endpoint,'/'+id,'PATCH',{title:'Rolled back',skills:[{skillId:2147483647}]})).status,400);
        assert.equal((await(await request(endpoint,'/'+id)).json()).data.title,base.title);
        assert.equal((await(await request(endpoint,'/'+id)).json()).data.skills[0].skillId,1);
      });
      await t.test(endpoint+': evidence replacement, clearing and bounded paging work',async()=>{
        assert.equal((await request(endpoint,'/'+id,'PATCH',{description:null,[end]:null,skills:[{skillId:2,evidence:'Typed responses'}]})).status,200);
        const saved=(await(await request(endpoint,'/'+id)).json()).data;assert.equal(saved[end],null);assert.equal(saved.skills.length,1);assert.equal(saved.skills[0].skillId,2);
        await request(endpoint,'','POST',{...base,title:'Second record'});const page=await(await request(endpoint,'?limit=1')).json();assert.equal(page.data[0]._count.skills,1);assert.ok(page.nextCursor);assert.equal((await(await request(endpoint,'?limit=1&afterId='+page.nextCursor)).json()).data.length,1);
      });
      await t.test(endpoint+': delete cascades only its own skill links',async()=>{
        assert.equal((await request(endpoint,'/'+id,'DELETE')).status,204);assert.equal((await request(endpoint,'/'+id)).status,404);
        const key=model[0].toLowerCase()+model.slice(1)+'Id';assert.equal((await db.query('SELECT * FROM "'+model+'Skill" WHERE "'+key+'"=$1',[id])).rowCount,0);
        assert.equal((await(await request(endpoint,'','GET',undefined,1)).json()).data.length,1);assert.deepEqual((await db.query('SELECT * FROM "Skill" ORDER BY id')).rows,catalogBefore);
      });
    }
    await t.test('revoked sessions cannot read or change either record type',async()=>{
      await db.query('UPDATE "AuthSession" SET "revokedAt"=NOW() WHERE id=$1',[sessions[0]]);
      for(const endpoint of ['certifications','experiences'])for(const [path,method,body]of [['','GET'],['','POST',{}],['/1','PATCH',{skills:[]}],['/1','DELETE']])assert.equal((await request(endpoint,path,method,body)).status,401);
    });
  }finally{if(server)await new Promise(resolve=>server.close(resolve));if(prisma)await prisma.$disconnect();await db.end();}
});
