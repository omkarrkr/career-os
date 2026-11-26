import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import pg from "pg";
import bcrypt from "bcrypt";

const testUrl = process.env.TEST_DATABASE_URL;

test("registration with real Prisma and an isolated PostgreSQL database", { skip: !testUrl && "Set TEST_DATABASE_URL to a fresh local CareerOS test database" }, async (t) => {
    const url = new URL(testUrl);
    assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Integration target must be local");
    assert.equal(url.search, "", "Test URL query overrides are not allowed");
    assert.match(url.pathname, /^\/careeros_test_registration_[a-z0-9_]+$/);
    process.env.DATABASE_URL = testUrl;
    process.env.NODE_ENV = "test";
    process.env.PORT = "3000";
    process.env.CORS_ORIGINS = "";
    const database = new pg.Client({ connectionString: testUrl, connectionTimeoutMillis: 5000, query_timeout: 10000 });
    await database.connect();
    let server;
    let prisma;
    try {
        const tables = (await database.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows;
        assert.equal(tables.length, 0, "Refusing to mutate a nonempty test database");
        const migrations = (await readdir(new URL("../../prisma/migrations/", import.meta.url), { withFileTypes: true }))
            .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
        for (const name of migrations) await database.query(await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8"));
        const legacyOwner = (await database.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Legacy fixture owner','legacy@example.test','not-a-login-hash',NOW()) RETURNING id`)).rows[0].id;
        await database.query(`INSERT INTO "Goal" (title,category,"userId") VALUES ('Synthetic linked legacy goal','Development',$1)`, [legacyOwner]);
        const { default: app } = await import("../../src/app.ts");
        ({ default: prisma } = await import("../../src/config/prisma.ts"));
        server = app.listen(0, "127.0.0.1");
        await once(server, "listening");
        const post = (body) => fetch(`http://127.0.0.1:${server.address().port}/api/users/register`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        });
        const password = "Fictional integration passphrase!";
        await t.test("persists a salted hash and returns public fields without signing in", async () => {
            const response = await post({ name: " Test Student ", email: " Student@Example.Test ", password });
            assert.equal(response.status, 201);
            assert.equal(response.headers.get("set-cookie"), null);
            const user = (await response.json()).data;
            assert.deepEqual(Object.keys(user).sort(), ["createdAt", "email", "id", "name"]);
            assert.equal(user.email, "student@example.test");
            const stored = (await database.query('SELECT "passwordHash" FROM "User" WHERE id=$1', [user.id])).rows[0];
            assert.notEqual(stored.passwordHash, password);
            assert.equal(bcrypt.getRounds(stored.passwordHash), 12);
            assert.equal(await bcrypt.compare(password, stored.passwordHash), true);
        });
        await t.test("normalized duplicate email maps the real Prisma error to 409", async () => {
            const response = await post({ name: "Duplicate", email: "STUDENT@example.test", password });
            assert.equal(response.status, 409);
            assert.deepEqual(await response.json(), { message: "An account with this email already exists" });
        });
        await t.test("simultaneous duplicate signups create exactly one account", async () => {
            const responses = await Promise.all([
                post({ name: "Race A", email: "race@example.test", password }),
                post({ name: "Race B", email: " RACE@EXAMPLE.TEST ", password }),
            ]);
            assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
            for (const response of responses) await response.arrayBuffer();
            assert.equal((await database.query(`SELECT COUNT(*)::integer AS count FROM "User" WHERE email='race@example.test'`)).rows[0].count, 1);
        });
        await t.test("registration neither claims legacy goals nor creates sessions", async () => {
            assert.equal((await database.query('SELECT "userId" FROM "Goal"')).rows[0].userId, legacyOwner);
            for (const table of ["AuthSession", "RefreshToken"]) assert.equal((await database.query(`SELECT COUNT(*)::integer AS count FROM "${table}"`)).rows[0].count, 0);
        });
    } finally {
        if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (prisma) await prisma.$disconnect();
        await database.end();
    }
});
