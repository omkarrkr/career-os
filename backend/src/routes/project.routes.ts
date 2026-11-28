import { Router, type Response } from 'express';
import { projectGoalsController, linkProjectGoalController, unlinkProjectGoalController } from '../controllers/project-goal.controller.js';
import type { z } from 'zod';
import type { readEnvironment } from '../config/env.js';
import { authentication } from '../middleware/authentication.middleware.js';
import { invalidSession } from '../utils/auth-tokens.js';
import { ApiError } from '../utils/api-error.js';
import { projectIdSchema, projectListSchema, createProjectSchema, updateProjectSchema } from '../schemas/project.schema.js';
import { listProjects, getProject, createProject, updateProject, deleteProject } from '../services/project.service.js';
const owner = (res: Response) => { const id: unknown = res.locals.auth?.userId; if (typeof id !== 'number') throw invalidSession(); return id; };
const id = (value: unknown) => { const parsed = projectIdSchema.safeParse(value); if (!parsed.success) throw new ApiError(400, 'Invalid project ID'); return parsed.data; };
function parse<T>(schema: z.ZodType<T>, value: unknown, res: Response): { data: T } | null {
    const parsed = schema.safeParse(value); if (!parsed.success) { res.status(400).json({ message: 'Invalid project data', errors: parsed.error.issues.map(issue => ({ field: issue.path.join('.') || 'body', message: issue.message })) }); return null; } return { data: parsed.data };
}
export const createProjectRouter = (settings: ReturnType<typeof readEnvironment>) => {
    const router = Router(); router.use(authentication(settings));
    router.get('/:projectId/goals', projectGoalsController);
    router.post('/:projectId/goals', linkProjectGoalController);
    router.delete('/:projectId/goals/:goalId', unlinkProjectGoalController);
    router.get('/', async (req, res) => { const query = projectListSchema.safeParse(req.query); if (!query.success) throw new ApiError(400, 'Invalid project query'); res.json(await listProjects(owner(res), query.data.limit, query.data.afterId)); });
    router.get('/:projectId', async (req, res) => { res.json({ data: await getProject(owner(res), id(req.params.projectId)) }); });
    router.post('/', async (req, res) => { const input = parse(createProjectSchema, req.body, res); if (input) res.status(201).json({ data: await createProject(owner(res), input.data) }); });
    router.patch('/:projectId', async (req, res) => { const projectId = id(req.params.projectId), input = parse(updateProjectSchema, req.body, res); if (input) res.json({ data: await updateProject(owner(res), projectId, input.data) }); });
    router.delete('/:projectId', async (req, res) => { await deleteProject(owner(res), id(req.params.projectId)); res.sendStatus(204); });
    return router;
};
