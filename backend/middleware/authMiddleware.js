const jwt = require("jsonwebtoken");
const User = require("../models/User");

const VALID_ROLES = new Set(["user", "provider", "admin"]);

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
    if (!role || !VALID_ROLES.has(role)) {
      const user = await User.findById(normalizedId).select("role");
      if (!user) return res.status(401).json({ message: "Invalid token user" });
      role = user.role;
    }
    if (!VALID_ROLES.has(role)) {
      return res.status(403).json({ message: "Access denied. Invalid role." });
    }
    req.user = { ...decoded, id: String(normalizedId), role };
    next();
  } catch (e) {
    res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = verifyJwt;
