import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../utils/api-error.js';
export const visibleSkills = (userId: number): Prisma.SkillWhereInput => ({ OR: [{ ownerId: null }, { ownerId: userId }] });
export async function requireVisibleSkills(tx: Prisma.TransactionClient, userId: number, skills: { skillId: number }[]) {
    if (!skills.length) return;
    const ids = [...new Set(skills.map(item => item.skillId))];
    const count = await tx.skill.count({ where: { AND: [visibleSkills(userId), { id: { in: ids } }] } });
    if (count !== ids.length) throw new ApiError(400, 'A linked skill is unavailable');
}
