import Activity from "../models/Activity.js";


export const addActivity = async (req, res) => {
  try {
    const { category, details } = req.body;

    if (!category || !details) {
      return res.status(400).json({ message: "Category and details required" });
    }

    const activity = await Activity.create({
      user: req.user.id,
      category,
      details,
      carbonEmission: calculateCarbon(category, details),
      date: new Date(),
    });

    res.status(201).json(activity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to add activity" });
  }
};


export const getHistory = async (req, res) => {
  try {
    const activities = await Activity.find({ user: req.user.id }).sort({
      date: -1,
    });

    res.json(activities);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch history" });
  }
};


const calculateCarbon = (category, details) => {
  if (category === "Travel") {
    const factors = {
      car: 0.21,
      bike: 0.07,
      bus: 0.05,
    };
    return factors[details.vehicle] * details.distanceKm;
  }

  if (category === "Food") {
    return details.type === "nonveg" ? 5 : 2;
  }

  if (category === "Electricity") {
    return details.units * 0.82;
  }

  if (category === "Waste") {
    return details.weightKg * 0.5;
  }

  return 0;
};
