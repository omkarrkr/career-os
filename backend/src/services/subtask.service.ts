import prisma from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { ApiError } from "../utils/api-error.js";

const publicFields = { id: true, goalId: true, title: true, isCompleted: true, createdAt: true, updatedAt: true } as const;
const scope = (userId: number, goalId: number) => ({ goalId, goal: { userId } });

export const listSubtasks = (userId: number, goalId: number, limit: number, afterId?: number) => prisma.$transaction(async tx => {
    if (!await tx.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } })) throw new ApiError(404, "Goal not found");
    const where = scope(userId, goalId);
    const rows = await tx.subtask.findMany({ where: { ...where, ...(afterId !== undefined ? { id: { gt: afterId } } : {}) }, select: publicFields, orderBy: { id: "asc" }, take: limit + 1 });
    const total = await tx.subtask.count({ where });
    const completed = await tx.subtask.count({ where: { ...where, isCompleted: true } });
    const data = rows.slice(0, limit);
    return { data, nextCursor: rows.length > limit ? data.at(-1)!.id : null, summary: { total, completed } };
}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

export const createSubtask = (userId: number, goalId: number, title: string) => prisma.$transaction(async tx => {
    // Serialize additions to this owned goal so concurrent requests cannot bypass the cap.
    const parent = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT id FROM "Goal" WHERE id=${goalId} AND "userId"=${userId} FOR UPDATE`);
    if (!parent.length) throw new ApiError(404, "Goal not found");
    if (await tx.subtask.count({ where: scope(userId, goalId) }) >= 100) throw new ApiError(409, "A goal can have at most 100 subtasks");
    return tx.subtask.create({ data: { goalId, title }, select: publicFields });
});

export const updateSubtask = async (userId: number, goalId: number, id: number, patch: { title?: string | undefined; isCompleted?: boolean | undefined }) => {
    const rows = await prisma.subtask.updateManyAndReturn({ where: { id, ...scope(userId, goalId) },
        data: { ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.isCompleted !== undefined ? { isCompleted: patch.isCompleted } : {}) }, select: publicFields });
    if (!rows.length) throw new ApiError(404, "Subtask not found");
    return rows[0];
};
export const deleteSubtask = async (userId: number, goalId: number, id: number) => {
    if (!(await prisma.subtask.deleteMany({ where: { id, ...scope(userId, goalId) } })).count) throw new ApiError(404, "Subtask not found");
};
