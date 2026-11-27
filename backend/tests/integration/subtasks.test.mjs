import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const testUrl = process.env.TEST_DATABASE_URL;
test('priority and subtask APIs on disposable native PostgreSQL', { skip: !testUrl && 'Set a fresh local subtask test database' }, async t => {
    const url = new URL(testUrl); assert.ok(['127.0.0.1','localhost'].includes(url.hostname)); assert.equal(url.search, ''); assert.match(url.pathname, /^\/careeros_test_subtasks_[a-z0-9_]+$/);
    Object.assign(process.env, { DATABASE_URL: testUrl, NODE_ENV: 'test', CORS_ORIGINS: '' });
    const db = new pg.Client({ connectionString: testUrl }); await db.connect(); let server, prisma;
    try {
        assert.equal((await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public'")).rowCount, 0);
        const directory = new URL('../../prisma/migrations/', import.meta.url);
        for (const name of (await readdir(directory, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort()) await db.query(await readFile(new URL(`${name}/migration.sql`, directory), 'utf8'));
        const users = (await db.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('A','a@example.test','fixture',NOW()),('B','b@example.test','fixture',NOW()) RETURNING id`)).rows;
        const goals = [];
        for (const user of users) goals.push((await db.query(`INSERT INTO "Goal" (title,category,"userId") VALUES ('Goal','Learning',$1) RETURNING id`, [user.id])).rows[0].id);
        const tokens = [], sessions = []; const { tokenTools } = await import('../../src/utils/auth-tokens.ts');
        for (const user of users) { const id = randomUUID(), expires = new Date(Date.now()+600000); sessions.push(id); await db.query('INSERT INTO "AuthSession" (id,"userId","expiresAt") VALUES ($1,$2,$3)',[id,user.id,expires]); tokens.push(await tokenTools(process.env).issue(user.id,id,expires)); }
        const { default: app } = await import('../../src/app.ts'); ({ default: prisma } = await import('../../src/config/prisma.ts'));
        server = app.listen(0,'127.0.0.1'); await once(server,'listening');
        const request = (path, method='GET', body, index=0) => fetch(`http://127.0.0.1:${server.address().port}/api/goals${path}`, { method, headers: { ...(index === null ? {} : { Authorization: `Bearer ${tokens[index]}` }), ...(body === undefined ? {} : { 'Content-Type':'application/json' }) }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
        const base = `/${goals[0]}/subtasks`; let first, second;
        await t.test('anonymous operations and foreign parent reads/creates are denied', async () => {
            for (const method of ['GET','POST','PATCH','DELETE']) assert.equal((await request(method==='PATCH'||method==='DELETE'?`${base}/1`:base,method,method==='POST'?{title:'Denied'}:method==='PATCH'?{isCompleted:true}:undefined,null)).status,401);
            for (const method of ['GET','POST']) assert.equal((await request(base,method,method==='POST'?{title:'Denied'}:undefined,1)).status,404);
            assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "Subtask"')).rows[0].n,0);
        });
        await t.test('priority defaults and updates preserve account ownership', async () => {
            const created = await request('', 'POST', { title:'Priority goal', category:'Learning', priority:'HIGH' }); assert.equal(created.status,201); const goal=(await created.json()).data;
            assert.equal(goal.priority,'HIGH'); assert.equal(goal.userId,users[0].id);
            const changed=await request(`/${goal.id}`,'PATCH',{priority:'LOW'}); assert.equal((await changed.json()).data.priority,'LOW');
            assert.equal((await request(`/${goal.id}`,'PATCH',{priority:'MEDIUM'},1)).status,404);
            assert.equal((await request(`/${goal.id}`,'PATCH',{priority:'URGENT'})).status,400);
            assert.equal((await request(`/${goals[0]}`)).status,200);
        });
        await t.test('validation rejects spoofed fields and malformed IDs/queries before writes', async () => {
            for (const body of [{title:' '},{title:'x'.repeat(201)},{title:'Spoof',goalId:goals[1]},{title:'Spoof',userId:users[1].id},{title:'Spoof',isCompleted:true}]) assert.equal((await request(base,'POST',body)).status,400);
            for (const path of ['/invalid/subtasks',`${base}?limit=51`,`${base}?limit=1&limit=2`,`${base}?afterId=0`]) assert.equal((await request(path)).status,400);
        });
        await t.test('owned creation, bounded paging and complete-list summary use safe fields', async () => {
            for (const title of ['First step','Second step']) { const result=await request(base,'POST',{title}); assert.equal(result.status,201); const task=(await result.json()).data; assert.equal(task.goalId,goals[0]); assert.equal(task.isCompleted,false); assert.equal(Object.hasOwn(task,'userId'),false); if(!first)first=task;else second=task; }
            const page=(await(await request(`${base}?limit=1`)).json()); assert.deepEqual(page.summary,{total:2,completed:0}); assert.equal(page.nextCursor,first.id); assert.equal(page.data.length,1);
            const next=await(await request(`${base}?limit=1&afterId=${page.nextCursor}`)).json(); assert.equal(next.data[0].id,second.id); assert.equal(next.nextCursor,null);
        });
        await t.test('foreign and wrong-parent child mutations are indistinguishable from missing', async () => {
            for (const method of ['PATCH','DELETE']) {
                const body=method==='PATCH'?{title:'Denied'}:undefined;
                assert.equal((await request(`${base}/${first.id}`,method,body,1)).status,404);
                assert.equal((await request(`/${goals[1]}/subtasks/${first.id}`,method,body,1)).status,404);
                assert.equal((await request(`${base}/2147483647`,method,body)).status,404);
            }
            assert.equal((await request(`${base}/${first.id}`,'PATCH',{goalId:goals[1]})).status,400);
            assert.equal((await request(`${base}/${first.id}`,'PATCH',{})).status,400);
        });
        await t.test('renaming, checking and unchecking preserve parent status and priority', async () => {
            const before=(await db.query('SELECT * FROM "Goal" WHERE id=$1',[goals[0]])).rows[0];
            let response=await request(`${base}/${first.id}`,'PATCH',{title:'Renamed',isCompleted:true}); assert.equal(response.status,200); assert.equal((await response.json()).data.title,'Renamed');
            assert.deepEqual((await(await request(base)).json()).summary,{total:2,completed:1});
            await request(`${base}/${first.id}`,'PATCH',{isCompleted:false});
            assert.deepEqual((await db.query('SELECT * FROM "Goal" WHERE id=$1',[goals[0]])).rows[0],before);
        });
        await t.test('concurrent additions cannot exceed 100 subtasks', async () => {
            const cap=(await db.query(`INSERT INTO "Goal" (title,category,"userId") VALUES ('Cap','Test',$1) RETURNING id`,[users[0].id])).rows[0].id;
            await db.query(`INSERT INTO "Subtask" ("goalId",title,"updatedAt") SELECT $1,'Step '||n,NOW() FROM generate_series(1,99) n`,[cap]);
            const results=await Promise.all([request(`/${cap}/subtasks`,'POST',{title:'Concurrent A'}),request(`/${cap}/subtasks`,'POST',{title:'Concurrent B'})]);
            assert.deepEqual(results.map(r=>r.status).sort(),[201,409]); assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "Subtask" WHERE "goalId"=$1',[cap])).rows[0].n,100);
        });
        await t.test('deletion is scoped, parent cascade works and revoked sessions are denied', async () => {
            assert.equal((await request(`${base}/${first.id}`,'DELETE')).status,204);
            assert.equal((await request(`${base}/${first.id}`,'DELETE')).status,404);
            assert.equal((await request(`/${goals[0]}`,'DELETE')).status,204);
            assert.equal((await db.query('SELECT * FROM "Subtask" WHERE "goalId"=$1',[goals[0]])).rowCount,0);
            await db.query('UPDATE "AuthSession" SET "revokedAt"=NOW() WHERE id=$1',[sessions[1]]);
            for(const method of ['GET','POST','PATCH','DELETE'])assert.equal((await request(method==='GET'||method==='POST'?`/${goals[1]}/subtasks`:`/${goals[1]}/subtasks/1`,method,method==='POST'?{title:'Denied'}:method==='PATCH'?{isCompleted:true}:undefined,1)).status,401);
        });
    } finally { if(server)await new Promise(resolve=>server.close(resolve)); if(prisma)await prisma.$disconnect(); await db.end(); }
});
