import { z } from "zod";

export const goalIdSchema = z.string().regex(/^[1-9]\d*$/).transform(Number)
    .pipe(z.number().int().positive().max(2147483647));
export const listGoalsSchema = z.object({
    limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(50)).default(20),
    afterId: goalIdSchema.optional(),
});

export const createGoalSchema = z.object({
    title: z.string({ error: "Title must be text" })
        .trim()
        .min(1, "Title is required")
        .max(200, "Title must be at most 200 characters"),
    category: z.string({ error: "Category must be text" })
        .trim()
        .min(1, "Category is required")
        .max(100, "Category must be at most 100 characters"),
    description: z.string({ error: "Description must be text" })
        .max(5000, "Description must be at most 5000 characters")
        .optional(),
    targetDate: z.union([
        z.iso.date(),
        z.iso.datetime({ offset: true }),
    ], { error: "Target date must be a valid date or timestamp with a timezone" })
        .refine((value) => Number.isFinite(Date.parse(value)), "Target date is invalid")
        .optional(),
});

export const updateGoalSchema = createGoalSchema.partial().extend({
    description: createGoalSchema.shape.description.unwrap().nullable().optional(),
    targetDate: createGoalSchema.shape.targetDate.unwrap().nullable().optional(),
    status: z.enum(["ACTIVE", "COMPLETED"]).optional(),
}).strict().refine(value => Object.values(value).some(field => field !== undefined), "Provide at least one goal field");
