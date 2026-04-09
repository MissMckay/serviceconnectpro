const jwt = require("jsonwebtoken");
const User = require("../models/User");
const connectDB = require("../config/db");

const VALID_ROLES = new Set(["user", "provider", "admin"]);
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;
const roleCache = new Map();

const getCachedRole = (userId) => {
  const cached = roleCache.get(String(userId || ""));
  if (!cached) return "";
  if (cached.expiresAt <= Date.now()) {
    roleCache.delete(String(userId || ""));
    return "";
  }
  return cached.role;
};

const setCachedRole = (userId, role) => {
  if (!userId || !VALID_ROLES.has(role)) return;
  roleCache.set(String(userId), {
    role,
    expiresAt: Date.now() + ROLE_CACHE_TTL_MS,
  });
};

async function verifyJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Access denied. Invalid authorization header." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const normalizedId = decoded.id || decoded.userId || decoded._id;
    if (!normalizedId) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    let role = decoded.role;
    if (!VALID_ROLES.has(role)) {
      role = getCachedRole(normalizedId);
    }
    if (!VALID_ROLES.has(role)) {
      try {
        const user = await User.findById(normalizedId)
          .select("role")
          .maxTimeMS(1200)
          .lean();
        if (!user) return res.status(401).json({ message: "Invalid token user" });
        role = user.role;
        setCachedRole(normalizedId, role);
      } catch (error) {
        if (connectDB.isMongoConnectionError(error)) {
          connectDB.scheduleReconnect("verifyJwt-role-lookup");
          return res.status(503).json({ message: "Database temporarily unavailable. Please try again." });
        }
        throw error;
      }
    }
    if (!VALID_ROLES.has(role)) {
      return res.status(403).json({ message: "Access denied. Invalid role." });
    }
    setCachedRole(normalizedId, role);
    req.user = { ...decoded, id: String(normalizedId), role };
    next();
  } catch (e) {
    if (connectDB.isMongoConnectionError(e)) {
      connectDB.scheduleReconnect("verifyJwt");
      return res.status(503).json({ message: "Database temporarily unavailable. Please try again." });
    }
    res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = verifyJwt;
