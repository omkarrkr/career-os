import type { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { readEnvironment } from "../config/env.js";

type SecuritySettings = Pick<ReturnType<typeof readEnvironment>, "NODE_ENV" | "CORS_ORIGINS">;

export const configureHttpSecurity = (app: Express, settings: SecuritySettings) => {
    const production = settings.NODE_ENV === "production";

    app.use(helmet({
        strictTransportSecurity: production ? { maxAge: 31536000 } : false,
        contentSecurityPolicy: {
            directives: { "upgrade-insecure-requests": production ? [] : null },
        },
    }));

    app.use((req, res, next) => {
        // Origin is a browser policy hint, not proof of user identity.
        res.vary("Origin");
        const origin = req.get("Origin");
        if (origin !== undefined && !settings.CORS_ORIGINS.includes(origin)) {
            res.status(403).json({ message: "Origin is not allowed" });
            return;
        }
        next();
    });

    app.use(cors({
        origin: settings.CORS_ORIGINS,
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type", "Authorization"],
        exposedHeaders: ["RateLimit", "RateLimit-Policy", "Retry-After"],
        credentials: false,
        maxAge: 600,
    }));

    // Keep Express's default trust-proxy=false until deployment topology is known.
    app.use("/api", rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 100,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { message: "Too many requests; try again later" },
    }));

    app.use("/api/users/register", rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        skip: (req) => req.method !== "POST",
        message: { message: "Too many registration attempts; try again later" },
    }));
};
