import type { Request, Response } from "express";
import { createGoal } from "../services/goal.service.js";
import { createGoalSchema } from "../schemas/goal.schema.js";

export const createGoalController = async (
    req: Request,
    res: Response
) => {
    const result = createGoalSchema.safeParse(req.body);

    if (!result.success) {
        res.status(400).json({
            message: "Invalid goal data",
            errors: result.error.issues.map((issue) => ({
                field: issue.path.join(".") || "body",
                message: issue.message,
            })),
        });
        return;
    }

    const { title, description, category, targetDate } = result.data;

    const goal = await createGoal(title, description, category, targetDate);

    res.status(201).json({
        message: "Goal created successfully",
        data: goal,
    });
};
