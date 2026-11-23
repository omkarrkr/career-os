import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { readEnvironment as parseEnvironment } from "../src/config/env.ts";
const authKeys = { AUTH_JWT_SECRET: "a".repeat(64), AUTH_CSRF_SECRET: "b".repeat(64) };
const readEnvironment = (source) => parseEnvironment({ ...authKeys, ...source });

const databaseUrl = "postgresql://test:test@127.0.0.1:1/careeros_test";

test("startup settings accept a PostgreSQL URL and default the HTTP port", () => {
    assert.deepEqual(readEnvironment({ DATABASE_URL: databaseUrl }), {
        DATABASE_URL: databaseUrl,
        PORT: 3000,
        NODE_ENV: "development",
        CORS_ORIGINS: [],
        ...authKeys,
    });
    assert.equal(readEnvironment({ DATABASE_URL: databaseUrl, PORT: "8080" }).PORT, 8080);
    assert.equal(readEnvironment({ DATABASE_URL: databaseUrl, PORT: "65535" }).PORT, 65535);
});

test("rejects missing or invalid PostgreSQL configuration without exposing its value", () => {
    for (const value of [undefined, "", "SYNTHETIC_SECRET", "https://test:secret@example.test/db", "postgresql://host/"]) {
        assert.throws(() => readEnvironment({ DATABASE_URL: value }), {
            message: "Invalid environment settings: DATABASE_URL",
        });
    }
});

test("rejects empty, zero, negative, fractional, malformed and out-of-range ports", () => {
    for (const PORT of ["", " ", "0", "-1", "3.5", "65536", "abc", "3e3"]) {
        assert.throws(() => readEnvironment({ DATABASE_URL: databaseUrl, PORT }), {
            message: "Invalid environment settings: PORT",
        });
    }
});

test("validates runtime mode and exact HTTP origin lists without reflecting values", () => {
    const settings = readEnvironment({
        DATABASE_URL: databaseUrl,
        NODE_ENV: "production",
        CORS_ORIGINS: "https://career.example, http://localhost:5173",
    });
    assert.equal(settings.NODE_ENV, "production");
    assert.deepEqual(settings.CORS_ORIGINS, ["https://career.example", "http://localhost:5173"]);
    assert.throws(() => readEnvironment({ DATABASE_URL: databaseUrl, NODE_ENV: "invalid" }), {
        message: "Invalid environment settings: NODE_ENV",
    });
    for (const CORS_ORIGINS of ["*", "null", "https://career.example/", "https://career.example/path", "https://user:secret@career.example", "https://career.example,,https://other.example"]) {
        assert.throws(() => readEnvironment({ DATABASE_URL: databaseUrl, CORS_ORIGINS }), {
            message: "Invalid environment settings: CORS_ORIGINS",
        });
    }
});

test("server entry rejects invalid settings safely before starting infrastructure", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/server.ts"], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: "SYNTHETIC_SECRET", PORT: "0" },
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid environment settings: DATABASE_URL, PORT/);
    assert.doesNotMatch(result.stderr + result.stdout, /SYNTHETIC_SECRET|Server is running|Database connected/);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
    test(`server entry handles repeated ${signal} events with one clean disconnect`, async () => {
        const reserved = createServer();
        reserved.listen(0);
        await once(reserved, "listening");
        const port = reserved.address().port;
        await new Promise((resolve) => reserved.close(resolve));

        const script = `
            const { default: prisma } = await import('./src/config/prisma.ts');
            prisma.$connect = async () => undefined;
            prisma.$disconnect = async () => console.log('TEST database disconnected');
            const log = console.log;
            console.log = (...args) => {
                log(...args);
                if (String(args[0]).startsWith('Server is running')) {
                    setImmediate(() => {
                        process.emit('${signal}');
                        process.emit('${signal}');
                    });
                }
            };
            await import('./src/server.ts');
        `;
        const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
            cwd: process.cwd(),
            env: { ...process.env, DATABASE_URL: databaseUrl, PORT: String(port) },
            encoding: "utf8",
            timeout: 10000,
            windowsHide: true,
        });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Server shutdown completed/);
        assert.equal(result.stdout.match(/TEST database disconnected/g)?.length, 1);
        assert.equal(result.stdout.match(/Server shutdown started/g)?.length, 1);
    });
}

test("server entry suppresses raw startup connection failures and exits unsuccessfully", () => {
    const script = `
        const { default: prisma } = await import('./src/config/prisma.ts');
        prisma.$connect = async () => { throw new Error('SYNTHETIC_PRIVATE_CONNECTION_DETAILS'); };
        prisma.$disconnect = async () => undefined;
        await import('./src/server.ts');
    `;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl, PORT: "3000" },
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Server startup failed/);
    assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_PRIVATE_CONNECTION_DETAILS|Server is running/);
});
