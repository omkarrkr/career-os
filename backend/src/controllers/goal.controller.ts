import type { Request, Response } from "express";
import { createGoal } from "../services/goal.service.js";

export const createGoalController = async (
    req: Request,
    res: Response
) => {
    try {
        const {
            title,
            description,
            category,
            targetDate,
        } = req.body;

        const goal = await createGoal(
            title,
            description,
            category,
            targetDate
        );

        res.status(201).json({
            message: "Goal created successfully",
            data: goal,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to create goal",
        });
    }
};