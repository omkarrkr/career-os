import prisma from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../utils/api-error.js';
import type { ProjectInput } from '../schemas/project.schema.js';
const fields = { id: true, title: true, description: true, outcome: true, status: true, startDate: true, endDate: true, repositoryUrl: true, demoUrl: true, createdAt: true, updatedAt: true } as const;
const detailFields = { ...fields, skills: { orderBy: { skillId: 'asc' as const }, select: { skillId: true, evidence: true, skill: { select: { id: true, slug: true, name: true, category: true } } } } } as const;
const missing = () => new ApiError(404, 'Project not found');
const dataFields = (input: ProjectInput) => ({
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.repositoryUrl !== undefined ? { repositoryUrl: input.repositoryUrl } : {}),
    ...(input.demoUrl !== undefined ? { demoUrl: input.demoUrl } : {}),
    ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
    ...(input.endDate !== undefined ? { endDate: input.endDate ? new Date(input.endDate) : null } : {}),
});
const evidence = (skills: NonNullable<ProjectInput['skills']>) => skills.map(item => ({ skillId: item.skillId, evidence: item.evidence ?? null }));
function mapError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new ApiError(400, 'A linked catalog skill is unavailable');
    throw error;
}
export const listProjects = async (userId: number, limit: number, afterId?: number) => {
    const rows = await prisma.project.findMany({ where: { userId, ...(afterId !== undefined ? { id: { gt: afterId } } : {}) }, select: { ...fields, _count: { select: { skills: true } } }, orderBy: { id: 'asc' }, take: limit + 1 });
    const data = rows.slice(0, limit); return { data, nextCursor: rows.length > limit ? data.at(-1)!.id : null };
};
export const getProject = async (userId: number, id: number) => {
    const data = await prisma.project.findFirst({ where: { userId, id }, select: detailFields }); if (!data) throw missing(); return data;
};
export const createProject = async (userId: number, input: ProjectInput & { title: string }) => {
    try { return await prisma.project.create({ data: { ...dataFields(input), title: input.title, userId, skills: { create: evidence(input.skills ?? []) } }, select: detailFields }); }
    catch (error) { return mapError(error); }
};
export const updateProject = async (userId: number, id: number, input: ProjectInput) => {
    try {
        return await prisma.$transaction(async tx => {
            const rows = await tx.$queryRaw<{ startDate: string | null; endDate: string | null }[]>`SELECT "startDate"::text AS "startDate","endDate"::text AS "endDate" FROM "Project" WHERE id=${id} AND "userId"=${userId} FOR UPDATE`;
            const saved = rows[0]; if (!saved) throw missing();
            const start = input.startDate === undefined ? saved.startDate : input.startDate;
            const end = input.endDate === undefined ? saved.endDate : input.endDate;
            if (start && end && end < start) throw new ApiError(400, 'End date must not be before start date');
            return tx.project.update({ where: { id, userId }, data: { ...dataFields(input), ...(input.skills !== undefined ? { skills: { deleteMany: {}, create: evidence(input.skills) } } : {}) }, select: detailFields });
        });
    } catch (error) { return mapError(error); }
};
export const deleteProject = async (userId: number, id: number) => { if (!(await prisma.project.deleteMany({ where: { userId, id } })).count) throw missing(); };
