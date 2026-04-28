const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const AdminInviteCode = require("../models/AdminInviteCode");
const { getUserById } = require("../controllers/userLookupController");
const connectDB = require("../config/db");

const router = express.Router();
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const LOGIN_OTP_TTL_MS = 10 * 60 * 1000;

const getFrontendBaseUrl = (req) => {
  const configuredBase =
    process.env.FRONTEND_URL ||
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_APP_URL ||
    "";

  if (configuredBase.trim()) {
    return configuredBase.trim().replace(/\/$/, "");
  }

  const originHeader = typeof req.get === "function" ? req.get("origin") : "";
  if (originHeader && /^https?:\/\//i.test(originHeader)) {
    return originHeader.replace(/\/$/, "");
  }

  return "http://localhost:5173";
};

const buildPasswordResetUrl = (req, token) =>
  `${getFrontendBaseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;

const createPasswordResetToken = () => crypto.randomBytes(32).toString("hex");
const createLoginOtpCode = () => String(crypto.randomInt(100000, 1000000));
const normalizeEmail = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");
const normalizePhone = (value) =>
  typeof value === "string"
    ? value.replace(/[^\d+]/g, "").trim()
    : "";

const buildUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  providerAddress: user.providerAddress,
  accountStatus: user.accountStatus,
  isApproved: user.isApproved,
  approvalStatus: user.approvalStatus,
  profilePhoto: user.profilePhoto,
});

const signUserToken = (user) => {
  if (!process.env.JWT_SECRET) {
    const error = new Error("Server auth configuration error");
    error.statusCode = 500;
    throw error;
  }

  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

const findUserByIdentifier = async (identifier, select = "name email password role phone providerAddress accountStatus isApproved approvalStatus profilePhoto loginOtpCode loginOtpExpiresAt") => {
  const normalizedIdentifier = typeof identifier === "string" ? identifier.trim() : "";
  const normalizedEmail = normalizeEmail(normalizedIdentifier);
  const normalizedPhone = normalizePhone(normalizedIdentifier);

  if (!normalizedIdentifier) return null;

  return User.findOne({
    $or: [
      ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
      ...(normalizedPhone ? [{ phone: normalizedPhone }, { phone: normalizedIdentifier }] : []),
    ],
  })
    .select(select)
    .maxTimeMS(4000);
};

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
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);
    const resolvedProviderAddress = typeof providerAddress === "string" && providerAddress.trim().length
      ? providerAddress.trim()
      : (typeof address === "string" && address.trim().length ? address.trim() : "Not provided");

    if (!name || !normalizedEmail || !password || !normalizedPhone) {
      return res.status(400).json({ message: "name, email, phone and password are required" });
    }

    // Public signup is limited to user/provider. Admin must be assigned by an existing admin.
    const allowedRoles = new Set(["user", "provider"]);
    if (role && !allowedRoles.has(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
    });
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

    const token = signUserToken(newUser);

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: buildUserResponse(newUser)
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
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone) || "Not provided";

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ message: "name, email and password are required" });
    }

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, ...(normalizedPhone !== "Not provided" ? [{ phone: normalizedPhone }] : [])],
    });
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

    const token = signUserToken(newUser);

    res.status(201).json({
      message: "Admin account created successfully",
      token,
      user: buildUserResponse(newUser),
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
    const { email, identifier, phone, password } = req.body;
    const loginIdentifier =
      typeof identifier === "string" && identifier.trim()
        ? identifier.trim()
        : typeof email === "string" && email.trim()
          ? email.trim()
          : typeof phone === "string" && phone.trim()
            ? phone.trim()
            : "";

    if (!loginIdentifier || typeof password !== "string" || !password.length) {
      return res.status(400).json({ message: "Phone number or email and password are required" });
    }

    const user = await findUserByIdentifier(
      loginIdentifier,
      "name email password role phone providerAddress accountStatus isApproved approvalStatus profilePhoto"
    );
    if (!user) {
      return res.status(400).json({ message: "Invalid phone number, email, or password" });
    }
    if (user.accountStatus === "suspended") {
      return res.status(403).json({ message: "Account is suspended. Contact admin." });
    }

    if (typeof user.password !== "string" || !user.password.length) {
      return res.status(400).json({ message: "Invalid phone number, email, or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid phone number, email, or password" });
    }

    const token = signUserToken(user);

    res.json({
      message: "Login successful",
      token,
      user: buildUserResponse(user)
    });

  } catch (error) {
    handleRouteError(res, error);
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const normalizedEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: normalizedEmail })
      .select("_id email accountStatus")
      .maxTimeMS(4000);

    if (!user || user.accountStatus === "suspended") {
      return res.json({
        message: "If this email exists, a password reset link has been generated.",
      });
    }

    const resetToken = createPasswordResetToken();
    user.passwordResetToken = await bcrypt.hash(resetToken, 10);
    user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await user.save();

    const resetUrl = buildPasswordResetUrl(req, resetToken);

    return res.json({
      message: "If this email exists, a password reset link has been generated.",
      resetUrl,
      expiresInMinutes: Math.round(PASSWORD_RESET_TTL_MS / 60000),
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.post("/request-login-otp", async (req, res) => {
  try {
    const { identifier, email, phone } = req.body;
    const loginIdentifier =
      typeof identifier === "string" && identifier.trim()
        ? identifier.trim()
        : typeof email === "string" && email.trim()
          ? email.trim()
          : typeof phone === "string" && phone.trim()
            ? phone.trim()
            : "";

    if (!loginIdentifier) {
      return res.status(400).json({ message: "Phone number or email is required" });
    }

    const user = await findUserByIdentifier(loginIdentifier, "_id name email phone accountStatus");
    if (!user || user.accountStatus === "suspended") {
      return res.json({
        message: "If the account exists, a login code has been generated.",
      });
    }

    const otpCode = createLoginOtpCode();
    user.loginOtpCode = await bcrypt.hash(otpCode, 10);
    user.loginOtpExpiresAt = new Date(Date.now() + LOGIN_OTP_TTL_MS);
    await user.save();

    return res.json({
      message: "A login code has been generated.",
      otpCode,
      expiresInMinutes: Math.round(LOGIN_OTP_TTL_MS / 60000),
      delivery: user.phone && user.phone !== "Not provided" ? "phone" : "email",
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.post("/verify-login-otp", async (req, res) => {
  try {
    const { identifier, email, phone, otp } = req.body;
    const loginIdentifier =
      typeof identifier === "string" && identifier.trim()
        ? identifier.trim()
        : typeof email === "string" && email.trim()
          ? email.trim()
          : typeof phone === "string" && phone.trim()
            ? phone.trim()
            : "";
    const normalizedOtp = typeof otp === "string" ? otp.trim() : "";

    if (!loginIdentifier || !normalizedOtp) {
      return res.status(400).json({ message: "Phone number or email and code are required" });
    }

    const user = await findUserByIdentifier(
      loginIdentifier,
      "name email role phone providerAddress accountStatus isApproved approvalStatus profilePhoto loginOtpCode loginOtpExpiresAt"
    );

    if (!user || user.accountStatus === "suspended" || !user.loginOtpCode || !user.loginOtpExpiresAt) {
      return res.status(400).json({ message: "Code is invalid or has expired" });
    }

    if (new Date(user.loginOtpExpiresAt).getTime() < Date.now()) {
      user.loginOtpCode = "";
      user.loginOtpExpiresAt = null;
      await user.save();
      return res.status(400).json({ message: "Code is invalid or has expired" });
    }

    const isMatch = await bcrypt.compare(normalizedOtp, user.loginOtpCode);
    if (!isMatch) {
      return res.status(400).json({ message: "Code is invalid or has expired" });
    }

    user.loginOtpCode = "";
    user.loginOtpExpiresAt = null;
    await user.save();

    const token = signUserToken(user);

    return res.json({
      message: "Login successful",
      token,
      user: buildUserResponse(user),
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!token || !password) {
      return res.status(400).json({ message: "Reset token and new password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    const candidateUsers = await User.find({
      passwordResetToken: { $ne: "" },
      passwordResetExpiresAt: { $gt: new Date() },
    })
      .select("_id password passwordResetToken passwordResetExpiresAt")
      .maxTimeMS(4000);

    let matchedUser = null;
    for (const candidate of candidateUsers) {
      const isMatch = await bcrypt.compare(token, candidate.passwordResetToken || "");
      if (isMatch) {
        matchedUser = candidate;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(400).json({ message: "Reset link is invalid or has expired" });
    }

    matchedUser.password = await bcrypt.hash(password, 10);
    matchedUser.passwordResetToken = "";
    matchedUser.passwordResetExpiresAt = null;
    await matchedUser.save();

    return res.json({ message: "Password reset successful. Please log in with your new password." });
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.get("/users/:id", getUserById);

module.exports = router;
