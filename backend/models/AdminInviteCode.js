const mongoose = require("mongoose");

const adminInviteCodeSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    createdBy: { type: String, required: true },
    usedBy: { type: String, default: null },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

adminInviteCodeSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model("AdminInviteCode", adminInviteCodeSchema);
