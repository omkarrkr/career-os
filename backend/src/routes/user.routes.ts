import { Router } from "express";
import { getProfile, registerUser } from "../controllers/user.controller.js";
import type { readEnvironment } from "../config/env.js";
import { authentication } from "../middleware/authentication.middleware.js";
import { getCareerProfileController, updateCareerProfileController } from "../controllers/career-profile.controller.js";
import { getDashboardController } from "../controllers/dashboard.controller.js";

export const createUserRouter = (settings: ReturnType<typeof readEnvironment>) => {
    const router = Router();

    router.get("/profile", authentication(settings), getProfile);
    router.get("/dashboard", authentication(settings), getDashboardController);
    router.get("/career-profile", authentication(settings), getCareerProfileController);
    router.patch("/career-profile", authentication(settings), updateCareerProfileController);
    router.post("/register", registerUser);

    return router;
};
