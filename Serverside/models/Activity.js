import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    category: {
      type: String,
      enum: ["Travel", "Food", "Electricity", "Waste"],
      required: true,
    },

    details: {
      type: Object,
      required: true,
    },

    carbonEmission: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true }
);

const Activity = mongoose.model("Activity", activitySchema);
export default Activity;