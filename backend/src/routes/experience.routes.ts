import { Router, type Response } from 'express';
import type { z } from 'zod';
import type { readEnvironment } from '../config/env.js';
import { authentication } from '../middleware/authentication.middleware.js';
import { invalidSession } from '../utils/auth-tokens.js';
import { ApiError } from '../utils/api-error.js';
import { recordIdSchema as experienceIdSchema, recordListSchema as experienceListSchema, createExperienceSchema, updateExperienceSchema } from '../schemas/career-record.schema.js';
import { listExperiences, getExperience, createExperience, updateExperience, deleteExperience } from '../services/experience.service.js';
const owner = (res: Response) => { const id: unknown = res.locals.auth?.userId; if (typeof id !== 'number') throw invalidSession(); return id; };
const id = (value: unknown) => { const parsed = experienceIdSchema.safeParse(value); if (!parsed.success) throw new ApiError(400, 'Invalid experience ID'); return parsed.data; };
function parse<T>(schema: z.ZodType<T>, value: unknown, res: Response): { data: T } | null {
    const parsed = schema.safeParse(value); if (!parsed.success) { res.status(400).json({ message: 'Invalid experience data', errors: parsed.error.issues.map(issue => ({ field: issue.path.join('.') || 'body', message: issue.message })) }); return null; } return { data: parsed.data };
}
export const createExperienceRouter = (settings: ReturnType<typeof readEnvironment>) => {
    const router = Router(); router.use(authentication(settings));
    router.get('/', async (req, res) => { const query = experienceListSchema.safeParse(req.query); if (!query.success) throw new ApiError(400, 'Invalid experience query'); res.json(await listExperiences(owner(res), query.data.limit, query.data.afterId)); });
    router.get('/:experienceId', async (req, res) => { res.json({ data: await getExperience(owner(res), id(req.params.experienceId)) }); });
    router.post('/', async (req, res) => { const input = parse(createExperienceSchema, req.body, res); if (input) res.status(201).json({ data: await createExperience(owner(res), input.data) }); });
    router.patch('/:experienceId', async (req, res) => { const experienceId = id(req.params.experienceId), input = parse(updateExperienceSchema, req.body, res); if (input) res.json({ data: await updateExperience(owner(res), experienceId, input.data) }); });
    router.delete('/:experienceId', async (req, res) => { await deleteExperience(owner(res), id(req.params.experienceId)); res.sendStatus(204); });
    return router;
};
