import { Router } from "express";
import { createGoalController, listGoalsController, getGoalController, updateGoalController, deleteGoalController } from "../controllers/goal.controller.js";
import { authentication } from "../middleware/authentication.middleware.js";
import type { readEnvironment } from "../config/env.js";

export const createGoalRouter = (settings: ReturnType<typeof readEnvironment>) => {
    const router = Router();
    router.use(authentication(settings));
    router.post("/", createGoalController);
    router.get("/", listGoalsController);
    router.get("/:id", getGoalController);
    router.patch("/:id", updateGoalController);
    router.delete("/:id", deleteGoalController);
    return router;
};
