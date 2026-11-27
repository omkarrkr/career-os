import type { Request, Response } from "express";
import type { z } from "zod";
import { ApiError } from "../utils/api-error.js";
import { invalidSession } from "../utils/auth-tokens.js";
import { goalIdSchema } from "../schemas/goal.schema.js";
import { createSubtaskSchema, updateSubtaskSchema, listSubtasksSchema } from "../schemas/subtask.schema.js";
import { listSubtasks, createSubtask, updateSubtask, deleteSubtask } from "../services/subtask.service.js";

function owner(res: Response) { const id: unknown = res.locals.auth?.userId; if (typeof id !== 'number') throw invalidSession(); return id; }
function id(value: unknown) { const parsed = goalIdSchema.safeParse(value); if (!parsed.success) throw new ApiError(400, "Invalid goal or subtask ID"); return parsed.data; }
function body<T>(schema: z.ZodType<T>, value: unknown, res: Response): { data: T } | null {
    const parsed = schema.safeParse(value);
    if (!parsed.success) { res.status(400).json({ message: "Invalid subtask data", errors: parsed.error.issues.map(issue => ({ field: issue.path.join('.') || 'body', message: issue.message })) }); return null; }
    return { data: parsed.data };
}
export const listSubtasksController = async (req: Request, res: Response) => {
    const goalId = id(req.params.id), query = listSubtasksSchema.safeParse(req.query);
    if (!query.success) throw new ApiError(400, "Invalid subtask query");
    res.json(await listSubtasks(owner(res), goalId, query.data.limit, query.data.afterId));
};
export const createSubtaskController = async (req: Request, res: Response) => {
    const goalId = id(req.params.id), parsed = body(createSubtaskSchema, req.body, res); if (!parsed) return;
    res.status(201).json({ data: await createSubtask(owner(res), goalId, parsed.data.title) });
};
export const updateSubtaskController = async (req: Request, res: Response) => {
    const goalId = id(req.params.id), subtaskId = id(req.params.subtaskId), parsed = body(updateSubtaskSchema, req.body, res); if (!parsed) return;
    res.json({ data: await updateSubtask(owner(res), goalId, subtaskId, parsed.data) });
};
export const deleteSubtaskController = async (req: Request, res: Response) => { await deleteSubtask(owner(res), id(req.params.id), id(req.params.subtaskId)); res.sendStatus(204); };
