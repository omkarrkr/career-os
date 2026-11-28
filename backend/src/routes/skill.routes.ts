import { Router, type Response } from "express";
import type { z } from "zod";
import type { readEnvironment } from "../config/env.js";
import { authentication } from "../middleware/authentication.middleware.js";
import { invalidSession } from "../utils/auth-tokens.js";
import { ApiError } from "../utils/api-error.js";
import { skillIdSchema, skillListSchema, catalogQuerySchema, createUserSkillSchema, updateUserSkillSchema } from "../schemas/skill.schema.js";
import { listCatalog, listUserSkills, addUserSkill, updateUserSkill, removeUserSkill } from "../services/skill.service.js";
const owner = (res: Response) => { const id: unknown = res.locals.auth?.userId; if (typeof id !== 'number') throw invalidSession(); return id; };
const id = (value: unknown) => { const parsed = skillIdSchema.safeParse(value); if (!parsed.success) throw new ApiError(400, "Invalid skill ID"); return parsed.data; };
function body<T>(schema: z.ZodType<T>, value: unknown, res: Response): { data: T } | null {
    const parsed = schema.safeParse(value); if (!parsed.success) { res.status(400).json({ message: "Invalid skill data", errors: parsed.error.issues.map(issue => ({ field: issue.path.join('.') || 'body', message: issue.message })) }); return null; } return { data: parsed.data };
}
export const createSkillRouter = (settings: ReturnType<typeof readEnvironment>) => {
    const router = Router(); router.use(authentication(settings));
    router.get('/catalog', async (req, res) => { const query = catalogQuerySchema.safeParse(req.query); if (!query.success) throw new ApiError(400, "Invalid catalog query"); res.json(await listCatalog(query.data.limit, query.data.q, query.data.afterId)); });
    router.get('/', async (req, res) => { const query = skillListSchema.safeParse(req.query); if (!query.success) throw new ApiError(400, "Invalid skill query"); res.json(await listUserSkills(owner(res), query.data.limit, query.data.afterId)); });
    router.post('/', async (req, res) => { const parsed = body(createUserSkillSchema, req.body, res); if (!parsed) return; res.status(201).json({ data: await addUserSkill(owner(res), parsed.data.skillId, parsed.data.level, parsed.data.notes) }); });
    router.patch('/:skillId', async (req, res) => { const skillId = id(req.params.skillId), parsed = body(updateUserSkillSchema, req.body, res); if (!parsed) return; res.json({ data: await updateUserSkill(owner(res), skillId, parsed.data) }); });
    router.delete('/:skillId', async (req, res) => { await removeUserSkill(owner(res), id(req.params.skillId)); res.sendStatus(204); });
    return router;
};
