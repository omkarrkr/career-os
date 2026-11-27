import type { Request, Response } from "express";
import { createGoal, listGoals, getGoal, updateGoal, deleteGoal } from "../services/goal.service.js";
import { createGoalSchema, goalIdSchema, listGoalsSchema, updateGoalSchema } from "../schemas/goal.schema.js";
import { invalidSession } from "../utils/auth-tokens.js";
import { ApiError } from "../utils/api-error.js";

const ownerId = (res: Response): number => {
    const id: unknown = res.locals.auth?.userId;
    if (typeof id !== "number") throw invalidSession();
    return id;
};

export const listGoalsController = async (req: Request, res: Response) => {
    const parsed = listGoalsSchema.safeParse(req.query);
    if (!parsed.success) throw new ApiError(400, "Invalid goal query");
    res.json(await listGoals(ownerId(res), parsed.data));
};

export const getGoalController = async (req: Request, res: Response) => {
    const parsed = goalIdSchema.safeParse(req.params.id);
    if (!parsed.success) throw new ApiError(400, "Invalid goal ID");
    const goal = await getGoal(ownerId(res), parsed.data);
    if (!goal) throw new ApiError(404, "Goal not found");
    res.json({ data: goal });
};

export const updateGoalController = async (req: Request, res: Response) => {
    const id = goalIdSchema.safeParse(req.params.id);
    if (!id.success) throw new ApiError(400, "Invalid goal ID");
    const parsed = updateGoalSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid goal data", errors: parsed.error.issues.map(issue => ({ field: issue.path.join(".") || "body", message: issue.message })) });
        return;
    }
    const goal = await updateGoal(ownerId(res), id.data, parsed.data);
    if (!goal) throw new ApiError(404, "Goal not found");
    res.json({ data: goal });
};

export const deleteGoalController = async (req: Request, res: Response) => {
    const id = goalIdSchema.safeParse(req.params.id);
    if (!id.success) throw new ApiError(400, "Invalid goal ID");
    const result = await deleteGoal(ownerId(res), id.data);
    if (!result.count) throw new ApiError(404, "Goal not found");
    res.sendStatus(204);
};

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

    const { title, description, category, targetDate, priority } = result.data;

    const goal = await createGoal(ownerId(res), title, description, category, targetDate, priority);

    res.status(201).json({
        message: "Goal created successfully",
        data: goal,
    });
};
