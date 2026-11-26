import assert from "node:assert/strict";
import test from "node:test";
import { changePasswordSchema } from "../src/schemas/user.schema.ts";

test("password changes validate both exact passwords and reject weak, identical and malformed input", () => {
    const valid = { currentPassword: "Current fictional passphrase!", newPassword: " New fictional passphrase! " };
    assert.deepEqual(changePasswordSchema.parse({ ...valid, userId: 999 }), valid);
    for (const change of [
        { currentPassword: undefined }, { currentPassword: 123 }, { newPassword: "too short" },
        { newPassword: valid.currentPassword }, { newPassword: "a".repeat(73) },
        { newPassword: "é".repeat(37) }, { newPassword: " ".repeat(20) },
        { newPassword: "invalid\0passphrase!" }, { newPassword: "invalid\ud800passphrase!" },
    ]) assert.equal(changePasswordSchema.safeParse({ ...valid, ...change }).success, false);
});
