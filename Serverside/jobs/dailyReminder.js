import cron from "node-cron";
import User from "../models/User.js";
import Activity from "../models/Activity.js";
import { sendDailyReminderEmail } from "../services/emailService.js";

const scheduleDailyReminders = () => {
 
  const timezone = process.env.CRON_TIMEZONE || "Asia/Kolkata";

 
  cron.schedule(
    "10 11 * * *",
    async () => {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      try {
        const users = await User.find({});

        for (const user of users) {
          
          const hasActivityToday = await Activity.exists({
            user: user._id,
            createdAt: { $gte: startOfDay, $lte: endOfDay },
          });

          if (!hasActivityToday) {
            await sendDailyReminderEmail(
              user,
              process.env.FRONTEND_URL || "http://localhost:3000/add-activity"
            );
          }
        }
      } catch (err) {
        console.error("[dailyReminder] Error while sending reminders:", err.message);
      }
    },
    { timezone }
  );
};

export default scheduleDailyReminders;

