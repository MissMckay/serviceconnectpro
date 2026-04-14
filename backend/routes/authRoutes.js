const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const AdminInviteCode = require("../models/AdminInviteCode");
const { getUserById } = require("../controllers/userLookupController");
const connectDB = require("../config/db");

const router = express.Router();

const handleRouteError = (res, error) => {
  if (connectDB.isMongoConnectionError(error)) {
    if (!connectDB.isConnected()) {
      connectDB.scheduleReconnect("auth-route-error");
    }
    return res.status(503).json({ message: "Database temporarily unavailable. Please try again." });
  }

  return res.status(500).json({ message: error.message });
};

/* ==============================
   REGISTER API
============================== */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, phone, providerAddress, address } = req.body;
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedPhone = typeof phone === "string" && phone.trim().length ? phone.trim() : "Not provided";
    const resolvedProviderAddress = typeof providerAddress === "string" && providerAddress.trim().length
      ? providerAddress.trim()
      : (typeof address === "string" && address.trim().length ? address.trim() : "Not provided");

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ message: "name, email and password are required" });
    }

    // Public signup is limited to user/provider. Admin must be assigned by an existing admin.
    const allowedRoles = new Set(["user", "provider"]);
    if (role && !allowedRoles.has(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const stringId = new mongoose.Types.ObjectId().toString();

    const newUser = new User({
      _id: stringId,
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      phone: normalizedPhone,
      providerAddress: role === "provider" ? resolvedProviderAddress : "Not provided"
    });

    await newUser.save();
    console.log("[Auth] User registered in MongoDB:", normalizedEmail, "role:", newUser.role, "id:", newUser._id);

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server auth configuration error" });
    }

    const token = jwt.sign(
      {
        id: newUser._id,
        role: newUser.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        phone: newUser.phone,
        providerAddress: newUser.providerAddress
      }
    });

  } catch (error) {
    handleRouteError(res, error);
  }
});

/* ==============================
   REGISTER ADMIN (public self-registration)
============================== */
router.post("/register-admin", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedPhone = typeof phone === "string" && phone.trim().length ? phone.trim() : "Not provided";

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ message: "name, email and password are required" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const stringId = new mongoose.Types.ObjectId().toString();

    const newUser = new User({
      _id: stringId,
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: "admin",
      phone: normalizedPhone,
      providerAddress: "Not provided",
    });

    await newUser.save();
    console.log("[Auth] Admin registered in MongoDB:", normalizedEmail, "id:", newUser._id);

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server auth configuration error" });
    }

    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({
      message: "Admin account created successfully",
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        phone: newUser.phone,
        providerAddress: newUser.providerAddress,
      },
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

/* ==============================
   LOGIN API + JWT
============================== */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail || typeof password !== "string" || !password.length) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: normalizedEmail })
      .read("secondaryPreferred")
      .maxTimeMS(2500);
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    if (user.accountStatus === "suspended") {
      return res.status(403).json({ message: "Account is suspended. Contact admin." });
    }

    if (typeof user.password !== "string" || !user.password.length) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server auth configuration error" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        providerAddress: user.providerAddress,
        accountStatus: user.accountStatus,
        isApproved: user.isApproved,
        approvalStatus: user.approvalStatus,
        profilePhoto: user.profilePhoto
      }
    });

  } catch (error) {
    handleRouteError(res, error);
  }
});

router.get("/users/:id", getUserById);

module.exports = router;
