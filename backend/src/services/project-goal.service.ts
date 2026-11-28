import prisma from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../utils/api-error.js';
const goalFields = { id: true, title: true, status: true, category: true, priority: true } as const;
const projectFields = { id: true, title: true, status: true } as const;
const linkFields = { goalId: true, projectId: true, createdAt: true, goal: { select: goalFields } } as const;
export const listProjectGoals = (userId: number, projectId: number, limit: number, afterId?: number) => prisma.$transaction(async tx => {
    if (!await tx.project.findFirst({ where: { id: projectId, userId }, select: { id: true } })) throw new ApiError(404, 'Project not found');
    const rows = await tx.projectGoal.findMany({ where: { userId, projectId, ...(afterId !== undefined ? { goalId: { gt: afterId } } : {}) }, select: linkFields, orderBy: { goalId: 'asc' }, take: limit + 1 });
    const data = rows.slice(0, limit); return { data, nextCursor: rows.length > limit ? data.at(-1)!.goalId : null };
}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
export const listGoalProjects = (userId: number, goalId: number, limit: number, afterId?: number) => prisma.$transaction(async tx => {
    if (!await tx.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } })) throw new ApiError(404, 'Goal not found');
    const rows = await tx.projectGoal.findMany({ where: { userId, goalId, ...(afterId !== undefined ? { projectId: { gt: afterId } } : {}) }, select: { projectId: true, goalId: true, createdAt: true, project: { select: projectFields } }, orderBy: { projectId: 'asc' }, take: limit + 1 });
    const data = rows.slice(0, limit); return { data, nextCursor: rows.length > limit ? data.at(-1)!.projectId : null };
}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
export const linkProjectGoal = async (userId: number, projectId: number, goalId: number) => {
    try { return await prisma.$transaction(async tx => {
        const project = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Project" WHERE id=${projectId} AND "userId"=${userId} FOR UPDATE`;
        if (!project.length) throw new ApiError(404, 'Project not found');
        const goal = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Goal" WHERE id=${goalId} AND "userId"=${userId} FOR KEY SHARE`;
        if (!goal.length) throw new ApiError(404, 'Goal not found');
        if (await tx.projectGoal.findUnique({ where: { projectId_goalId: { projectId, goalId } }, select: { goalId: true } })) throw new ApiError(409, 'This goal is already linked');
        if (await tx.projectGoal.count({ where: { projectId, userId } }) >= 100) throw new ApiError(409, 'A project can link at most 100 goals');
        return tx.projectGoal.create({ data: { userId, projectId, goalId }, select: linkFields });
    }); } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ApiError(409, 'This goal is already linked');
        throw error;
    }
};
export const unlinkProjectGoal = async (userId: number, projectId: number, goalId: number) => {
    if (!(await prisma.projectGoal.deleteMany({ where: { userId, projectId, goalId } })).count) throw new ApiError(404, 'Project–goal link not found');
};
