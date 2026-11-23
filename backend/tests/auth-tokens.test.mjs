import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { SignJWT, decodeJwt } from "jose";
import { tokenTools, newRefreshToken, refreshHash, validRefreshToken } from "../src/utils/auth-tokens.ts";
import { readEnvironment } from "../src/config/env.ts";

const settings = { AUTH_JWT_SECRET: "a".repeat(64) };
const tools = tokenTools(settings);
test("access tokens carry only identity and respect the absolute session deadline", async () => {
    const sid = randomUUID();
    const deadline = new Date(Date.now() + 30000);
    const token = await tools.issue(42, sid, deadline);
    assert.deepEqual(await tools.verify(token), { userId: 42, sessionId: sid });
    assert.equal(decodeJwt(token).exp, Math.floor(deadline.getTime() / 1000));
    assert.deepEqual(Object.keys(decodeJwt(token)).sort(), ["aud", "exp", "iat", "iss", "sid", "sub"]);
});
test("invalid signature, expired token and invalid signed claims are rejected", async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { sub: "42", sid: randomUUID(), iss: "careeros", aud: "careeros-api", iat: now, exp: now + 900 };
    const sign = (payload, header = { alg: "HS256", typ: "at+jwt" }, key = "a".repeat(64)) =>
        new SignJWT(payload).setProtectedHeader(header).sign(Buffer.from(key, "hex"));
    for (const token of [
        "not.a.jwt", await sign(claims, undefined, "c".repeat(64)),
        ...await Promise.all([{ exp: now - 1 }, { iss: "other" }, { aud: "other" }, { sid: "invalid" },
            { sub: "0" }, { sub: "9007199254740993" }, { iat: now + 60 }, { iat: now - 1000 }, { exp: undefined }]
            .map((change) => sign({ ...claims, ...change }))),
        await sign(claims, { alg: "HS384", typ: "at+jwt" }),
        await sign(claims, { alg: "HS256", typ: "JWT" }),
    ]) await assert.rejects(tools.verify(token), { statusCode: 401, message: "Invalid or expired session" });
});
test("refresh credentials are random opaque values and only deterministic hashes are stored", () => {
    const first = newRefreshToken();
    assert.equal(validRefreshToken(first), true);
    assert.notEqual(first, newRefreshToken());
    assert.match(refreshHash(first), /^[a-f0-9]{64}$/);
    assert.notEqual(first, refreshHash(first));
    for (const invalid of [null, [], "short", "a".repeat(44)]) assert.equal(validRefreshToken(invalid), false);
});
test("startup requires independent valid auth keys without reflecting secrets", () => {
    const valid = { DATABASE_URL: "postgresql://localhost/test", AUTH_JWT_SECRET: "a".repeat(64), AUTH_CSRF_SECRET: "b".repeat(64) };
    for (const change of [{ AUTH_JWT_SECRET: undefined }, { AUTH_CSRF_SECRET: "private-value" }, { AUTH_CSRF_SECRET: valid.AUTH_JWT_SECRET }]) {
        assert.throws(() => readEnvironment({ ...valid, ...change }), (error) =>
            error.message.startsWith("Invalid environment settings: AUTH_") && !error.message.includes("private-value"));
    }
});
