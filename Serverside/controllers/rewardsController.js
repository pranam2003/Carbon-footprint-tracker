import Activity from "../models/Activity.js";


const REWARD_TIERS = [
  { name: "Eco Champion", maxEmissions: 20, points: 100, badge: "gold" },
  { name: "Green Star", maxEmissions: 50, points: 75, badge: "silver" },
  { name: "Eco Friend", maxEmissions: 100, points: 50, badge: "bronze" },
  { name: "On Track", maxEmissions: 200, points: 25, badge: "green" },
];

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}


export const getWeeklyReward = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const startOfWeek = getStartOfWeek(now);

    const activities = await Activity.find({
      user: userId,
      createdAt: { $gte: startOfWeek },
    });

    const totalEmissions = activities.reduce((sum, a) => sum + (a.carbonEmission || 0), 0);
    const categoryBreakdown = activities.reduce((acc, a) => {
      acc[a.category] = (acc[a.category] || 0) + (a.carbonEmission || 0);
      return acc;
    }, {});

    let reward = null;
    for (const tier of REWARD_TIERS) {
      if (totalEmissions <= tier.maxEmissions) {
        reward = {
          tier: tier.name,
          points: tier.points,
          badge: tier.badge,
          maxEmissions: tier.maxEmissions,
        };
        break;
      }
    }
    if (!reward) {
      reward = {
        tier: "Keep Trying",
        points: 0,
        badge: "none",
        message: "Reduce emissions this week to earn a reward next week.",
      };
    }

    res.json({
      weekStart: startOfWeek,
      totalEmissions: Math.round(totalEmissions * 100) / 100,
      activityCount: activities.length,
      categoryBreakdown,
      reward,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch weekly reward" });
  }
};


export const getRewardTiers = async (req, res) => {
  res.json({ tiers: REWARD_TIERS });
};
