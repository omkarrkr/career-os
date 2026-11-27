import prisma from "../config/prisma.js";
import type { z } from "zod";
import type { updateGoalSchema } from "../schemas/goal.schema.js";

export const createGoal = async (
    userId: number,
    title: string,
    description: string | undefined,
    category: string,
    targetDate: string | undefined
) => {
    const goal = await prisma.goal.create({
        data: {
            userId,
            title,
            category,
            ...(description !== undefined ? { description } : {}),
            ...(targetDate ? { targetDate: new Date(targetDate) } : {}),
        },
    });

    return goal;
};

export const listGoals = async (userId: number, limit: number, afterId?: number) => {
    const goals = await prisma.goal.findMany({
        where: { userId, ...(afterId !== undefined ? { id: { gt: afterId } } : {}) },
        orderBy: { id: "asc" }, take: limit + 1,
    });
    const hasMore = goals.length > limit;
    const data = goals.slice(0, limit);
    return { data, nextCursor: hasMore ? data.at(-1)!.id : null };
};

export const getGoal = (userId: number, id: number) => prisma.goal.findFirst({ where: { id, userId } });

export const updateGoal = async (userId: number, id: number, patch: z.infer<typeof updateGoalSchema>) => {
    const { title, category, description, status, targetDate } = patch;
    // Ownership and mutation are checked in the same SQL operation.
    const rows = await prisma.goal.updateManyAndReturn({
        where: { id, userId },
        data: {
            ...(title !== undefined ? { title } : {}), ...(category !== undefined ? { category } : {}),
            ...(description !== undefined ? { description } : {}), ...(status !== undefined ? { status } : {}),
            ...(targetDate !== undefined ? { targetDate: targetDate === null ? null : new Date(targetDate) } : {}),
        },
    });
    return rows[0] ?? null;
};

export const deleteGoal = (userId: number, id: number) => prisma.goal.deleteMany({ where: { id, userId } });
