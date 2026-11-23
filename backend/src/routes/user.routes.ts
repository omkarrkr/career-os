import { Router } from "express";
import { getProfile, registerUser } from "../controllers/user.controller.js";
import type { readEnvironment } from "../config/env.js";
import { authentication } from "../middleware/authentication.middleware.js";

export const createUserRouter = (settings: ReturnType<typeof readEnvironment>) => {
    const router = Router();

    router.get("/profile", authentication(settings), getProfile);
    router.post("/register", registerUser);

    return router;
};
