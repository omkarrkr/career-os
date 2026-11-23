import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import bcrypt from "bcrypt";
import { registerUserSchema } from "../src/schemas/user.schema.ts";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/careeros_test";
const { default: app } = await import("../src/app.ts");
const { default: prisma } = await import("../src/config/prisma.ts");
const { Prisma } = await import("../src/generated/prisma/client.ts");
const password = "  Fictional registration passphrase!  ";
const valid = { name: "Student", email: "student@example.test", password };

test("registration schema rejects invalid fields and preserves password semantics", () => {
    for (const [field, values] of Object.entries({
        name: [undefined, "", "   ", 1, "a".repeat(101), "Student\0name", "Student\ud800name"],
        email: [undefined, "", "bad-email", 1, "a".repeat(255) + "@example.test"],
        password: [undefined, 1, "short", " ".repeat(20), "a".repeat(73), "😀".repeat(19), "😀".repeat(8), "Fictional\0password!", "Fictional\ud800password!"],
    })) {
        for (const value of values) {
            const result = registerUserSchema.safeParse({ ...valid, [field]: value });
            assert.equal(result.success, false, `${field}: invalid input accepted`);
            assert.ok(result.error.issues.some((issue) => issue.path[0] === field));
        }
    }
    assert.equal(registerUserSchema.safeParse(null).success, false);
    assert.equal(registerUserSchema.safeParse([]).success, false);
    const normalized = registerUserSchema.parse({ ...valid, name: " Student ", email: " Student@Example.Test " });
    assert.equal(normalized.name, "Student");
    assert.equal(normalized.email, "student@example.test");
    assert.equal(normalized.password, password);
    assert.equal(registerUserSchema.safeParse({ ...valid, password: "a".repeat(72) }).success, true);
    assert.equal(registerUserSchema.safeParse({ ...valid, password: "😀".repeat(18) }).success, true);
});

test("registration API hashes credentials and returns only public fields", async (t) => {
    const original = prisma.user.create;
    const writes = [];
    const logs = [];
    const spies = ["log", "warn", "error"].map((method) => t.mock.method(console, method, (...args) => logs.push(args)));
    let mode = "success";
    prisma.user.create = async (args) => {
        writes.push(args);
        if (mode === "duplicate" || mode === "adapter-duplicate" || mode === "unrelated-unique") {
            throw new Prisma.PrismaClientKnownRequestError("SYNTHETIC_PRIVATE_DATABASE_DETAILS", {
                code: "P2002", clientVersion: "7.10.0",
                meta: mode === "adapter-duplicate"
                    ? { driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { index: "User_email_key" } } } }
                    : { target: [mode === "duplicate" ? "email" : "id"] },
            });
        }
        if (mode === "failure") throw new Error("SYNTHETIC_PRIVATE_DATABASE_DETAILS");
        // Deliberately return an extra secret despite the select to verify response whitelisting too.
        return { id: writes.length, ...args.data, createdAt: new Date("2026-11-23T00:00:00Z") };
    };
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const post = (body) => fetch(`http://127.0.0.1:${server.address().port}/api/users/register`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    try {
        await t.test("invalid input performs no persistence", async () => {
            const response = await post({ ...valid, password: "short" });
            assert.equal(response.status, 400);
            assert.equal(writes.length, 0);
        });
        await t.test("normalizes identity, hashes the exact password and strips privileged input", async () => {
            const response = await post({ ...valid, name: " Student ", email: " Student@Example.Test ", id: 999, passwordHash: "caller-controlled", role: "ADMIN", userId: 999 });
            assert.equal(response.status, 201);
            assert.equal(response.headers.get("set-cookie"), null);
            const body = await response.json();
            assert.equal(body.message, "User registered successfully");
            assert.deepEqual(Object.keys(body.data).sort(), ["createdAt", "email", "id", "name"]);
            assert.equal(body.data.email, "student@example.test");
            assert.equal(body.data.name, "Student");
            assert.deepEqual(Object.keys(writes[0].data).sort(), ["email", "name", "passwordHash"]);
            assert.deepEqual(writes[0].select, { id: true, name: true, email: true, createdAt: true });
            assert.notEqual(writes[0].data.passwordHash, password);
            assert.equal(bcrypt.getRounds(writes[0].data.passwordHash), 12);
            assert.equal(await bcrypt.compare(password, writes[0].data.passwordHash), true);
            assert.equal(await bcrypt.compare(password.trim(), writes[0].data.passwordHash), false);
            assert.ok(!JSON.stringify(body).includes(writes[0].data.passwordHash));
        });
        await t.test("same password gets a different salted hash", async () => {
            const response = await post({ ...valid, email: "second@example.test" });
            assert.equal(response.status, 201);
            assert.notEqual(writes[0].data.passwordHash, writes[1].data.passwordHash);
            assert.equal(await bcrypt.compare(password, writes[1].data.passwordHash), true);
            assert.deepEqual(logs, []);
        });
        for (const conflict of ["duplicate", "adapter-duplicate"]) {
            await t.test(`${conflict} email conflict returns safe 409`, async () => {
                mode = conflict;
                const response = await post(valid);
                assert.equal(response.status, 409);
                assert.deepEqual(await response.json(), { message: "An account with this email already exists" });
                assert.deepEqual(logs, []);
            });
        }
        for (const failure of ["failure", "unrelated-unique"]) {
            await t.test(`${failure} keeps internal details private`, async () => {
                mode = failure;
                const before = logs.length;
                const response = await post(valid);
                assert.equal(response.status, 500);
                assert.deepEqual(await response.json(), { message: "Internal server error" });
                assert.deepEqual(logs.slice(before), [["Unhandled request error"]]);
            });
        }
    } finally {
        prisma.user.create = original;
        for (const spy of spies) spy.mock.restore();
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});
