import express from "express";
import { register, login, refreshToken, logout, verifyEmail } from "../controllers/authController.js";
const router = express.Router();
router.post("/register", register);
router.post("/verify-email", verifyEmail);
router.post("/login", login);
router.post("/refresh", refreshToken);
router.post("/logout", logout);

export default router;