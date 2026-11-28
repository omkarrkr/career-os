import express from "express";
import { createUserRouter } from "./routes/user.routes.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createGoalRouter } from "./routes/goal.routes.js";
import { createSkillRouter } from "./routes/skill.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";
import { readEnvironment } from "./config/env.js";
import { configureHttpSecurity } from "./middleware/security.middleware.js";

export const createApp = (settings = readEnvironment()) => {
    const app = express();

    configureHttpSecurity(app, settings);
    app.use(express.json());

    app.get("/", (req, res) => {
        res.json({
            project: "CareerOS",
            version: "1.0.0",
            developer: "Omkar Kumar",
            status: "Backend Running ✅"
        });
    });

    app.use("/api/users", createUserRouter(settings));
    app.use("/api/auth", createAuthRouter(settings));
    app.use("/api/goals", createGoalRouter(settings));
    app.use("/api/skills", createSkillRouter(settings));
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
};

const app = createApp();
export default app;
// res.send(`
// <h1>🚀 Welcome to CareerOS Backend!</h1>
// <p>Version 1.0.0</p>
// <p>Built with Express + TypeScript</p>
// `);
