import express from "express";
import { addActivity, getHistory, deleteActivity } from "../controllers/activityController.js";
import { uploadBill } from "../controllers/billController.js";
import { protect } from "../middleware/authMiddleware.js";
import { uploadBillImage } from "../config/multer.js";

const router = express.Router();
router.post("/", protect, addActivity);
router.get("/history", protect, getHistory);
router.delete("/:id", protect, deleteActivity);
router.post("/bill", protect, uploadBillImage, uploadBill);

export default router;