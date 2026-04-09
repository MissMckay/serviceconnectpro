const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    availabilityStatus: {
      type: String,
      enum: ["Available", "Unavailable"],
      default: "Available",
    },
    moderationStatus: {
      type: String,
      enum: ["active", "removed"],
      default: "active",
    },
    removedAt: { type: Date, default: null },
    removedBy: { type: String, default: null },
    images: [
      {
        imageUrl: { type: String, required: true },
        thumbnailUrl: { type: String, default: "" },
        caption: { type: String, default: "" },
      },
    ],
    thumbnailUrl: { type: String, default: "" },
    providerId: { type: String, required: true },
    providerName: { type: String, default: "" },
    providerAddress: { type: String, default: "" },
    providerProfilePhoto: { type: String, default: "" },
    averageRating: { type: Number, default: null },
    reviewsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

serviceSchema.path("images").validate(function (value) {
  return !Array.isArray(value) || value.length <= 7;
}, "Maximum 7 images are allowed");

serviceSchema.index({ moderationStatus: 1, createdAt: -1 });
serviceSchema.index({ moderationStatus: 1, category: 1, createdAt: -1 });
serviceSchema.index({ moderationStatus: 1, providerId: 1, createdAt: -1 });
serviceSchema.index({ moderationStatus: 1, price: 1, createdAt: -1 });

module.exports = mongoose.model("Service", serviceSchema);
