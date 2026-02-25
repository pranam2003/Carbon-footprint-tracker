import express from "express";
import { chat, getSuggestions, getTips, getPatternStats } from "../controllers/aiController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/chat", protect, chat);
router.get("/tips", protect, getTips);
router.get("/suggestions", protect, getSuggestions);
router.get("/pattern-suggestions", protect, getPatternStats);

export default router;
