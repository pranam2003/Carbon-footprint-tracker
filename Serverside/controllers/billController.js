import Activity from "../models/Activity.js";
import { extractUnitsFromBill } from "../services/gemini.js";

const CARBON_PER_KWH = 0.82;


export const uploadBill = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "Please upload an image file (bill photo)" });
    }

    const userId = req.user.id;
    const mimeType = req.file.mimetype || "image/jpeg";

    const { units, error } = await extractUnitsFromBill(req.file.buffer, mimeType);
    if (error) {
      return res.status(400).json({ message: error || "Could not read units from bill" });
    }
    if (units <= 0) {
      return res.status(400).json({ message: "Could not find electricity units on the bill. Please enter manually in Add Activity." });
    }

    
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const existing = await Activity.findOne({
      user: userId,
      category: "Electricity",
      "details.source": "bill_upload",
      createdAt: { $gte: startOfMonth },
    });
    if (existing) {
      return res.status(400).json({
        message: "You have already uploaded a bill this month. You can add another next month.",
      });
    }

    const carbonEmission = Math.round(units * CARBON_PER_KWH * 100) / 100;
    const activity = await Activity.create({
      user: userId,
      category: "Electricity",
      details: { units, source: "bill_upload" },
      carbonEmission,
    });

    res.status(201).json({
      message: "Bill processed. Electricity activity added.",
      activity: {
        _id: activity._id,
        units,
        carbonEmission,
        createdAt: activity.createdAt,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to process bill" });
  }
};
