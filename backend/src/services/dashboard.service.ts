import prisma from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { profileCompleteness } from "../schemas/career-profile.schema.js";

export const utcDayStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
export const goalStatusCounts = (groups: { status: string; _count: { _all: number } }[]) => {
    const total = groups.reduce((sum, group) => sum + group._count._all, 0);
    const active = groups.filter(group => group.status === "ACTIVE").reduce((sum, group) => sum + group._count._all, 0);
    const completed = groups.filter(group => group.status === "COMPLETED").reduce((sum, group) => sum + group._count._all, 0);
    return { total, active, completed, other: total - active - completed };
};

export const getDashboard = async (userId: number, now = new Date()) => {
    const overdueBefore = utcDayStart(now);
    // One repeatable-read snapshot keeps the profile, totals and recent list consistent.
    const [profile, grouped, overdue, recentGoals] = await prisma.$transaction([
        prisma.careerProfile.findUnique({ where: { userId }, select: {
            institution: true, degree: true, graduationYear: true, targetRole: true, weeklyLearningHours: true,
        } }),
        prisma.goal.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
        prisma.goal.count({ where: { userId, status: "ACTIVE", targetDate: { lt: overdueBefore } } }),
        prisma.goal.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5,
            select: { id: true, title: true, category: true, status: true, targetDate: true, createdAt: true } }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return {
        asOf: now.toISOString(), overdueBefore: overdueBefore.toISOString(),
        profile, completeness: profileCompleteness(profile), goals: { ...goalStatusCounts(grouped), overdue }, recentGoals,
    };
};
