const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({
  serviceName: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  availabilityStatus: {
    type: String,
    enum: ["Available", "Unavailable"],
    default: "Available"
  },
  moderationStatus: {
    type: String,
    enum: ["active", "removed"],
    default: "active"
  },
  removedAt: {
    type: Date,
    default: null
  },
  removedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  // Multiple Images (Max 10)
  images: [
    {
      imageUrl: {
        type: String,
        required: true
      },
      caption: {
        type: String,
        default: ""
      }
    }
  ],

  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }

}, { timestamps: true });

module.exports = mongoose.model("Service", serviceSchema);
