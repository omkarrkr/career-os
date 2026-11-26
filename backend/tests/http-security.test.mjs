import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { readEnvironment } from "../src/config/env.ts";

const databaseUrl = "postgresql://test:test@127.0.0.1:1/careeros_test";
process.env.DATABASE_URL = databaseUrl;
const { createApp } = await import("../src/app.ts");
const { default: prisma } = await import("../src/config/prisma.ts");
const allowedOrigin = "http://localhost:5173";

const withServer = async (run, environment = {}) => {
    const app = createApp(readEnvironment({
        AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET,
        AUTH_CSRF_SECRET: process.env.AUTH_CSRF_SECRET,
        DATABASE_URL: databaseUrl,
        CORS_ORIGINS: allowedOrigin,
        ...environment,
    }));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
        await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
};

test("security headers protect JSON responses without forcing local HTTPS", async () => {
    await withServer(async (base) => {
        for (const path of ["/", "/missing"]) {
            const response = await fetch(base + path);
            assert.equal(response.headers.get("x-content-type-options"), "nosniff");
            assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
            assert.equal(response.headers.get("x-powered-by"), null);
            assert.equal(response.headers.get("strict-transport-security"), null);
            assert.doesNotMatch(response.headers.get("content-security-policy"), /upgrade-insecure-requests/);
        }
    });
});

test("production responses include HTTPS browser safeguards", async () => {
    await withServer(async (base) => {
        const response = await fetch(base);
        assert.match(response.headers.get("strict-transport-security"), /max-age=31536000/);
        assert.match(response.headers.get("content-security-policy"), /upgrade-insecure-requests/);
    }, { NODE_ENV: "production" });
});

test("allowed origin gets explicit CORS permission without cookie credentials", async () => {
    await withServer(async (base) => {
        const response = await fetch(base + "/api/users/profile", { headers: { Origin: allowedOrigin } });
        assert.equal(response.status, 401);
        assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
        assert.equal(response.headers.get("access-control-allow-credentials"), null);
        assert.match(response.headers.get("vary"), /Origin/);
    });
});

test("allowed preflight returns permitted methods/headers without invoking a route", async () => {
    await withServer(async (base) => {
        const response = await fetch(base + "/api/goals", {
            method: "OPTIONS",
            headers: {
                Origin: allowedOrigin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,authorization",
            },
        });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
        assert.equal(response.headers.get("access-control-allow-methods"), "GET,POST,PATCH");
        assert.match(response.headers.get("access-control-allow-headers"), /Authorization/i);
        assert.equal(response.headers.get("access-control-max-age"), "600");
    });
});

test("unapproved, lookalike and null origins are rejected before persistence", async () => {
    const original = prisma.goal.create;
    let writes = 0;
    prisma.goal.create = async () => { writes++; return {}; };
    try {
        await withServer(async (base) => {
            for (const Origin of ["https://unapproved.example", "http://localhost:5173.evil.example", "null"]) {
                const response = await fetch(base + "/api/goals", {
                    method: "POST",
                    headers: { Origin, "content-type": "application/json" },
                    body: JSON.stringify({ title: "Learn SQL", category: "Development" }),
                });
                assert.equal(response.status, 403);
                assert.equal(response.headers.get("access-control-allow-origin"), null);
                assert.deepEqual(await response.json(), { message: "Origin is not allowed" });
            }
            assert.equal(writes, 0);
        });
    } finally {
        prisma.goal.create = original;
    }
});

test("empty origin configuration rejects explicit origins but permits no-Origin tools", async () => {
    await withServer(async (base) => {
        const rejected = await fetch(base, { headers: { Origin: allowedOrigin } });
        assert.equal(rejected.status, 403);
        const accepted = await fetch(base);
        assert.equal(accepted.status, 200);
        assert.equal(accepted.headers.get("access-control-allow-origin"), null);
    }, { CORS_ORIGINS: "" });
});

test("authentication errors retain CORS permissions and security headers", async () => {
    await withServer(async (base) => {
        const response = await fetch(base + "/api/goals", {
            method: "POST",
            headers: { Origin: allowedOrigin, "content-type": "application/json" },
            body: "{}",
        });
        assert.equal(response.status, 401);
        assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    });
});

