const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { getUserById } = require("../controllers/userLookupController");

const router = express.Router();

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

    const newUser = new User({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      phone: normalizedPhone,
      providerAddress: role === "provider" ? resolvedProviderAddress : "Not provided"
    });

    await newUser.save();

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
    res.status(500).json({ message: error.message });
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

    const user = await User.findOne({ email: normalizedEmail });
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
      token
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/users/:id", getUserById);

module.exports = router;
