import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import pg from "pg";
import bcrypt from "bcrypt";
import { createHash } from "node:crypto";

const testUrl = process.env.TEST_DATABASE_URL;
test("login and session lifecycle with isolated native PostgreSQL", { skip: !testUrl && "Set TEST_DATABASE_URL to a fresh local auth test database" }, async (t) => {
    const url = new URL(testUrl);
    assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
    assert.equal(url.search, "");
    assert.match(url.pathname, /^\/careeros_test_auth_[a-z0-9_]+$/);
    Object.assign(process.env, { DATABASE_URL: testUrl, NODE_ENV: "test", CORS_ORIGINS: "http://localhost:5173", PORT: "3000" });
    const db = new pg.Client({ connectionString: testUrl, connectionTimeoutMillis: 5000, query_timeout: 10000 });
    await db.connect();
    let server, prisma;
    const origin = "http://localhost:5173";
    const password = "Fictional login test passphrase!";
    try {
        assert.equal((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rowCount, 0,
            "Refusing to mutate a nonempty test database");
        const migrations = (await readdir(new URL("../../prisma/migrations/", import.meta.url), { withFileTypes: true }))
            .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
        for (const name of migrations) await db.query(await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8"));
        const hash = await bcrypt.hash(password, 12);
        await db.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Student','student@example.test',$1,NOW()), ('Other','other@example.test',$1,NOW())`, [hash]);
        const legacyOwner = (await db.query(`SELECT id FROM "User" WHERE email='student@example.test'`)).rows[0].id;
        await db.query(`INSERT INTO "Goal" (title,category,"userId") VALUES ('Synthetic linked legacy goal','Development',$1)`, [legacyOwner]);
        const { default: app } = await import("../../src/app.ts");
        ({ default: prisma } = await import("../../src/config/prisma.ts"));
        server = app.listen(0, "127.0.0.1");
        await once(server, "listening");
        const base = `http://127.0.0.1:${server.address().port}`;
        const request = (path, options = {}) => fetch(base + path, options);
        const jar = () => ({ cookies: new Map(), csrf: "" });
        const remember = (client, response) => {
            for (const line of response.headers.getSetCookie()) {
                const [pair] = line.split(";");
                const index = pair.indexOf("=");
                const name = pair.slice(0, index), value = pair.slice(index + 1);
                if (!value) client.cookies.delete(name); else client.cookies.set(name, value);
            }
        };
        const cookieHeader = (client) => [...client.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
        const bootstrap = async () => {
            const client = jar();
            const response = await request("/api/auth/csrf", { headers: { Origin: origin } });
            assert.equal(response.status, 200);
            assert.equal(response.headers.get("access-control-allow-credentials"), "true");
            remember(client, response);
            client.csrf = (await response.json()).csrfToken;
            return client;
        };
        const post = (client, path, body = {}) => request(`/api/auth/${path}`, { method: "POST",
            headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookieHeader(client), "X-CSRF-Token": client.csrf }, body: JSON.stringify(body) });
        const login = async (email = "student@example.test") => {
            const client = await bootstrap();
            const response = await post(client, "login", { email, password });
            assert.equal(response.status, 200);
            remember(client, response);
            const body = (await response.json()).data;
            // The anonymous CSRF token must stop working after binding changes to a session.
            assert.equal((await post(client, "refresh")).status, 403);
            client.csrf = body.csrfToken;
            return { client, body };
        };
        const profile = (accessToken) => request("/api/users/profile", { headers: { Authorization: `Bearer ${accessToken}` } });
        let active;
        await t.test("CSRF and origin failures stop before creating sessions", async () => {
            const client = await bootstrap();
            for (const headers of [
                { Origin: origin },
                { Origin: origin, Cookie: cookieHeader(client), "X-CSRF-Token": "tampered" },
                { Cookie: cookieHeader(client), "X-CSRF-Token": client.csrf },
                { Origin: "https://evil.example", Cookie: cookieHeader(client), "X-CSRF-Token": client.csrf },
            ]) {
                const response = await request("/api/auth/login", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ email: "student@example.test", password }) });
                assert.equal(response.status, 403);
                await response.arrayBuffer();
            }
            assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "AuthSession"')).rows[0].n, 0);
        });
        await t.test("wrong passwords and unknown accounts return the same safe error", async () => {
            const client = await bootstrap();
            for (const email of ["student@example.test", "missing@example.test"]) {
                const response = await post(client, "login", { email, password: "Wrong fictional passphrase!" });
                assert.equal(response.status, 401);
                assert.deepEqual(await response.json(), { message: "Invalid email or password" });
                assert.equal(response.headers.get("set-cookie"), null);
            }
        });
        await t.test("login normalizes email, stores only refresh hash and returns public profile", async () => {
            active = await login(" STUDENT@EXAMPLE.TEST ");
            assert.deepEqual(Object.keys(active.body.user).sort(), ["createdAt", "email", "id", "name"]);
            assert.equal(active.body.expiresIn, 900);
            const stored = (await db.query('SELECT "tokenHash" FROM "RefreshToken"')).rows[0];
            const raw = active.client.cookies.get("careeros_refresh");
            assert.equal(stored.tokenHash, createHash("sha256").update(raw).digest("hex"));
            assert.notEqual(stored.tokenHash, raw);
            const response = await profile(active.body.accessToken);
            assert.equal(response.status, 200);
            assert.equal(response.headers.get("cache-control"), "no-store");
            assert.deepEqual((await response.json()).data, active.body.user);
            assert.equal((await request("/api/users/profile")).status, 401);
            assert.equal((await profile(active.body.accessToken + "x")).status, 401);
        });
        await t.test("rotation replaces the cookie without extending expiry; replay revokes the whole session", async () => {
            const original = { cookies: new Map(active.client.cookies), csrf: active.client.csrf };
            const before = (await db.query('SELECT "expiresAt" FROM "AuthSession"')).rows[0].expiresAt;
            const response = await post(active.client, "refresh");
            assert.equal(response.status, 200);
            remember(active.client, response);
            const refreshed = (await response.json()).data;
            assert.notEqual(active.client.cookies.get("careeros_refresh"), original.cookies.get("careeros_refresh"));
            assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "RefreshToken" WHERE "usedAt" IS NOT NULL')).rows[0].n, 1);
            assert.deepEqual((await db.query('SELECT "expiresAt" FROM "AuthSession"')).rows[0].expiresAt, before);
            const replay = await post(original, "refresh");
            assert.equal(replay.status, 401);
            assert.equal(replay.headers.getSetCookie().length, 3);
            assert.ok((await db.query('SELECT "revokedAt" FROM "AuthSession"')).rows[0].revokedAt);
            assert.equal((await profile(refreshed.accessToken)).status, 401);
        });
        await t.test("logout clears cookies and immediately denies access and refresh", async () => {
            const { client, body } = await login("other@example.test");
            const ownProfile = await profile(body.accessToken);
            assert.equal((await ownProfile.json()).data.email, "other@example.test");
            const response = await post(client, "logout");
            assert.equal(response.status, 204);
            assert.equal(response.headers.getSetCookie().length, 3);
            assert.equal((await profile(body.accessToken)).status, 401);
            assert.equal((await post(client, "refresh")).status, 401);
        });
        await t.test("concurrent refresh reuse commits revocation even when one request succeeds", async () => {
            const { client, body } = await login();
            const responses = await Promise.all([post(client, "refresh"), post(client, "refresh")]);
            assert.deepEqual(responses.map((response) => response.status).sort(), [200, 401]);
            for (const response of responses) await response.arrayBuffer();
            assert.equal((await profile(body.accessToken)).status, 401);
        });
        await t.test("database session expiry overrides a still-signed access token", async () => {
            const { client, body } = await login();
            await db.query('UPDATE "AuthSession" SET "expiresAt"=$2 WHERE id=$1',
                [client.cookies.get("careeros_binding"), new Date(Date.now() + 60000).toISOString()]);
            const nearExpiry = await post(client, "refresh");
            assert.equal(nearExpiry.status, 200);
            remember(client, nearExpiry);
            const nearExpiryBody = (await nearExpiry.json()).data;
            assert.ok(nearExpiryBody.expiresIn > 0 && nearExpiryBody.expiresIn <= 60);
            const expired = await db.query('UPDATE "AuthSession" SET "expiresAt"=$2 WHERE id=$1 RETURNING "expiresAt"',
                [client.cookies.get("careeros_binding"), new Date(Date.now() - 60000).toISOString()]);
            assert.equal(expired.rowCount, 1);
            assert.ok(expired.rows[0].expiresAt < new Date());
            assert.equal((await profile(body.accessToken)).status, 401);
            assert.equal((await post(client, "refresh")).status, 401);
            assert.equal((await db.query('SELECT "userId" FROM "Goal"')).rows[0].userId, legacyOwner);
        });
    } finally {
        if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (prisma) await prisma.$disconnect();
        await db.end();
    }
});
