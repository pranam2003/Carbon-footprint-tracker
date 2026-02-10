import express from "express";
import { getTips, chat, getSuggestions } from "../controllers/aiController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.get("/", protect, getTips);
router.post("/chat", protect, chat);
router.get("/suggestions", protect, getSuggestions);

export default router;
