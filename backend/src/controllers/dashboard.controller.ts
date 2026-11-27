import type { Request, Response } from "express";
import { getDashboard } from "../services/dashboard.service.js";
import { invalidSession } from "../utils/auth-tokens.js";

export const getDashboardController = async (_req: Request, res: Response) => {
    const userId: unknown = res.locals.auth?.userId;
    if (typeof userId !== "number") throw invalidSession();
    res.json({ data: await getDashboard(userId) });
};
