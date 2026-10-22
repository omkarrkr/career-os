import { Router } from "express";
import { createGoalController } from "../controllers/goal.controller.js";

const router = Router();

router.post("/", createGoalController);

export default router;