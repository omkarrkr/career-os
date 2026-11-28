import prisma from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { ApiError } from "../utils/api-error.js";
const catalogFields = { id: true, slug: true, name: true, category: true } as const;
const personalFields = { skillId: true, level: true, notes: true, createdAt: true, updatedAt: true, skill: { select: catalogFields } } as const;

export const listCatalog = async (limit: number, q: string, afterId?: number) => {
    const search = q.replace(/[\\%_]/g, "\\$&");
    const rows = await prisma.skill.findMany({ where: { ...(afterId !== undefined ? { id: { gt: afterId } } : {}), ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { category: { contains: search, mode: "insensitive" } }] } : {}) }, select: catalogFields, orderBy: { id: "asc" }, take: limit + 1 });
    const data = rows.slice(0, limit); return { data, nextCursor: rows.length > limit ? data.at(-1)!.id : null };
};
export const listUserSkills = async (userId: number, limit: number, afterId?: number) => {
    const rows = await prisma.userSkill.findMany({ where: { userId, ...(afterId !== undefined ? { skillId: { gt: afterId } } : {}) }, select: personalFields, orderBy: { skillId: "asc" }, take: limit + 1 });
    const data = rows.slice(0, limit); return { data, nextCursor: rows.length > limit ? data.at(-1)!.skillId : null };
};
export const addUserSkill = async (userId: number, skillId: number, level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED", notes?: string | null) => {
    try { return await prisma.userSkill.create({ data: { userId, skillId, level, ...(notes !== undefined ? { notes } : {}) }, select: personalFields }); }
    catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === "P2002") throw new ApiError(409, "This skill is already in your list");
            if (error.code === "P2003") throw new ApiError(404, "Skill not found");
        }
        throw error;
    }
};
export const updateUserSkill = async (userId: number, skillId: number, patch: { level?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | undefined; notes?: string | null | undefined }) => {
    const rows = await prisma.userSkill.updateManyAndReturn({ where: { userId, skillId }, data: { ...(patch.level !== undefined ? { level: patch.level } : {}), ...(patch.notes !== undefined ? { notes: patch.notes } : {}) }, select: personalFields });
    if (!rows.length) throw new ApiError(404, "Personal skill not found"); return rows[0];
};
export const removeUserSkill = async (userId: number, skillId: number) => { if (!(await prisma.userSkill.deleteMany({ where: { userId, skillId } })).count) throw new ApiError(404, "Personal skill not found"); };
