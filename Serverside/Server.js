import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import rewardsRoutes from "./routes/rewardsRoutes.js";
import scheduleDailyReminders from "./jobs/dailyReminder.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/rewards", rewardsRoutes);

const startServer = async () => {
  try {
    await connectDB();

    scheduleDailyReminders();
    app.listen(5000, () => console.log("Server running on port 5000"));
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
};

startServer();

