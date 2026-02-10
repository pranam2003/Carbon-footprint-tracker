import express from "express";
import { getWeeklyReward, getRewardTiers } from "../controllers/rewardsController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.get("/weekly", protect, getWeeklyReward);
router.get("/tiers", protect, getRewardTiers);

export default router;
