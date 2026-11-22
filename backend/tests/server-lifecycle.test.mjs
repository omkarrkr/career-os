import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { startServer } from "../src/server-lifecycle.ts";

const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};

test("connects before listening and cleans up only once for repeated stop calls", async () => {
    const events = [];
    const connected = deferred();
    const server = createServer();
    server.on("listening", () => events.push("listening"));
    const starting = startServer(server, {
        $connect: async () => { await connected.promise; events.push("connected"); },
        $disconnect: async () => { events.push("disconnected"); },
    }, 0);
    assert.equal(server.listening, false);
    connected.resolve();
    const lifecycle = await starting;
    assert.deepEqual(events, ["connected", "listening"]);
    const first = lifecycle.stop();
    assert.equal(lifecycle.stop(), first);
    await first;
    assert.equal(server.listening, false);
    assert.deepEqual(events, ["connected", "listening", "disconnected"]);
});

test("failed database connection never opens the HTTP server and attempts cleanup", async () => {
    const server = createServer();
    let disconnects = 0;
    await assert.rejects(startServer(server, {
        $connect: async () => { throw new Error("Simulated connection failure"); },
        $disconnect: async () => { disconnects++; },
    }, 0), /Simulated connection failure/);
    assert.equal(server.listening, false);
    assert.equal(disconnects, 1);
});

test("occupied port rejects startup and closes the database connection", async () => {
    const occupied = createServer();
    occupied.listen(0);
    await once(occupied, "listening");
    const server = createServer();
    let disconnects = 0;
    try {
        await assert.rejects(startServer(server, {
            $connect: async () => undefined,
            $disconnect: async () => { disconnects++; },
        }, occupied.address().port), { code: "EADDRINUSE" });
        assert.equal(server.listening, false);
        assert.equal(disconnects, 1);
    } finally {
        await new Promise((resolve) => occupied.close(resolve));
    }
});

test("shutdown allows an active request to finish before disconnecting the database", async () => {
    const received = deferred();
    const release = deferred();
    const events = [];
    const server = createServer((_req, res) => {
        received.resolve();
        void release.promise.then(() => { events.push("response finished"); res.end("done"); });
    });
    const lifecycle = await startServer(server, {
        $connect: async () => undefined,
        $disconnect: async () => { events.push("database disconnected"); },
    }, 0);
    try {
        const response = fetch(`http://127.0.0.1:${server.address().port}/`);
        await received.promise;
        const stopping = lifecycle.stop();
        await setImmediate();
        assert.deepEqual(events, []);
        release.resolve();
        assert.equal(await (await response).text(), "done");
        await stopping;
        assert.deepEqual(events, ["response finished", "database disconnected"]);
    } finally {
        release.resolve();
        await lifecycle.stop();
    }
});

test("shutdown deadline closes a stuck HTTP connection and reports failure", async () => {
    const received = deferred();
    const server = createServer(() => { received.resolve(); });
    let disconnects = 0;
    const lifecycle = await startServer(server, {
        $connect: async () => undefined,
        $disconnect: async () => { disconnects++; },
    }, 0);
    const response = fetch(`http://127.0.0.1:${server.address().port}/`).catch(() => undefined);
    await received.promise;
    await assert.rejects(lifecycle.stop(50), /Server shutdown timed out/);
    await response;
    await setImmediate();
    assert.equal(server.listening, false);
    assert.equal(disconnects, 1);
});

test("shutdown deadline also bounds a stuck database disconnect", async () => {
    const server = createServer();
    const lifecycle = await startServer(server, {
        $connect: async () => undefined,
        $disconnect: () => new Promise(() => {}),
    }, 0);
    await assert.rejects(lifecycle.stop(50), /Server shutdown timed out/);
    assert.equal(server.listening, false);
});

test("database cleanup failures are reported instead of claiming successful shutdown", async () => {
    const server = createServer();
    const lifecycle = await startServer(server, {
        $connect: async () => undefined,
        $disconnect: async () => { throw new Error("Simulated cleanup failure"); },
    }, 0);
    await assert.rejects(lifecycle.stop(), /Simulated cleanup failure/);
    assert.equal(server.listening, false);
});
