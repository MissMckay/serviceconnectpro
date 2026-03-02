const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");


exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone, providerAddress } = req.body;

  const user = await User.create({
    name,
    email,
    password,
    role,
    phone: phone || "Not provided",
    providerAddress: role === "provider" ? (providerAddress || "Not provided") : "Not provided",
  });

  res.status(201).json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      providerAddress: user.providerAddress
    }
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({
    message: "Login successful",
    token,
    user: {
      id: user._id,
      role: user.role,
      name: user.name,
      email: user.email,
      phone: user.phone,
      providerAddress: user.providerAddress,
      accountStatus: user.accountStatus,
      isApproved: user.isApproved,
      approvalStatus: user.approvalStatus
    }
  });
});
