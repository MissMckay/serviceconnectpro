const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, default: "" },
    password: { type: String, required: false },
    role: {
      type: String,
      enum: ["user", "provider", "admin"],
      default: "user",
    },
    phone: { type: String, default: "Not provided" },
    accountStatus: { type: String, enum: ["active", "suspended"], default: "active" },
    isApproved: {
      type: Boolean,
      default: function isApprovedDefault() {
        return this.role !== "provider";
      },
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: function approvalStatusDefault() {
        return this.role === "provider" ? "pending" : "approved";
      },
    },
    providerAddress: { type: String, default: "Not provided" },
    profilePhoto: { type: String, default: "" },
  },
  { timestamps: true, _id: true, collection: "users" }
);

userSchema.set("toJSON", {
  transform(doc, ret) {
    ret.id = ret._id;
    ret.uid = ret._id;
    if (ret.password !== undefined) delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
