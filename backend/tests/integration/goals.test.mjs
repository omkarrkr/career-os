import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

const testUrl = process.env.TEST_DATABASE_URL;
test("goal ownership and direct-role isolation with native PostgreSQL", { skip: !testUrl && "Set TEST_DATABASE_URL to a fresh local goals test database" }, async (t) => {
    const url = new URL(testUrl);
    assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
    assert.equal(url.search, "");
    assert.match(url.pathname, /^\/careeros_test_goals_[a-z0-9_]+$/);
    Object.assign(process.env, { DATABASE_URL: testUrl, NODE_ENV: "test", CORS_ORIGINS: "", PORT: "3000" });
    const db = new pg.Client({ connectionString: testUrl, connectionTimeoutMillis: 5000, query_timeout: 10000 });
    await db.connect();
    let server, prisma;
    try {
        assert.equal((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rowCount, 0,
            "Refusing to mutate a nonempty test database");
        const migrations = (await readdir(new URL("../../prisma/migrations/", import.meta.url), { withFileTypes: true }))
            .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
        for (const name of migrations) await db.query(await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8"));
        const legacy = (await db.query(`INSERT INTO "Goal" (title,category) VALUES ('Unassigned private fixture','Development') RETURNING *`)).rows[0];
        const users = (await db.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('A','a@example.test','unused-fixture',NOW()), ('B','b@example.test','unused-fixture',NOW()) RETURNING id`)).rows;
        const { tokenTools } = await import("../../src/utils/auth-tokens.ts");
        const tokens = [];
        const sessions = [];
        for (const user of users) {
            const id = randomUUID();
            const expiry = new Date(Date.now() + 600000);
            await db.query('INSERT INTO "AuthSession" (id,"userId","expiresAt") VALUES ($1,$2,$3)', [id, user.id, expiry.toISOString()]);
            tokens.push(await tokenTools(process.env).issue(user.id, id, expiry));
            sessions.push(id);
        }
        const { default: app } = await import("../../src/app.ts");
        ({ default: prisma } = await import("../../src/config/prisma.ts"));
        server = app.listen(0, "127.0.0.1"); await once(server, "listening");
        const base = `http://127.0.0.1:${server.address().port}/api/goals`;
        const request = (path = "", token, body) => fetch(base + path, {
            method: body === undefined ? "GET" : "POST",
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const create = async (token, title, fields = {}) => {
            const response = await request("", token, { title, category: "Development", ...fields });
            assert.equal(response.status, 201); return (await response.json()).data;
        };
        let a, b;
        await t.test("anonymous reads and writes are denied without changing legacy goals", async () => {
            for (const [path, body] of [["", undefined], [`/${legacy.id}`, undefined], ["", { title: "Denied", category: "Development" }]]) {
                const response = await request(path, undefined, body);
                assert.equal(response.status, 401); await response.arrayBuffer();
            }
            assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "Goal"')).rows[0].n, 1);
        });
        await t.test("creation takes owner from the session and ignores spoofed ownership", async () => {
            a = await create(tokens[0], "A one", { userId: users[1].id, id: 999, status: "COMPLETED" });
            b = await create(tokens[1], "B one", { userId: null });
            assert.equal(a.userId, users[0].id); assert.equal(b.userId, users[1].id);
            assert.equal(a.status, "ACTIVE"); assert.notEqual(a.id, 999);
        });
        await t.test("lists contain only the caller's goals, excluding NULL-owned rows and spoofed filters", async () => {
            for (const [index, goal] of [[0, a], [1, b]]) {
                const response = await request(`?userId=${users[1 - index].id}`, tokens[index]);
                assert.equal(response.status, 200);
                assert.deepEqual((await response.json()).data.map((entry) => entry.id), [goal.id]);
                assert.equal(response.headers.get("cache-control"), "no-store");
            }
        });
        await t.test("detail hides foreign, legacy and nonexistent goals behind the same 404", async () => {
            const own = await request(`/${a.id}`, tokens[0]); assert.equal(own.status, 200);
            assert.equal((await own.json()).data.id, a.id);
            for (const [token, id] of [[tokens[0], b.id], [tokens[1], a.id], [tokens[0], legacy.id], [tokens[1], legacy.id], [tokens[0], 2147483647]]) {
                const response = await request(`/${id}`, token); assert.equal(response.status, 404);
                assert.deepEqual(await response.json(), { message: "Goal not found" });
            }
        });
        await t.test("pagination stays owner-scoped, bounded and ordered with no skipped own rows", async () => {
            await create(tokens[0], "A two"); await create(tokens[1], "B two"); await create(tokens[0], "A three");
            const ids = [];
            let after = "";
            for (let page = 0; page < 4; page++) {
                const response = await request(`?limit=1${after}`, tokens[0]); assert.equal(response.status, 200);
                const body = await response.json(); assert.equal(body.data.length, 1);
                assert.equal(body.data[0].userId, users[0].id); ids.push(body.data[0].id);
                if (body.nextCursor === null) break;
                after = `&afterId=${body.nextCursor}`;
            }
            assert.equal(ids.length, 3); assert.equal(new Set(ids).size, 3);
            assert.deepEqual(ids, [...ids].sort((x, y) => x - y));
        });
        await t.test("malformed IDs and pagination are rejected", async () => {
            for (const path of ["/0", "/-1", "/1.5", "/2147483648", "/abc", "?limit=0", "?limit=51", "?limit=1&limit=2", "?afterId=-1"]) {
                const response = await request(path, tokens[0]); assert.equal(response.status, 400, path); await response.arrayBuffer();
            }
        });
        await t.test("revocation denies goal operations despite a valid signed token", async () => {
            await db.query('UPDATE "AuthSession" SET "revokedAt"=$2 WHERE id=$1', [sessions[1], new Date().toISOString()]);
            assert.equal((await request("", tokens[1])).status, 401);
            assert.equal((await request("", tokens[1], { title: "Denied", category: "Development" })).status, 401);
        });
        await t.test("RLS denies ordinary direct-role reads/writes even with explicit table grants", async () => {
            const role = `goal_test_${randomUUID().replaceAll("-", "")}`;
            await db.query(`CREATE ROLE "${role}" NOLOGIN; GRANT USAGE ON SCHEMA public TO "${role}"; GRANT SELECT,INSERT ON "Goal" TO "${role}"; GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
            await db.query(`SET ROLE "${role}"`);
            try {
                assert.equal((await db.query('SELECT * FROM "Goal"')).rowCount, 0);
                await assert.rejects(db.query(`INSERT INTO "Goal" (title,category) VALUES ('Bypass denied','Development')`), { code: "42501" });
            } finally { await db.query("RESET ROLE"); }
            assert.deepEqual((await db.query('SELECT * FROM "Goal" WHERE id=$1', [legacy.id])).rows[0], legacy);
        });
    } finally {
        if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (prisma) await prisma.$disconnect();
        await db.end();
    }
});
