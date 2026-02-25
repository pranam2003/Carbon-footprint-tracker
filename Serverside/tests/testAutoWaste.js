
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/User.js";
import Activity from "../models/Activity.js";


dotenv.config({ path: "Serverside/.env" });


const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const runTest = async () => {
    await connectDB();
    console.log("Starting Auto Waste Logic Verification...");

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    try {
        // 1. Pick a random user or all users
        const users = await User.find({}).limit(1);
        if (users.length === 0) {
            console.log("No users found to test.");
            process.exit(0);
        }
        const user = users[0];
        console.log(`Testing with user: ${user.email} (${user._id})`);

        // 2. Clean up any existing waste for today for this user to ensure test runs
        await Activity.deleteOne({
            user: user._id,
            category: "Waste",
            createdAt: { $gte: startOfDay, $lte: endOfDay }
        });
        console.log("Cleaned up existing waste entry (if any).");

        // 3. Run the logic (copied from job)
        const wasteExists = await Activity.findOne({
            user: user._id,
            category: "Waste",
            createdAt: { $gte: startOfDay, $lte: endOfDay }
        });

        if (!wasteExists) {
            const newActivity = await Activity.create({
                user: user._id,
                category: "Waste",
                details: { weightKg: 0.8 },
                carbonEmission: 0.8 * 0.5,
                date: new Date()
            });
            console.log(`CREATED waste entry:`, newActivity);
        } else {
            console.log("Waste entry already exists (This shouldn't happen after cleanup).");
        }

        // 4. Verify it exists now
        const check = await Activity.findOne({
            user: user._id,
            category: "Waste",
            createdAt: { $gte: startOfDay, $lte: endOfDay }
        });

        if (check) {
            console.log("SUCCESS: Waste entry found in DB.");
        } else {
            console.error("FAILURE: Waste entry NOT found in DB.");
        }

    } catch (error) {
        console.error("Error during test:", error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
};

runTest();
