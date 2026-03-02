const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },

  email: { type: String, required: true, unique: true },

  password: { type: String, required: true },

  role: {
    type: String,
    enum: ["user", "provider", "admin"],
    default: "user"
  },

  // ✅ NEW: phone/contact (for both user/provider; useful in Liberia context)
  phone: {
    type: String,
    default: "Not provided"
  },

  accountStatus: {
    type: String,
    enum: ["active", "suspended"],
    default: "active"
  },

  isApproved: {
    type: Boolean,
    default: function isApprovedDefault() {
      return this.role !== "provider";
    }
  },

  approvalStatus: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: function approvalStatusDefault() {
      return this.role === "provider" ? "pending" : "approved";
    }
  },

  // ✅ Provider-only profile field (already discussed)
  providerAddress: {
    type: String,
    default: "Not provided"
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
