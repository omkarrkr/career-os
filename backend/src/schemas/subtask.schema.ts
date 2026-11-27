import { z } from "zod";
import { goalIdSchema } from "./goal.schema.js";
const title = z.string().trim().min(1, "Title is required").max(200, "Title must be at most 200 characters");
export const createSubtaskSchema = z.object({ title }).strict();
export const updateSubtaskSchema = z.object({ title: title.optional(), isCompleted: z.boolean().optional() }).strict()
    .refine(value => Object.values(value).some(field => field !== undefined), "Provide a subtask field");
export const listSubtasksSchema = z.object({
    limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(50)).default(20),
    afterId: goalIdSchema.optional(),
}).strict();
