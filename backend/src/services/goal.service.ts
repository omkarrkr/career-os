import prisma from "../config/prisma.js";

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
