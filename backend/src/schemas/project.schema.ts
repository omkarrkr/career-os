import { z } from 'zod';
import { goalIdSchema } from './goal.schema.js';
import { skillListSchema } from './skill.schema.js';
export const projectIdSchema = goalIdSchema;
export const projectListSchema = skillListSchema;
const text = (limit: number) => z.string().trim().max(limit).nullable().optional();
const link = z.string().trim().max(2048).url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !/[\s\u0000-\u001f\u007f]/.test(value);
}, 'Use an HTTP or HTTPS URL without embedded credentials').nullable().optional();
const date = z.iso.date().nullable().optional();
export const projectEvidenceSchema = z.object({
    skillId: z.number().int().positive().max(2147483647), evidence: text(1000),
}).strict();
const fields = z.object({
    title: z.string().trim().min(1).max(200),
    description: text(3000), outcome: text(2000),
    status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED']).optional(),
    startDate: date, endDate: date, repositoryUrl: link, demoUrl: link,
    skills: z.array(projectEvidenceSchema).max(20).refine(values => new Set(values.map(item => item.skillId)).size === values.length, 'Each skill may be linked once').optional(),
}).strict();
const validDates = (value: { startDate?: string | null | undefined; endDate?: string | null | undefined }) => !value.startDate || !value.endDate || value.endDate >= value.startDate;
export const createProjectSchema = fields.refine(validDates, { message: 'End date must not be before start date', path: ['endDate'] });
export const updateProjectSchema = fields.partial().refine(value => Object.values(value).some(field => field !== undefined), 'Provide at least one project field').refine(validDates, { message: 'End date must not be before start date', path: ['endDate'] });
export type ProjectInput = z.infer<typeof updateProjectSchema>;
