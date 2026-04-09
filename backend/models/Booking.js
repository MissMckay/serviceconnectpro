const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
    userId: { type: String, ref: "User", required: true },
    providerId: { type: String, ref: "User", required: true },
    bookingDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Rejected", "Cancelled", "Completed"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

bookingSchema.index({ providerId: 1, createdAt: -1 });
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ serviceId: 1, createdAt: -1 });

bookingSchema.set("toJSON", { versionKey: false });

module.exports = mongoose.model("Booking", bookingSchema);
