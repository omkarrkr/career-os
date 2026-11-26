import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";
import bcrypt from "bcrypt";

const testUrl = process.env.TEST_DATABASE_URL;
test("password changes and session revocation on isolated native PostgreSQL", { skip: !testUrl && "Set TEST_DATABASE_URL to a fresh local password test database" }, async (t) => {
    const url = new URL(testUrl);
    assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); assert.equal(url.search, "");
    assert.match(url.pathname, /^\/careeros_test_password_[a-z0-9_]+$/);
    Object.assign(process.env, { DATABASE_URL: testUrl, NODE_ENV: "test", CORS_ORIGINS: "http://localhost:5173", PORT: "3000" });
    const db = new pg.Client({ connectionString: testUrl, connectionTimeoutMillis: 5000, query_timeout: 15000 }); await db.connect();
    let prisma;
    const originalPassword = "Fictional original passphrase!", newPassword = "Fictional replacement passphrase!";
    const origin = "http://localhost:5173";
    try {
        assert.equal((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rowCount, 0, "Refusing nonempty database");
        for (const entry of (await readdir(new URL("../../prisma/migrations/", import.meta.url), { withFileTypes: true })).filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
            await db.query(await readFile(new URL(`../../prisma/migrations/${entry.name}/migration.sql`, import.meta.url), "utf8"));
        }
        const { createApp } = await import("../../src/app.ts");
        ({ default: prisma } = await import("../../src/config/prisma.ts"));
        const fixtureHash = await bcrypt.hash(originalPassword, 12);
        const scenario = async (run) => {
            const email = `${randomUUID()}@example.test`;
            const user = (await db.query('INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,NOW()) RETURNING id', ["Fictional password user", email, fixtureHash])).rows[0];
            await db.query(`INSERT INTO "Goal" (title,category,"userId") VALUES ('Fictional owned goal','Development',$1)`, [user.id]);
            const beforeGoals = (await db.query('SELECT * FROM "Goal" ORDER BY id')).rows;
            const server = createApp().listen(0, "127.0.0.1"); await once(server, "listening");
            const base = `http://127.0.0.1:${server.address().port}`;
            const remember = (client, response) => {
                for (const line of response.headers.getSetCookie()) {
                    const pair = line.split(";")[0], index = pair.indexOf("="), name = pair.slice(0, index), value = pair.slice(index + 1);
                    if (value) client.cookies.set(name, value); else client.cookies.delete(name);
                }
            };
            const post = (client, endpoint, body = {}, headers = {}) => fetch(base + "/api/auth/" + endpoint, {
                method: "POST", headers: { Origin: origin, "Content-Type": "application/json",
                    Cookie: [...client.cookies].map(([key, value]) => `${key}=${value}`).join("; "),
                    "X-CSRF-Token": client.csrf, ...(client.accessToken ? { Authorization: `Bearer ${client.accessToken}` } : {}), ...headers },
                body: JSON.stringify(body),
            });
            const bootstrap = async () => {
                const client = { cookies: new Map(), csrf: "", accessToken: "" };
                const response = await fetch(base + "/api/auth/csrf", { headers: { Origin: origin } });
                remember(client, response); client.csrf = (await response.json()).csrfToken; return client;
            };
            const attemptLogin = async (password = originalPassword, loginEmail = email) => {
                const client = await bootstrap(), response = await post(client, "login", { email: loginEmail, password });
                if (response.status === 200) {
                    remember(client, response); const body = (await response.json()).data;
                    client.csrf = body.csrfToken; client.accessToken = body.accessToken;
                } else await response.arrayBuffer();
                return { client, status: response.status };
            };
            const login = async () => { const result = await attemptLogin(); assert.equal(result.status, 200); return result.client; };
            const profile = client => fetch(base + "/api/users/profile", { headers: { Authorization: `Bearer ${client.accessToken}` } });
            const change = (client, body = { currentPassword: originalPassword, newPassword }) => post(client, "change-password", body);
            try { await run({ user, email, login, bootstrap, post, profile, change, attemptLogin }); }
            finally { await new Promise(resolve => server.close(resolve)); }
            assert.deepEqual((await db.query('SELECT * FROM "Goal" ORDER BY id')).rows, beforeGoals);
        };
        await t.test("requires authentication, CSRF and the same browser-session binding", async () => scenario(async ({ bootstrap, login, post, change }) => {
            const anonymous = await bootstrap(); assert.equal((await change(anonymous)).status, 401);
            const first = await login(), second = await login();
            assert.equal((await post(first, "change-password", { currentPassword: originalPassword, newPassword }, { "X-CSRF-Token": "forged" })).status, 403);
            second.accessToken = first.accessToken;
            assert.equal((await change(second)).status, 403);
        }));
        await t.test("wrong current password and invalid new password leave hash and sessions unchanged", async () => scenario(async ({ user, login, profile, change }) => {
            const client = await login();
            for (const body of [
                { currentPassword: "Wrong fictional passphrase!", newPassword },
                { currentPassword: originalPassword, newPassword: originalPassword },
                { currentPassword: originalPassword, newPassword: "short" },
            ]) {
                const response = await change(client, body); assert.equal(response.status, 400);
                assert.equal(response.headers.get("set-cookie"), null); await response.arrayBuffer();
            }
            assert.equal((await db.query('SELECT "passwordHash" FROM "User" WHERE id=$1', [user.id])).rows[0].passwordHash, fixtureHash);
            assert.equal((await profile(client)).status, 200);
        }));
        await t.test("successful change hashes the new password and revokes every session only for that user", async () => scenario(async ({ user, login, profile, post, change, attemptLogin }) => {
            const first = await login(), second = await login();
            const otherEmail = `${randomUUID()}@example.test`;
            const other = (await db.query('INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,NOW()) RETURNING id', ["Other account", otherEmail, fixtureHash])).rows[0];
            const otherClient = (await attemptLogin(originalPassword, otherEmail)).client;
            const response = await change(first, { currentPassword: originalPassword, newPassword, userId: other.id });
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), { message: "Password changed successfully; sign in again" });
            assert.equal(response.headers.getSetCookie().length, 3);
            assert.equal(response.headers.get("cache-control"), "no-store");
            const stored = (await db.query('SELECT "passwordHash" FROM "User" WHERE id=$1', [user.id])).rows[0].passwordHash;
            assert.notEqual(stored, fixtureHash); assert.equal(bcrypt.getRounds(stored), 12); assert.equal(await bcrypt.compare(newPassword, stored), true);
            for (const client of [first, second]) { assert.equal((await profile(client)).status, 401); assert.equal((await post(client, "refresh")).status, 401); }
            assert.equal((await change(second)).status, 401);
            assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "AuthSession" WHERE "userId"=$1 AND "revokedAt" IS NULL', [user.id])).rows[0].n, 0);
            assert.equal((await profile(otherClient)).status, 200);
            assert.equal((await attemptLogin()).status, 401); assert.equal((await attemptLogin(newPassword)).status, 200);
        }));
        await t.test("a revocation failure rolls back the password hash change", async () => scenario(async ({ user, login, profile, change }) => {
            const client = await login();
            await db.query(`CREATE FUNCTION reject_fixture_revocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId"=${user.id} AND NEW."revokedAt" IS NOT NULL THEN RAISE EXCEPTION 'Synthetic revocation failure'; END IF; RETURN NEW; END $$;
                CREATE TRIGGER reject_fixture_revocation BEFORE UPDATE ON "AuthSession" FOR EACH ROW EXECUTE FUNCTION reject_fixture_revocation()`);
            const logs = t.mock.method(console, "error", () => {});
            try { const response = await change(client); assert.equal(response.status, 500); assert.deepEqual(await response.json(), { message: "Internal server error" }); }
            finally { logs.mock.restore(); await db.query('DROP TRIGGER reject_fixture_revocation ON "AuthSession"; DROP FUNCTION reject_fixture_revocation()'); }
            assert.equal((await db.query('SELECT "passwordHash" FROM "User" WHERE id=$1', [user.id])).rows[0].passwordHash, fixtureHash);
            assert.equal((await profile(client)).status, 200);
        }));
        await t.test("two simultaneous password changes produce one winner and no active old sessions", async () => scenario(async ({ user, login, change }) => {
            const client = await login();
            const responses = await Promise.all([change(client), change(client, { currentPassword: originalPassword, newPassword: "Another fictional passphrase!" })]);
            assert.equal(responses.filter(response => response.status === 200).length, 1);
            assert.ok(responses.filter(response => response.status !== 200).every(response => [400, 401].includes(response.status)));
            for (const response of responses) await response.arrayBuffer();
            assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "AuthSession" WHERE "userId"=$1 AND "revokedAt" IS NULL', [user.id])).rows[0].n, 0);
        }));
        await t.test("a concurrent refresh cannot escape password-change revocation", async () => scenario(async ({ user, login, post, profile, change }) => {
            const client = await login();
            const [changed, refreshed] = await Promise.all([change(client), post(client, "refresh")]);
            assert.equal(changed.status, 200); assert.ok([200, 401].includes(refreshed.status));
            if (refreshed.status === 200) {
                const data = (await refreshed.json()).data;
                assert.equal((await profile({ accessToken: data.accessToken })).status, 401);
            } else await refreshed.arrayBuffer();
            assert.equal((await profile(client)).status, 401);
            assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "AuthSession" WHERE "userId"=$1 AND "revokedAt" IS NULL', [user.id])).rows[0].n, 0);
        }));
        await t.test("an old-password login queued behind a password change cannot create a late session", async () => scenario(async ({ user, login, change, attemptLogin }) => {
            const client = await login();
            const blocker = new pg.Client({ connectionString: testUrl }); await blocker.connect();
            let changing, loggingIn;
            const waitForWaiters = async count => {
                const deadline = Date.now() + 8000;
                while (Date.now() < deadline) {
                    const n = (await db.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT "id" FROM "User"%'`)).rows[0].n;
                    if (n >= count) return;
                    await delay(20);
                }
                throw Error("Expected account-lock waiter did not arrive");
            };
            try {
                await blocker.query('BEGIN'); await blocker.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [user.id]);
                changing = change(client); await waitForWaiters(1);
                loggingIn = attemptLogin(); await waitForWaiters(2);
                await blocker.query('COMMIT');
                assert.equal((await changing).status, 200); assert.equal((await loggingIn).status, 401);
                assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "AuthSession" WHERE "userId"=$1 AND "revokedAt" IS NULL', [user.id])).rows[0].n, 0);
            } finally { await blocker.query('ROLLBACK'); await blocker.end(); await Promise.allSettled([changing, loggingIn].filter(Boolean)); }
        }));
    } finally { if (prisma) await prisma.$disconnect(); await db.end(); }
});
