import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import pg from "pg";

const testUrl = process.env.TEST_DATABASE_URL;
test("career profile persistence and account isolation on native PostgreSQL", { skip: !testUrl && "Set TEST_DATABASE_URL to a fresh local career-profile test database" }, async (t) => {
    const url = new URL(testUrl);
    assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.search, "");
    assert.match(url.pathname, /^\/careeros_test_profile_[a-z0-9_]+$/);
    Object.assign(process.env, { DATABASE_URL: testUrl, NODE_ENV: "test", CORS_ORIGINS: "http://localhost:5173", PORT: "3000" });
    const db = new pg.Client({ connectionString: testUrl, connectionTimeoutMillis: 5000, query_timeout: 15000 }); await db.connect();
    let server, prisma;
    try {
        assert.equal((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rowCount, 0, "Refusing nonempty test database");
        const directory = new URL("../../prisma/migrations/", import.meta.url);
        for (const entry of (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
            await db.query(await readFile(new URL(`${entry}/migration.sql`, directory), "utf8"));
        }
        const users = (await db.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('A','a@example.test','fixture-only',NOW()),('B','b@example.test','fixture-only',NOW()) RETURNING id`)).rows;
        const { tokenTools } = await import("../../src/utils/auth-tokens.ts");
        const tokens = [], sessions = [];
        for (const user of users) {
            const session = randomUUID(), expiry = new Date(Date.now() + 600000);
            await db.query('INSERT INTO "AuthSession" (id,"userId","expiresAt") VALUES ($1,$2,$3)', [session, user.id, expiry.toISOString()]);
            tokens.push(await tokenTools(process.env).issue(user.id, session, expiry)); sessions.push(session);
        }
        const { default: app, createApp } = await import("../../src/app.ts");
        ({ default: prisma } = await import("../../src/config/prisma.ts"));
        server = app.listen(0, "127.0.0.1"); await once(server, "listening");
        let base = `http://127.0.0.1:${server.address().port}`;
        const request = (index, body, suffix = "") => fetch(base + "/api/users/career-profile" + suffix, {
            method: body === undefined ? "GET" : "PATCH",
            headers: { ...(index === undefined ? {} : { Authorization: `Bearer ${tokens[index]}` }), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        await t.test("anonymous access is denied and reading an absent profile does not write", async () => {
            const preflight = await fetch(base + "/api/users/career-profile", { method: "OPTIONS", headers: {
                Origin: "http://localhost:5173", "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "authorization,content-type",
            } });
            assert.equal(preflight.status, 204); assert.match(preflight.headers.get("access-control-allow-methods"), /PATCH/);
            assert.equal(preflight.headers.get("access-control-allow-credentials"), null);
            assert.equal((await request(undefined)).status, 401);
            assert.equal((await request(undefined, { bio: "Denied" })).status, 401);
            const response = await request(0); assert.equal(response.status, 200);
            const body = await response.json(); assert.equal(body.data, null); assert.equal(body.completeness.missingFields.length, 5);
            assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "CareerProfile"')).rows[0].n, 0);
        });
        await t.test("partial saves persist, trim data and complete only explicit checklist fields", async () => {
            const response = await request(0, { institution: " College ", degree: " BTech CSE ", interests: [" Backend ", "backend", "AI"] });
            assert.equal(response.status, 200);
            const saved = await response.json(); assert.equal(saved.data.userId, users[0].id);
            assert.equal(saved.data.institution, "College"); assert.deepEqual(saved.data.interests, ["Backend", "AI"]);
            assert.equal(saved.completeness.isComplete, false);
            assert.equal(Object.hasOwn(saved.data, "passwordHash"), false);
            const completed = await request(0, { graduationYear: 2028, targetRole: "Backend developer", weeklyLearningHours: 8 });
            assert.equal((await completed.json()).completeness.isComplete, true);
            assert.equal((await (await request(0)).json()).data.degree, "BTech CSE");
        });
        await t.test("owner spoofing is rejected, query filters cannot redirect writes and accounts stay isolated", async () => {
            for (const field of ["userId", "email", "passwordHash"]) {
                const response = await request(0, { bio: "Should fail", [field]: users[1].id });
                assert.equal(response.status, 400); assert.equal((await response.json()).message, "Invalid career profile data");
            }
            assert.equal((await (await request(1)).json()).data, null);
            const response = await request(1, { bio: "B only" }, `?userId=${users[0].id}`); assert.equal(response.status, 200);
            assert.equal((await response.json()).data.userId, users[1].id);
            assert.equal((await (await request(0)).json()).data.bio, null);
            assert.equal((await fetch(base + `/api/users/career-profile/${users[1].id}`, { headers: { Authorization: `Bearer ${tokens[0]}` } })).status, 404);
        });
        await t.test("omitted fields are preserved while explicit null and empty interests clear them", async () => {
            const response = await request(0, { degree: null, interests: [] }); assert.equal(response.status, 200);
            const body = await response.json(); assert.equal(body.data.degree, null); assert.equal(body.data.institution, "College");
            assert.deepEqual(body.data.interests, []); assert.equal(body.completeness.isComplete, false);
            for (const input of [{}, { graduationYear: "2028" }, { weeklyLearningHours: 41 }, { institution: " " }]) {
                assert.equal((await request(0, input)).status, 400);
            }
        });
        await t.test("concurrent first saves create one profile and preserve independent updates", async () => {
            await db.query('DELETE FROM "CareerProfile" WHERE "userId"=$1', [users[1].id]);
            const responses = await Promise.all([request(1, { institution: "B College" }), request(1, { degree: "B degree" })]);
            assert.deepEqual(responses.map(response => response.status), [200, 200]);
            const body = await (await request(1)).json(); assert.equal(body.data.institution, "B College"); assert.equal(body.data.degree, "B degree");
            assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "CareerProfile" WHERE "userId"=$1', [users[1].id])).rows[0].n, 1);
        });
        await t.test("saved data survives an application restart and revoked sessions cannot read or edit", async () => {
            await new Promise(resolve => server.close(resolve));
            server = createApp().listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}`;
            const response = await request(1); assert.equal(response.status, 200);
            assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal((await response.json()).data.degree, "B degree");
            await db.query('UPDATE "AuthSession" SET "revokedAt"=$2 WHERE id=$1', [sessions[1], new Date().toISOString()]);
            assert.equal((await request(1)).status, 401); assert.equal((await request(1, { bio: "Denied" })).status, 401);
        });
        await t.test("ordinary direct database roles cannot read or write private profiles", async () => {
            const role = `profile_test_${randomUUID().replaceAll("-", "")}`;
            await db.query(`CREATE ROLE "${role}" NOLOGIN; GRANT USAGE ON SCHEMA public TO "${role}"; GRANT SELECT,INSERT,UPDATE,DELETE ON "CareerProfile" TO "${role}"; SET ROLE "${role}"`);
            try {
                assert.equal((await db.query('SELECT * FROM "CareerProfile"')).rowCount, 0);
                assert.equal((await db.query('UPDATE "CareerProfile" SET bio=\'Denied\' RETURNING "userId"')).rowCount, 0);
                assert.equal((await db.query('DELETE FROM "CareerProfile" RETURNING "userId"')).rowCount, 0);
                await assert.rejects(db.query('INSERT INTO "CareerProfile" ("userId","updatedAt") VALUES ($1,NOW())', [users[0].id]), { code: "42501" });
            } finally { await db.query("RESET ROLE"); }
        });
    } finally { if (server) await new Promise(resolve => server.close(resolve)); if (prisma) await prisma.$disconnect(); await db.end(); }
});
