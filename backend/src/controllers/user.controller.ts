import type { Request, Response } from "express";
import { createUser, getUserProfile } from "../services/user.service.js";
import { registerUserSchema } from "../schemas/user.schema.js";

export const getProfile = (req: Request, res: Response) => {

    const user = getUserProfile();

    res.json({
        success: true,
        data: user
    });

};

export const registerUser = async (
    req: Request,
    res: Response
) => {
    const result = registerUserSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({
            message: "Invalid registration data",
            errors: result.error.issues.map((issue) => ({
                field: issue.path.join(".") || "body",
                message: issue.message,
            })),
        });
        return;
    }

    const user = await createUser(result.data);
    res.status(201).json({
        message: "User registered successfully",
        data: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
    });
};
