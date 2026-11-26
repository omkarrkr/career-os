import { z } from "zod";

const optionalText = (max: number) => z.string().trim().min(1).max(max)
    .refine(value => !value.includes("\0") && value.isWellFormed(), "Invalid characters")
    .nullable().optional();

export const careerProfileSchema = z.object({
    institution: optionalText(200),
    degree: optionalText(100),
    graduationYear: z.number().int().min(1990).max(2100).nullable().optional(),
    targetRole: optionalText(100),
    weeklyLearningHours: z.number().int().min(1).max(40).nullable().optional(),
    interests: z.array(z.string().trim().min(1).max(50)
        .refine(value => !value.includes("\0") && value.isWellFormed(), "Invalid characters"))
        .max(10).transform(values => values.filter((value, index) => values.findIndex(other => other.toLowerCase() === value.toLowerCase()) === index)).optional(),
    bio: optionalText(1000),
}).strict().refine(value => Object.values(value).some(field => field !== undefined), "Provide at least one profile field");

export type CareerProfileInput = z.infer<typeof careerProfileSchema>;

const coreFields = ["institution", "degree", "graduationYear", "targetRole", "weeklyLearningHours"] as const;
type CompletionInput = { [Field in typeof coreFields[number]]: string | number | null };
export const profileCompleteness = (profile: CompletionInput | null) => {
    const completedFields = coreFields.filter(field => {
        const value = profile?.[field];
        return value !== null && value !== undefined && (typeof value !== "string" || value.trim().length > 0);
    });
    const missingFields = coreFields.filter(field => !completedFields.includes(field));
    return { completedFields, missingFields, totalFields: coreFields.length, isComplete: missingFields.length === 0 };
};
