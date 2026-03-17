const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");

exports.getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== "string" || id.trim() === "") {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  const user = await User.findById(id.trim()).select("-password").lean();
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  res.json({
    success: true,
    data: { ...user, id: user._id, _id: user._id }
  });
});

exports.getCurrentUser = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  const user = await User.findById(String(userId)).select("-password").lean();
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  res.json({
    success: true,
    data: {
      ...user,
      id: user._id,
      _id: user._id,
      canCreateService:
        user.role === "provider" &&
        user.isApproved === true &&
        user.accountStatus === "active"
    }
  });
});

exports.updateCurrentUser = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  const allowed = ["name", "phone", "providerAddress", "profilePhoto", "role"];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] === undefined) continue;
    let value = req.body[key];
    if (key === "name" && typeof value === "string" && value.trim() === "") continue;
    if (key === "role" && !["user", "provider"].includes(value)) continue;
    updates[key] = typeof value === "string" ? value.trim() : value;
  }
  if (Object.keys(updates).length === 0) {
    const user = await User.findById(String(userId)).select("-password").lean();
    return res.json({ success: true, data: user ? { ...user, id: user._id } : {} });
  }
  const user = await User.findByIdAndUpdate(
    String(userId),
    { $set: updates },
    { new: true, runValidators: true }
  )
    .select("-password")
    .lean();
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  res.json({ success: true, data: { ...user, id: user._id } });
});

exports.getProviderById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== "string" || id.trim() === "") {
    const error = new Error("Provider not found");
    error.statusCode = 404;
    throw error;
  }
  const provider = await User.findOne({ _id: id.trim(), role: "provider" }).select("-password").lean();
  if (!provider) {
    const error = new Error("Provider not found");
    error.statusCode = 404;
    throw error;
  }
  res.json({
    success: true,
    data: { ...provider, id: provider._id, _id: provider._id }
  });
});
