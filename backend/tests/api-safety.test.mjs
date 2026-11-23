import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/careeros_test";
const { default: app } = await import("../src/app.ts");

test("invalid registration and unknown routes return safe JSON", async (t) => {
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        await t.test("registration neither logs nor echoes submitted credentials", async (t) => {
            const logs = [];
            const spies = ["log", "warn", "error"].map((method) =>
                t.mock.method(console, method, (...args) => logs.push(args))
            );
            try {
                const response = await fetch(`${base}/api/users/register`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ email: "student@example.test", password: "SYNTHETIC_SECRET_NEVER_LOG" }),
                });
                assert.equal(response.status, 400);
                const body = await response.json();
                assert.equal(body.message, "Invalid registration data");
                assert.ok(body.errors.some((error) => error.field === "name"));
                assert.doesNotMatch(JSON.stringify(body), /SYNTHETIC_SECRET_NEVER_LOG/);
                assert.deepEqual(logs, []);
            } finally {
                for (const spy of spies) spy.mock.restore();
            }
        });

        await t.test("unknown route returns JSON without reflecting URL/query data", async () => {
            const response = await fetch(`${base}/missing?token=SYNTHETIC_SECRET_NEVER_ECHO`);
            assert.equal(response.status, 404);
            assert.match(response.headers.get("content-type"), /application\/json/);
            assert.deepEqual(await response.json(), { message: "Route not found" });
        });

        await t.test("unsupported method on an existing path returns JSON 404", async () => {
            const response = await fetch(`${base}/api/goals`, { method: "DELETE" });
            assert.equal(response.status, 404);
            assert.deepEqual(await response.json(), { message: "Route not found" });
        });

        await t.test("root and demo profile contracts remain available", async () => {
            const root = await fetch(`${base}/`);
            assert.equal(root.status, 200);
            assert.equal((await root.json()).project, "CareerOS");
            const profile = await fetch(`${base}/api/users/profile`);
            assert.equal(profile.status, 200);
            assert.deepEqual(await profile.json(), {
                success: true,
                data: { id: 1, name: "Demo User", role: "Student" },
            });
        });
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});
