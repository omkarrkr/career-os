import { Router } from "express";
import { goalProjectsController } from '../controllers/project-goal.controller.js';
import { createGoalController, listGoalsController, getGoalController, updateGoalController, deleteGoalController } from "../controllers/goal.controller.js";
import { authentication } from "../middleware/authentication.middleware.js";
import type { readEnvironment } from "../config/env.js";
import { listSubtasksController, createSubtaskController, updateSubtaskController, deleteSubtaskController } from "../controllers/subtask.controller.js";

export const createGoalRouter = (settings: ReturnType<typeof readEnvironment>) => {
    const router = Router();
    router.use(authentication(settings));
    router.get('/:id/projects', goalProjectsController);
    router.get("/:id/subtasks", listSubtasksController);
    router.post("/:id/subtasks", createSubtaskController);
    router.patch("/:id/subtasks/:subtaskId", updateSubtaskController);
    router.delete("/:id/subtasks/:subtaskId", deleteSubtaskController);
    router.post("/", createGoalController);
    router.get("/", listGoalsController);
    router.get("/:id", getGoalController);
    router.patch("/:id", updateGoalController);
    router.delete("/:id", deleteGoalController);
    return router;
};
