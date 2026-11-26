import prisma from "../config/prisma.js";
import type { CareerProfileInput } from "../schemas/career-profile.schema.js";

const publicFields = {
    userId: true, institution: true, degree: true, graduationYear: true,
    targetRole: true, weeklyLearningHours: true, interests: true, bio: true,
    createdAt: true, updatedAt: true,
} as const;

export const getCareerProfile = (userId: number) => prisma.careerProfile.findUnique({
    where: { userId }, select: publicFields,
});

export const updateCareerProfile = (userId: number, input: CareerProfileInput) => {
    const data = {
        ...(input.institution !== undefined ? { institution: input.institution } : {}),
        ...(input.degree !== undefined ? { degree: input.degree } : {}),
        ...(input.graduationYear !== undefined ? { graduationYear: input.graduationYear } : {}),
        ...(input.targetRole !== undefined ? { targetRole: input.targetRole } : {}),
        ...(input.weeklyLearningHours !== undefined ? { weeklyLearningHours: input.weeklyLearningHours } : {}),
        ...(input.interests !== undefined ? { interests: input.interests } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
    };
    return prisma.careerProfile.upsert({ where: { userId }, create: { ...data, userId }, update: data, select: publicFields });
};
