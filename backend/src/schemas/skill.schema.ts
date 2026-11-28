import { z } from "zod";
import { goalIdSchema } from "./goal.schema.js";
export const skillIdSchema = goalIdSchema;
export const levelSchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
const notes = z.string().max(1000).nullable();
export const createUserSkillSchema = z.object({ skillId: z.number().int().positive().max(2147483647), level: levelSchema.default("BEGINNER"), notes: notes.optional() }).strict();
export const updateUserSkillSchema = z.object({ level: levelSchema.optional(), notes: notes.optional() }).strict().refine(value => Object.values(value).some(field => field !== undefined), "Provide a skill field");
export const skillListSchema = z.object({ limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(50)).default(20), afterId: skillIdSchema.optional() }).strict();
export const catalogQuerySchema = skillListSchema.extend({ q: z.string().trim().max(80).default("") });
