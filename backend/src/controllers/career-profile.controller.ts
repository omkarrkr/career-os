import type { Request, Response } from "express";
import { careerProfileSchema, profileCompleteness } from "../schemas/career-profile.schema.js";
import { getCareerProfile, updateCareerProfile } from "../services/career-profile.service.js";
import { invalidSession } from "../utils/auth-tokens.js";

const ownerId = (res: Response): number => {
    const id: unknown = res.locals.auth?.userId;
    if (typeof id !== "number") throw invalidSession();
    return id;
};

export const getCareerProfileController = async (_req: Request, res: Response) => {
    const data = await getCareerProfile(ownerId(res));
    res.json({ data, completeness: profileCompleteness(data) });
};

export const updateCareerProfileController = async (req: Request, res: Response) => {
    const parsed = careerProfileSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid career profile data", errors: parsed.error.issues.map(issue => ({
            field: issue.path.join(".") || "body", message: issue.code === "unrecognized_keys" ? "Unsupported profile fields" : issue.message,
        })) });
        return;
    }
    const data = await updateCareerProfile(ownerId(res), parsed.data);
    res.json({ data, completeness: profileCompleteness(data) });
};
