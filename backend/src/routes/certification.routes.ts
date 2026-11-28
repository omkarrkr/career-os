import { Router, type Response } from 'express';
import type { z } from 'zod';
import type { readEnvironment } from '../config/env.js';
import { authentication } from '../middleware/authentication.middleware.js';
import { invalidSession } from '../utils/auth-tokens.js';
import { ApiError } from '../utils/api-error.js';
import { recordIdSchema as certificationIdSchema, recordListSchema as certificationListSchema, createCertificationSchema, updateCertificationSchema } from '../schemas/career-record.schema.js';
import { listCertifications, getCertification, createCertification, updateCertification, deleteCertification } from '../services/certification.service.js';
const owner = (res: Response) => { const id: unknown = res.locals.auth?.userId; if (typeof id !== 'number') throw invalidSession(); return id; };
const id = (value: unknown) => { const parsed = certificationIdSchema.safeParse(value); if (!parsed.success) throw new ApiError(400, 'Invalid certification ID'); return parsed.data; };
function parse<T>(schema: z.ZodType<T>, value: unknown, res: Response): { data: T } | null {
    const parsed = schema.safeParse(value); if (!parsed.success) { res.status(400).json({ message: 'Invalid certification data', errors: parsed.error.issues.map(issue => ({ field: issue.path.join('.') || 'body', message: issue.message })) }); return null; } return { data: parsed.data };
}
export const createCertificationRouter = (settings: ReturnType<typeof readEnvironment>) => {
    const router = Router(); router.use(authentication(settings));
    router.get('/', async (req, res) => { const query = certificationListSchema.safeParse(req.query); if (!query.success) throw new ApiError(400, 'Invalid certification query'); res.json(await listCertifications(owner(res), query.data.limit, query.data.afterId)); });
    router.get('/:certificationId', async (req, res) => { res.json({ data: await getCertification(owner(res), id(req.params.certificationId)) }); });
    router.post('/', async (req, res) => { const input = parse(createCertificationSchema, req.body, res); if (input) res.status(201).json({ data: await createCertification(owner(res), input.data) }); });
    router.patch('/:certificationId', async (req, res) => { const certificationId = id(req.params.certificationId), input = parse(updateCertificationSchema, req.body, res); if (input) res.json({ data: await updateCertification(owner(res), certificationId, input.data) }); });
    router.delete('/:certificationId', async (req, res) => { await deleteCertification(owner(res), id(req.params.certificationId)); res.sendStatus(204); });
    return router;
};
