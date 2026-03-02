const mongoose = require("mongoose");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");

exports.getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const user = await User.findById(id).select("-password");
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  res.json({
    success: true,
    data: user
  });
});

exports.getCurrentUser = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const user = await User.findById(userId).select("-password");
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  res.json({
    success: true,
    data: {
      ...user.toObject(),
      canCreateService:
        user.role === "provider" &&
        user.isApproved === true &&
        user.accountStatus === "active"
    }
  });
});

exports.getProviderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error("Provider not found");
    error.statusCode = 404;
    throw error;
  }

  const provider = await User.findOne({ _id: id, role: "provider" }).select("-password");
  if (!provider) {
    const error = new Error("Provider not found");
    error.statusCode = 404;
    throw error;
  }

  res.json({
    success: true,
    data: provider
  });
});
