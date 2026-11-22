import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

// Deliberately use a non-production URL. All Prisma writes are replaced below.
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/careeros_test";
const { default: app } = await import("../src/app.ts");
const { default: prisma } = await import("../src/config/prisma.ts");

test("goal creation validates requests before database access", async (t) => {
    const writes = [];
    const originalCreate = prisma.goal.create;
    prisma.goal.create = async ({ data }) => {
        writes.push(data);
        return {
            id: 1,
            description: null,
            targetDate: null,
            status: "ACTIVE",
            createdAt: new Date("2026-11-22T00:00:00.000Z"),
            ...data,
        };
    };
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (body) => fetch(`${base}/api/goals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

    try {
        const invalidCases = [
            ["missing title", { category: "Development" }, "title"],
            ["whitespace title", { title: "   ", category: "Development" }, "title"],
            ["non-text title", { title: 42, category: "Development" }, "title"],
            ["missing category", { title: "Learn SQL" }, "category"],
            ["whitespace category", { title: "Learn SQL", category: "  " }, "category"],
            ["long title", { title: "a".repeat(201), category: "Development" }, "title"],
            ["long category", { title: "Learn SQL", category: "a".repeat(101) }, "category"],
            ["long description", { title: "Learn SQL", category: "Development", description: "a".repeat(5001) }, "description"],
            ["non-text description", { title: "Learn SQL", category: "Development", description: 42 }, "description"],
            ["impossible date", { title: "Learn SQL", category: "Development", targetDate: "2026-02-30" }, "targetDate"],
            ["ambiguous local timestamp", { title: "Learn SQL", category: "Development", targetDate: "2026-12-15T10:00:00" }, "targetDate"],
            ["non-text date", { title: "Learn SQL", category: "Development", targetDate: 42 }, "targetDate"],
            ["array body", [], "body"],
        ];

        for (const [name, input, field] of invalidCases) {
            await t.test(`rejects ${name} without a database write`, async () => {
                const before = writes.length;
                const response = await post(input);
                assert.equal(response.status, 400);
                const body = await response.json();
                assert.equal(body.message, "Invalid goal data");
                assert.ok(body.errors.some((error) => error.field === field));
                assert.equal(writes.length, before);
            });
        }

        for (const payload of ["null", '{"title":']) {
            await t.test(`returns safe JSON for parser-rejected body ${payload}`, async () => {
                const before = writes.length;
                const response = await fetch(`${base}/api/goals`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: payload,
                });
                assert.equal(response.status, 400);
                assert.deepEqual(await response.json(), { message: "Invalid JSON body" });
                assert.equal(writes.length, before);
            });
        }

        await t.test("rejects oversized JSON with 413 before database access", async () => {
            const before = writes.length;
            const response = await post({ title: "a".repeat(110000), category: "Development" });
            assert.equal(response.status, 413);
            assert.deepEqual(await response.json(), { message: "Request body is too large" });
            assert.equal(writes.length, before);
        });

        await t.test("preserves parser client-error status for unsupported charset", async () => {
            const before = writes.length;
            const response = await fetch(`${base}/api/goals`, {
                method: "POST",
                headers: { "content-type": "application/json; charset=unsupported" },
                body: "{}",
            });
            assert.equal(response.status, 415);
            assert.deepEqual(await response.json(), { message: "Invalid request" });
            assert.equal(writes.length, before);
        });

        await t.test("accepts trimmed required fields and omits missing optional fields", async () => {
            const response = await post({ title: " Learn SQL ", category: " Development " });
            assert.equal(response.status, 201);
            const body = await response.json();
            assert.equal(body.message, "Goal created successfully");
            assert.equal(body.data.title, "Learn SQL");
            assert.deepEqual(writes.at(-1), { title: "Learn SQL", category: "Development" });
        });

        for (const [input, expected] of [
            ["2026-12-15", "2026-12-15T00:00:00.000Z"],
            ["2026-12-15T10:00:00Z", "2026-12-15T10:00:00.000Z"],
            ["2026-12-15T10:00:00+05:30", "2026-12-15T04:30:00.000Z"],
        ]) {
            await t.test(`accepts deadline ${input}`, async () => {
                const response = await post({ title: "Learn SQL", category: "Development", description: "", targetDate: input });
                assert.equal(response.status, 201);
                assert.equal((await response.json()).data.targetDate, expected);
                assert.equal(writes.at(-1).description, "");
            });
        }

        await t.test("ignores extra fields instead of allowing caller-controlled database fields", async () => {
            const response = await post({ title: "Learn SQL", category: "Development", id: 999, status: "COMPLETED" });
            assert.equal(response.status, 201);
            assert.equal((await response.json()).data.status, "ACTIVE");
            assert.equal(Object.hasOwn(writes.at(-1), "id"), false);
            assert.equal(Object.hasOwn(writes.at(-1), "status"), false);
        });

        await t.test("async persistence failure reaches shared handler without exposing raw details", async (t) => {
            const create = prisma.goal.create;
            const logs = [];
            const errorLog = t.mock.method(console, "error", (...args) => logs.push(args));
            prisma.goal.create = async () => {
                throw new Error("SYNTHETIC_PRIVATE_DATABASE_DETAILS");
            };
            try {
                const response = await post({ title: "Learn SQL", category: "Development" });
                assert.equal(response.status, 500);
                assert.deepEqual(await response.json(), { message: "Internal server error" });
                assert.deepEqual(logs, [["Unhandled request error"]]);
            } finally {
                prisma.goal.create = create;
                errorLog.mock.restore();
            }
        });
    } finally {
        prisma.goal.create = originalCreate;
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});
