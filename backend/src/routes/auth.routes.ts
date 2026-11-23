import { Router } from "express";
import type { CookieOptions, Request, Response } from "express";
import cookieParser from "cookie-parser";
import { doubleCsrf } from "csrf-csrf";
import { randomBytes } from "node:crypto";
import type { readEnvironment } from "../config/env.js";
import { registerUserSchema } from "../schemas/user.schema.js";
import { createAuthService } from "../services/auth.service.js";
import { ApiError } from "../utils/api-error.js";
import { ACCESS_SECONDS, SESSION_MS } from "../utils/auth-tokens.js";

export const authCookieNames = (production: boolean) => {
    const prefix = production ? "__Host-careeros_" : "careeros_";
    return { refresh: prefix + "refresh", binding: prefix + "binding", csrf: prefix + "csrf" };
};

const cookieValue = (req: Request, name: string): string | undefined => {
    const value: unknown = req.cookies?.[name];
    return typeof value === "string" ? value : undefined;
};

export const createAuthRouter = (settings: ReturnType<typeof readEnvironment>) => {
    const router = Router();
    const service = createAuthService(settings);
    const names = authCookieNames(settings.NODE_ENV === "production");
    const options: CookieOptions = { httpOnly: true, secure: settings.NODE_ENV === "production", sameSite: "lax", path: "/" };
    const csrf = doubleCsrf({
        getSecret: () => settings.AUTH_CSRF_SECRET,
        getSessionIdentifier: (req) => cookieValue(req, names.binding) ?? "",
        cookieName: names.csrf, cookieOptions: { ...options, maxAge: SESSION_MS },
        getCsrfTokenFromRequest: (req) => req.get("X-CSRF-Token"),
    });
    const bind = (req: Request, res: Response, value: string, expires?: Date) => {
        req.cookies[names.binding] = value;
        res.cookie(names.binding, value, { ...options, ...(expires ? { expires } : { maxAge: SESSION_MS }) });
    };
    const clear = (res: Response) => {
        for (const name of Object.values(names)) res.clearCookie(name, options);
    };
    const expiresIn = (expiresAt: Date) => Math.max(0, Math.min(ACCESS_SECONDS,
        Math.floor(expiresAt.getTime() / 1000) - Math.floor(Date.now() / 1000)));
    router.use(cookieParser());
    router.use((req, res, next) => {
        res.set("Cache-Control", "no-store");
        if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
            let origin = req.get("Origin");
            if (!origin && req.get("Referer")) {
                try { origin = new URL(req.get("Referer")!).origin; } catch { /* Reject below. */ }
            }
            if (!origin || !settings.CORS_ORIGINS.includes(origin)) throw new ApiError(403, "A trusted origin is required");
            if (!req.is("application/json")) throw new ApiError(415, "JSON content is required");
            if (!cookieValue(req, names.binding)) throw new ApiError(403, "CSRF validation failed");
        }
        next();
    });
    router.get("/csrf", (req, res) => {
        const binding = cookieValue(req, names.binding);
        if (!binding || !/^[a-f0-9-]{32,64}$/i.test(binding)) bind(req, res, randomBytes(32).toString("hex"));
        res.json({ csrfToken: csrf.generateCsrfToken(req, res) });
    });
    router.use(csrf.doubleCsrfProtection);
    router.post("/login", async (req, res) => {
        const parsed = registerUserSchema.pick({ email: true, password: true }).safeParse(req.body);
        if (!parsed.success) throw new ApiError(400, "Invalid login data");
        const login = await service.login(parsed.data.email, parsed.data.password);
        res.cookie(names.refresh, login.refreshToken, { ...options, expires: login.expiresAt });
        bind(req, res, login.sessionId, login.expiresAt);
        res.json({ message: "Logged in successfully", data: {
            accessToken: login.accessToken, expiresIn: expiresIn(login.expiresAt), user: login.user,
            csrfToken: csrf.generateCsrfToken(req, res, { overwrite: true }),
        } });
    });
    router.post("/refresh", async (req, res) => {
        try {
            const refreshed = await service.refresh(cookieValue(req, names.refresh), cookieValue(req, names.binding)!);
            res.cookie(names.refresh, refreshed.refreshToken, { ...options, expires: refreshed.expiresAt });
            res.json({ data: { accessToken: refreshed.accessToken, expiresIn: expiresIn(refreshed.expiresAt) } });
        } catch (error) {
            if (error instanceof ApiError && error.statusCode === 401) clear(res);
            throw error;
        }
    });
    router.post("/logout", async (req, res) => {
        await service.logout(cookieValue(req, names.refresh), cookieValue(req, names.binding)!);
        clear(res);
        res.status(204).end();
    });
    return router;
};
