import prisma from "../config/prisma.js";

export const createGoal = async (
    title: string,
    description: string | undefined,
    category: string,
    targetDate: string | undefined
) => {
    const goal = await prisma.goal.create({
        data: {
            title,
            description,
            category,
            targetDate: targetDate
                ? new Date(targetDate)
                : undefined,
        },
    });

    return goal;
};