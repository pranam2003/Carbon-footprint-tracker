import cron from "node-cron";
import User from "../models/User.js";
import Activity from "../models/Activity.js";

const scheduleAutoWasteCreator = () => {
  
    cron.schedule("0 0 * * *", async () => {
        console.log("Running Auto Waste Creation Job...");

        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        try {
            const users = await User.find({});

            for (const user of users) {
                
                const wasteExists = await Activity.findOne({
                    user: user._id,
                    category: "Waste",
                    createdAt: { $gte: startOfDay, $lte: endOfDay }
                });

                if (!wasteExists) {
                    await Activity.create({
                        user: user._id,
                        category: "Waste",
                        details: { weightKg: 0.8 },
                        carbonEmission: 0.8 * 0.5, // 0.4 DEFAULT_WASTE_KG * CARBON_FACTOR
                        date: new Date()
                    });
                    console.log(`Auto-added waste for user: ${user.email}`);
                }
            }
        } catch (error) {
            console.error("Error in Auto Waste Job:", error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });
};

export default scheduleAutoWasteCreator;
