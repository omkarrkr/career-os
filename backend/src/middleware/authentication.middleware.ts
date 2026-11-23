import type { RequestHandler } from "express";
import type { readEnvironment } from "../config/env.js";
import { createAuthService } from "../services/auth.service.js";
import { invalidSession } from "../utils/auth-tokens.js";

export const authentication = (settings: ReturnType<typeof readEnvironment>): RequestHandler => {
    const service = createAuthService(settings);
    return async (req, res, next) => {
        res.set("Cache-Control", "no-store");
        const value = req.get("Authorization");
        const match = value && value.length <= 4096 ? /^Bearer ([^\s]+)$/.exec(value) : null;
        if (!match?.[1]) throw invalidSession();
        res.locals.auth = await service.authenticate(match[1]);
        next();
    };
};
