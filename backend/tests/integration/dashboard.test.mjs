import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const testUrl = process.env.TEST_DATABASE_URL;
test('owned dashboard aggregates on isolated native PostgreSQL', { skip: !testUrl && 'Set TEST_DATABASE_URL to a fresh local dashboard test database' }, async (t) => {
    const url = new URL(testUrl);
    assert.ok(['localhost','127.0.0.1'].includes(url.hostname)); assert.equal(url.search, '');
    assert.match(url.pathname, /^\/careeros_test_dashboard_[a-z0-9_]+$/);
    Object.assign(process.env, { DATABASE_URL: testUrl, NODE_ENV: 'test', CORS_ORIGINS: '', PORT: '3000' });
    const db = new pg.Client({ connectionString: testUrl, connectionTimeoutMillis: 5000, query_timeout: 15000 }); await db.connect();
    let server, prisma;
    try {
        assert.equal((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rowCount, 0);
        const directory = new URL('../../prisma/migrations/', import.meta.url);
        for (const migration of (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
            await db.query(await readFile(new URL(`${migration}/migration.sql`, directory), 'utf8'));
        }
        const users = (await db.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('A','a@example.test','fixture',NOW()),('B','b@example.test','fixture',NOW()),('Empty','empty@example.test','fixture',NOW()) RETURNING id`)).rows;
        await db.query(`INSERT INTO "CareerProfile" ("userId",institution,degree,"graduationYear","targetRole","weeklyLearningHours","updatedAt") VALUES ($1,'A College','A degree',2028,'A role',8,NOW()),($2,'B College','B degree',2029,'B private role',12,NOW())`, [users[0].id, users[1].id]);
        const { tokenTools } = await import('../../src/utils/auth-tokens.ts');
        const tokens = [], sessions = [];
        for (const user of users) {
            const session = randomUUID(), expiry = new Date(Date.now() + 600000);
            await db.query('INSERT INTO "AuthSession" (id,"userId","expiresAt") VALUES ($1,$2,$3)', [session, user.id, expiry.toISOString()]);
            tokens.push(await tokenTools(process.env).issue(user.id, session, expiry)); sessions.push(session);
        }
        const now = new Date(), today = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())).toISOString();
        const rows = [
            ['A overdue','ACTIVE','2000-01-01'], ['A today','ACTIVE',today], ['A future','ACTIVE','2099-01-01'],
            ['A undated','ACTIVE',null], ['A completed','COMPLETED','2000-01-01'], ['A archived','ARCHIVED','2000-01-01'],
            ['A lowercase status','completed',null],
        ];
        const ids = [];
        for (const [title,status,target] of rows) ids.push((await db.query('INSERT INTO "Goal" (title,category,status,"targetDate","userId","createdAt") VALUES ($1,\'Development\',$2,$3,$4,\'2026-01-01\') RETURNING id',[title,status,target,users[0].id])).rows[0].id);
        await db.query(`INSERT INTO "Goal" (title,category,status,"targetDate","userId") VALUES ('B private goal','Private','ACTIVE','2000-01-01',$1)`,[users[1].id]);
        const { default: app } = await import('../../src/app.ts'); ({ default: prisma } = await import('../../src/config/prisma.ts'));
        server = app.listen(0,'127.0.0.1'); await once(server,'listening');
        const request = (index, suffix='') => fetch(`http://127.0.0.1:${server.address().port}/api/users/dashboard${suffix}`, { headers: index===undefined?{}:{ Authorization:`Bearer ${tokens[index]}` } });
        const snapshots = async () => {
            const values=[];
            for(const table of ['User','CareerProfile','Goal','AuthSession','RefreshToken'])values.push((await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb)::text AS data FROM "${table}" t`)).rows[0].data);
            return values;
        };
        const before = await snapshots();
        await t.test('anonymous requests are denied before dashboard queries', async () => {
            const response=await request(); assert.equal(response.status,401); assert.deepEqual(await response.json(),{message:'Invalid or expired session'});
        });
        await t.test('counts all owned statuses and excludes due-today/completed/other goals from overdue',async()=>{
            const response=await request(0);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
            const {data}=await response.json();assert.deepEqual(data.goals,{total:7,active:4,completed:1,other:2,overdue:1});
            assert.equal(data.overdueBefore,today);assert.equal(data.profile.targetRole,'A role');assert.equal(data.completeness.isComplete,true);
            assert.equal(data.recentGoals.length,5);assert.deepEqual(data.recentGoals.map(goal=>goal.id),ids.slice(-5).reverse());
            assert.ok(data.recentGoals.every(goal=>!Object.hasOwn(goal,'description')&&!Object.hasOwn(goal,'userId')));
            assert.equal(JSON.stringify(data).includes('B private'),false);assert.equal(Object.hasOwn(data,'passwordHash'),false);
        });
        await t.test('owner query parameters cannot expose another account and B receives only B totals',async()=>{
            const {data:a}=await(await request(0,`?userId=${users[1].id}`)).json();assert.equal(a.goals.total,7);assert.equal(a.profile.targetRole,'A role');
            const {data:b}=await(await request(1)).json();assert.deepEqual(b.goals,{total:1,active:1,completed:0,other:0,overdue:1});assert.equal(b.profile.targetRole,'B private role');assert.equal(b.recentGoals[0].title,'B private goal');
        });
        await t.test('no-profile/no-goal accounts return honest empty values without creating anything',async()=>{
            const {data}=await(await request(2)).json();assert.equal(data.profile,null);assert.deepEqual(data.recentGoals,[]);
            assert.deepEqual(data.goals,{total:0,active:0,completed:0,other:0,overdue:0});assert.equal(data.completeness.missingFields.length,5);
            assert.deepEqual(await snapshots(),before);
        });
        await t.test('revoked sessions cannot load dashboard summaries',async()=>{
            await db.query('UPDATE "AuthSession" SET "revokedAt"=$2 WHERE id=$1',[sessions[0],new Date().toISOString()]);
            assert.equal((await request(0)).status,401);
        });
    } finally { if(server)await new Promise(resolve=>server.close(resolve));if(prisma)await prisma.$disconnect();await db.end(); }
});