test("API limit returns safe 429, excludes preflight/root and resists spoofed forwarded IPs", async () => {
    await withServer(async (base) => {
        for (let index = 0; index < 3; index++) {
            const preflight = await fetch(base + "/api/users/profile", {
                method: "OPTIONS",
                headers: { Origin: allowedOrigin, "Access-Control-Request-Method": "GET" },
            });
            assert.equal(preflight.status, 204);
        }
        for (let index = 0; index < 100; index++) {
            const response = await fetch(base + "/api/users/profile");
            assert.equal(response.status, 401, `request ${index + 1}`);
            await response.arrayBuffer();
        }
        const limited = await fetch(base + "/api/users/profile", {
            headers: { Origin: allowedOrigin, "X-Forwarded-For": "203.0.113.42" },
        });
        assert.equal(limited.status, 429);
        assert.deepEqual(await limited.json(), { message: "Too many requests; try again later" });
        assert.ok(Number(limited.headers.get("retry-after")) > 0);
        assert.ok(limited.headers.get("ratelimit"));
        assert.equal(limited.headers.get("x-ratelimit-limit"), null);
        assert.equal(limited.headers.get("access-control-allow-origin"), allowedOrigin);
        assert.equal((await fetch(base)).status, 200);
    });
});

test("registration has its own 10-attempt budget before validation and hashing", async () => {
    await withServer(async (base) => {
        for (let index = 0; index < 10; index++) {
            const response = await fetch(base + "/api/users/register", {
                method: "POST", headers: { "content-type": "application/json" }, body: "{}",
            });
            assert.equal(response.status, 400);
            await response.arrayBuffer();
        }
        const response = await fetch(base + "/api/users/register", {
            method: "POST", headers: { "content-type": "application/json" }, body: "{}",
        });
        assert.equal(response.status, 429);
        assert.deepEqual(await response.json(), { message: "Too many registration attempts; try again later" });
        assert.equal((await fetch(base + "/api/users/profile")).status, 401);
    });
});

test("auth bootstrap uses credentialed exact-origin CORS and host-only production cookies", async () => {
    await withServer(async (base) => {
        const response = await fetch(base + "/api/auth/csrf", { headers: { Origin: allowedOrigin } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
        assert.equal(response.headers.get("access-control-allow-credentials"), "true");
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(typeof (await response.json()).csrfToken, "string");
        const cookies = response.headers.getSetCookie();
        assert.equal(cookies.length, 2);
        for (const cookie of cookies) {
            assert.match(cookie, /^__Host-careeros_(binding|csrf)=/);
            for (const flag of [/; HttpOnly/, /; Secure/, /; SameSite=Lax/, /; Path=\/(;|$)/]) assert.match(cookie, flag);
            assert.doesNotMatch(cookie, /; Domain=/i);
        }
    }, { NODE_ENV: "production" });
});

test("login has a separate 10-attempt budget even for requests rejected by CSRF", async () => {
    await withServer(async (base) => {
        for (let index = 0; index < 11; index++) {
            const response = await fetch(base + "/api/auth/login", { method: "POST",
                headers: { Origin: allowedOrigin, "Content-Type": "application/json" }, body: "{}" });
            assert.equal(response.status, index < 10 ? 403 : 429);
            if (index === 10) assert.deepEqual(await response.json(), { message: "Too many login attempts; try again later" });
            else await response.arrayBuffer();
        }
    });
});

test("password change has a five-attempt budget before CSRF and password hashing", async () => {
    await withServer(async (base) => {
        for (let index = 0; index < 6; index++) {
            const response = await fetch(base + "/api/auth/change-password", { method: "POST",
                headers: { Origin: allowedOrigin, "Content-Type": "application/json" }, body: "{}" });
            assert.equal(response.status, index < 5 ? 403 : 429);
            if (index === 5) assert.deepEqual(await response.json(), { message: "Too many password change attempts; try again later" });
            else await response.arrayBuffer();
        }
    });
});

test("auth endpoints reject unsupported content and missing or forged CSRF before database access", async () => {
    await withServer(async (base) => {
        const bootstrap = await fetch(base + "/api/auth/csrf", { headers: { Origin: allowedOrigin } });
        const cookie = bootstrap.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
        const token = (await bootstrap.json()).csrfToken;
        for (const headers of [
            { "Content-Type": "text/plain", "X-CSRF-Token": token },
            { "Content-Type": "application/json" },
            { "Content-Type": "application/json", "X-CSRF-Token": "forged" },
        ]) {
            const response = await fetch(base + "/api/auth/refresh", { method: "POST", headers: { Origin: allowedOrigin, Cookie: cookie, ...headers }, body: "{}" });
            assert.equal(response.status, headers["Content-Type"] === "text/plain" ? 415 : 403);
            await response.arrayBuffer();
        }
    });
});
