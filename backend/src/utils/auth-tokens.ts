import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { readEnvironment } from "../config/env.js";
import { ApiError } from "./api-error.js";

export const ACCESS_SECONDS = 15 * 60;
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const newRefreshToken = () => randomBytes(32).toString("base64url");
export const refreshHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const validRefreshToken = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
export const invalidSession = () => new ApiError(401, "Invalid or expired session");

const claims = z.object({
    sub: z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger),
    sid: z.uuid(),
});

export const tokenTools = (settings: Pick<ReturnType<typeof readEnvironment>, "AUTH_JWT_SECRET">) => {
    const key = Buffer.from(settings.AUTH_JWT_SECRET, "hex");
    return {
        issue: (userId: number, sessionId: string, sessionExpiresAt: Date) => {
            const now = Math.floor(Date.now() / 1000);
            return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
                .setSubject(String(userId)).setIssuer("careeros").setAudience("careeros-api")
                .setIssuedAt(now).setExpirationTime(Math.min(now + ACCESS_SECONDS, Math.floor(sessionExpiresAt.getTime() / 1000)))
                .sign(key);
        },
        verify: async (token: string) => {
            try {
                const { payload } = await jwtVerify(token, key, {
                    algorithms: ["HS256"], typ: "at+jwt", issuer: "careeros", audience: "careeros-api",
                    requiredClaims: ["sub", "sid", "iat", "exp"], maxTokenAge: "15m",
                });
                const parsed = claims.safeParse(payload);
                if (!parsed.success) throw invalidSession();
                return { userId: parsed.data.sub, sessionId: parsed.data.sid };
            } catch { throw invalidSession(); }
        },
    };
};
