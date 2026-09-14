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
    req: Request,
    res: Response
) => {

    console.log(req.body);

    res.json({
        message: "User received successfully!",
        data: req.body
    });

};