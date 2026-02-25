import Activity from "../models/Activity.js";
import { carbonChat, getPersonalizedSuggestions, getPatternSuggestions } from "../services/gemini.js";

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
