import { z } from "zod";
import { goalIdSchema } from "./goal.schema.js";
export const skillIdSchema = goalIdSchema;
export const levelSchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
const notes = z.string().max(1000).nullable();
export const createUserSkillSchema = z.object({ skillId: z.number().int().positive().max(2147483647), level: levelSchema.default("BEGINNER"), notes: notes.optional() }).strict();
export const updateUserSkillSchema = z.object({ level: levelSchema.optional(), notes: notes.optional() }).strict().refine(value => Object.values(value).some(field => field !== undefined), "Provide a skill field");
export const skillListSchema = z.object({ limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(50)).default(20), afterId: skillIdSchema.optional() }).strict();
export const catalogQuerySchema = skillListSchema.extend({ q: z.string().trim().max(80).default("") });
export const normalizeSkillName = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
export const customSkillSchema = z.object({
    name: z.string().max(400).transform(normalizeSkillName).pipe(z.string().min(1).max(80).regex(/^[^\u0000-\u001f\u007f]+$/, 'Use a skill name without control characters')).refine(value => value.toLowerCase().length <= 80, 'Skill name is too long'),
    category: z.string().trim().min(1).max(80).default('Custom'),
}).strict();
