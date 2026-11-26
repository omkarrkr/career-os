import bcrypt from "bcrypt";
import { randomBytes, randomUUID } from "node:crypto";
import prisma from "../config/prisma.js";
import type { readEnvironment } from "../config/env.js";
import { hashPassword } from "../utils/password.js";
import { ApiError } from "../utils/api-error.js";
import { invalidSession, newRefreshToken, refreshHash, SESSION_MS, tokenTools, validRefreshToken } from "../utils/auth-tokens.js";

// Unknown-email login still performs a password check; no user credential is used.
const dummyHash = hashPassword(randomBytes(32).toString("hex"));

export const createAuthService = (settings: ReturnType<typeof readEnvironment>) => {
    const tokens = tokenTools(settings);
    return {
        login: async (email: string, password: string) => {
            const user = await prisma.user.findUnique({ where: { email } });
            const matches = await bcrypt.compare(password, user?.passwordHash ?? await dummyHash);
            if (!user || !matches) throw new ApiError(401, "Invalid email or password");

            const sessionId = randomUUID();
            const expiresAt = new Date(Date.now() + SESSION_MS);
            const refreshToken = newRefreshToken();
            const accessToken = await tokens.issue(user.id, sessionId, expiresAt);
            await prisma.$transaction(async (tx) => {
                // Serialize with password changes: an old password cannot create a late session.
                await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
                const current = await tx.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
                if (!current || current.passwordHash !== user.passwordHash) throw new ApiError(401, "Invalid email or password");
                await tx.authSession.create({ data: {
                    id: sessionId, userId: user.id, expiresAt,
                    refreshTokens: { create: { tokenHash: refreshHash(refreshToken), expiresAt } },
                } });
            });
            return { sessionId, expiresAt, refreshToken, accessToken,
                user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } };
        },
        refresh: async (raw: unknown, binding: string) => {
            if (!validRefreshToken(raw)) throw invalidSession();
            const record = await prisma.refreshToken.findUnique({ where: { tokenHash: refreshHash(raw) }, include: { session: true } });
            if (!record || record.sessionId !== binding) throw invalidSession();
            const nextToken = newRefreshToken();
            const accessToken = await tokens.issue(record.session.userId, record.sessionId, record.session.expiresAt);
            const accepted = await prisma.$transaction(async (tx) => {
                // All refreshes serialize on their stable session row, including replay revocation.
                await tx.$queryRaw`SELECT "id" FROM "AuthSession" WHERE "id" = ${record.sessionId}::uuid FOR UPDATE`;
                const session = await tx.authSession.findUnique({ where: { id: record.sessionId } });
                const token = await tx.refreshToken.findUnique({ where: { id: record.id } });
                const now = new Date();
                if (!session || !token || session.revokedAt || session.expiresAt <= now || token.expiresAt <= now) return false;
                if (token.usedAt) {
                    await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: now } });
                    return false; // Commit revocation; throwing inside this transaction would roll it back.
                }
                const claimed = await tx.refreshToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: now } });
                if (claimed.count !== 1) return false;
                await tx.refreshToken.create({ data: { sessionId: session.id, tokenHash: refreshHash(nextToken), expiresAt: session.expiresAt } });
                return true;
            });
            if (!accepted) throw invalidSession();
            return { accessToken, refreshToken: nextToken, expiresAt: record.session.expiresAt };
        },
        logout: async (raw: unknown, binding: string) => {
            if (!validRefreshToken(raw)) return;
            const token = await prisma.refreshToken.findUnique({ where: { tokenHash: refreshHash(raw) }, select: { sessionId: true } });
            if (token?.sessionId === binding) {
                await prisma.authSession.updateMany({ where: { id: token.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
            }
        },
        changePassword: async (userId: number, sessionId: string, currentPassword: string, newPassword: string) => {
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
            if (!user) throw invalidSession();
            if (!await bcrypt.compare(currentPassword, user.passwordHash)) throw new ApiError(400, "Current password is incorrect");
            if (currentPassword === newPassword) throw new ApiError(400, "New password must differ from current password");
            const passwordHash = await hashPassword(newPassword);
            await prisma.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
                const current = await tx.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
                const session = await tx.authSession.findUnique({ where: { id: sessionId } });
                const now = new Date();
                if (!current || current.passwordHash !== user.passwordHash || !session || session.userId !== userId
                    || session.revokedAt || session.expiresAt <= now) throw invalidSession();
                await tx.user.update({ where: { id: userId }, data: { passwordHash } });
                await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
            });
        },
        authenticate: async (token: string) => {
            const identity = await tokens.verify(token);
            const session = await prisma.authSession.findUnique({ where: { id: identity.sessionId } });
            if (!session || session.userId !== identity.userId || session.revokedAt || session.expiresAt <= new Date()) throw invalidSession();
            return identity;
        },
    };
};
