import Activity from "../models/Activity.js";
import { carbonChat, getPersonalizedSuggestions, getPatternSuggestions } from "../services/gemini.js";

// Emission factors
const EMISSION_FACTORS = {
  Travel: { car: 0.21, bike: 0.11, bus: 0.089 },  // kg CO2 per km
  Food: { veg: 1.5, nonveg: 6.0 },               // kg CO2 per meal
  Electricity: 0.82,                                 // kg CO2 per kWh unit
  Waste: 0.5,                                        // kg CO2 per kg waste
};

function calculateCarbon(category, details) {
  switch (category) {
    case "Travel": {
      const factor = EMISSION_FACTORS.Travel[details.vehicle] ?? 0.21;
      return Math.round(factor * (details.distanceKm || 0) * 100) / 100;
    }
    case "Food": {
      const factor = EMISSION_FACTORS.Food[details.type] ?? 1.5;
      return factor;
    }
    case "Electricity": {
      return Math.round(EMISSION_FACTORS.Electricity * (details.units || 0) * 100) / 100;
    }
    case "Waste": {
      return Math.round(EMISSION_FACTORS.Waste * (details.weightKg || 0) * 100) / 100;
    }
    default:
      return 0;
  }
}

// Daily limits per category
const DAILY_LIMITS = { Travel: 2, Food: 3, Waste: 2 };

export const addActivity = async (req, res) => {
  try {
    const { category, details, carbonEmission: clientCarbon } = req.body;
    if (!category || !details) {
      return res.status(400).json({ message: "category and details are required" });
    }

    // Check daily limits for Travel, Food, Waste
    if (DAILY_LIMITS[category] !== undefined) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const todayCount = await Activity.countDocuments({
        user: req.user.id,
        category,
        createdAt: { $gte: startOfDay },
      });

      if (todayCount >= DAILY_LIMITS[category]) {
        return res.status(400).json({
          message: `You can only add ${DAILY_LIMITS[category]} ${category} ${DAILY_LIMITS[category] === 1 ? "entry" : "entries"} per day. Try again tomorrow.`,
        });
      }
    }

    // If adding electricity manually, block if a bill was already uploaded this month
    if (category === "Electricity") {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const billUploaded = await Activity.findOne({
        user: req.user.id,
        category: "Electricity",
        "details.source": "bill_upload",
        createdAt: { $gte: startOfMonth },
      });

      if (billUploaded) {
        return res.status(400).json({
          message: "You already uploaded an electricity bill this month. Manual entry is not allowed until next month.",
        });
      }
    }

    // Use client-provided value if given, otherwise calculate server-side
    const carbonEmission = clientCarbon !== undefined
      ? clientCarbon
      : calculateCarbon(category, details);

    const activity = await Activity.create({
      user: req.user.id,
      category,
      details,
      carbonEmission,
    });
    res.status(201).json(activity);
  } catch (error) {
    console.error("Error adding activity:", error);
    res.status(500).json({ message: "Failed to add activity" });
  }
};



export const getHistory = async (req, res) => {
  try {
    const activities = await Activity.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(activities);
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ message: "Failed to fetch activity history" });
  }
};

export const getTips = (req, res) => {
  res.json({
    tips: [
      "Use public transport to reduce emissions",
      "Prefer vegetarian meals more often",
      "Reduce electricity consumption during peak hours",
      "Recycle waste properly",
    ],
  });
};


export const chat = async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }
    const result = await carbonChat(message.trim(), history);
    if (result.error) {
      return res.status(503).json({ message: result.error });
    }
    res.json({ reply: result.text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Chat failed" });
  }
};


export const getSuggestions = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    startOfWeek.setHours(0, 0, 0, 0);

    const activities = await Activity.find({
      user: userId,
      createdAt: { $gte: startOfWeek },
    });
    const weeklyEmissions = activities.reduce((sum, a) => sum + (a.carbonEmission || 0), 0);
    const categoryBreakdown = activities.reduce((acc, a) => {
      acc[a.category] = (acc[a.category] || 0) + (a.carbonEmission || 0);
      return acc;
    }, {});

    const { suggestions } = await getPersonalizedSuggestions(weeklyEmissions, categoryBreakdown);
    res.json({ suggestions, weeklyEmissions: Math.round(weeklyEmissions * 100) / 100 });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to get suggestions",
      suggestions: [
        "Use public transport to reduce emissions",
        "Prefer vegetarian meals more often",
        "Reduce electricity consumption during peak hours",
        "Recycle waste properly",
      ],
    });
  }

};

export const getPatternStats = async (req, res) => {
  try {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 30);


    const activities = await Activity.find({
      user: req.user.id,
      createdAt: { $gte: twoWeeksAgo },
    }).sort({ createdAt: -1 });

    if (activities.length < 5) {

      return res.json({ suggestion: null });
    }

    const suggestion = await getPatternSuggestions(activities);

    res.json({ suggestion });
  } catch (error) {
    console.error("Error fetching AI suggestions:", error);
    res.status(500).json({ message: "Failed to fetch suggestions" });
  }
};
