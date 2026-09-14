import { Router } from "express";
import { getProfile, registerUser } from "../controllers/user.controller.js";

const router = Router();

router.get("/profile", getProfile);
router.post("/register", registerUser);

export default router;