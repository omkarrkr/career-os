import type { Request, Response } from "express";
import { getUserProfile } from "../services/user.service.js";

export const getProfile = (req: Request, res: Response) => {

    const user = getUserProfile();

    res.json({
        success: true,
        data: user
    });

};

export const registerUser = (
    _req: Request,
    res: Response
) => {
    res.status(501).json({
        message: "Registration is not implemented yet",
    });
};
