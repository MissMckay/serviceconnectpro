const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const connectDB = require("../config/db");

const PROFILE_PHOTO_MAX_BYTES = 180 * 1024;
const USER_CACHE_TTL_MS = 30000;
const USER_CACHE_STALE_TTL_MS = 5 * 60 * 1000;
const USER_QUERY_TIMEOUT_MS = 2500;
const USER_REFRESH_TIMEOUT_MS = 900;

const userCache = new Map();
const userRefreshPromises = new Map();

const getStringByteLength = (value) => Buffer.byteLength(String(value || ""), "utf8");

const withTimeout = (promise, timeoutMs, message) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const error = new Error(message);
      error.code = "USER_QUERY_TIMEOUT";
      reject(error);
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

const buildMeta = ({ degraded = false, reason = null, message = null, cache = "none", debug = null } = {}) => ({
  degraded,
  reason,
  message,
  cache,
  ...(debug ? { debug } : {}),
});

const getCacheEntry = (cacheKey) => {
  const cached = userCache.get(cacheKey);
  if (!cached) return null;
  if (cached.staleUntil <= Date.now()) {
    userCache.delete(cacheKey);
    return null;
  }
  return cached;
};

const setCacheEntry = (cacheKey, payload) => {
  userCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + USER_CACHE_TTL_MS,
    staleUntil: Date.now() + USER_CACHE_STALE_TTL_MS,
  });
};

const clearUserCache = (userId) => {
  if (!userId) return;
  userCache.delete(`user:${String(userId)}`);
  userCache.delete(`current:${String(userId)}`);
};

const fetchUserById = (userId, timeoutMs = USER_QUERY_TIMEOUT_MS) =>
  withTimeout(
    User.findById(String(userId))
      .select("-password")
      .lean(),
    timeoutMs,
    `User query exceeded ${timeoutMs}ms`
  );

const refreshUserCache = (cacheKey, userId, cachedPayload) => {
  if (userRefreshPromises.has(cacheKey)) {
    return userRefreshPromises.get(cacheKey);
  }

  const refreshPromise = fetchUserById(userId, USER_REFRESH_TIMEOUT_MS)
    .then((user) => {
      if (user) setCacheEntry(cacheKey, user);
      return user;
    })
    .catch((error) => {
      if (connectDB.isMongoConnectionError(error) || error?.code === "USER_QUERY_TIMEOUT") {
        connectDB.scheduleReconnect("userLookup-refresh-failed");
      }
      return cachedPayload;
    })
    .finally(() => {
      userRefreshPromises.delete(cacheKey);
    });

  userRefreshPromises.set(cacheKey, refreshPromise);
  return refreshPromise;
};

exports.getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== "string" || id.trim() === "") {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const userId = id.trim();
  const cacheKey = `user:${userId}`;
  const cached = getCacheEntry(cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    return res.json({
      success: true,
      data: { ...cached.payload, id: cached.payload._id, _id: cached.payload._id },
      meta: buildMeta({ cache: "fresh" }),
    });
  }

  if (cached?.payload) {
    void refreshUserCache(cacheKey, userId, cached.payload);
    return res.json({
      success: true,
      data: { ...cached.payload, id: cached.payload._id, _id: cached.payload._id },
      meta: buildMeta({ cache: "stale" }),
    });
  }

  try {
    const user = await fetchUserById(userId);
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    setCacheEntry(cacheKey, user);
    return res.json({
      success: true,
      data: { ...user, id: user._id, _id: user._id },
      meta: buildMeta({ cache: "refresh" }),
    });
  } catch (error) {
    if (connectDB.isMongoConnectionError(error) || error?.code === "USER_QUERY_TIMEOUT") {
      connectDB.scheduleReconnect("getUserById-query-failed");
      return res.status(200).json({
        success: true,
        data: cached?.payload ? { ...cached.payload, id: cached.payload._id, _id: cached.payload._id } : null,
        meta: buildMeta({
          degraded: true,
          reason: "database_query_failed",
          message: "User profile is temporarily loading from fallback data.",
          cache: cached?.payload ? "stale" : "none",
          debug: {
            name: error?.name || "Error",
            code: error?.code || null,
            message: error?.message || "Unknown user lookup failure",
          },
        }),
      });
    }
    throw error;
  }
});

exports.getCurrentUser = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const cacheKey = `current:${String(userId)}`;
  const cached = getCacheEntry(cacheKey);
  const formatCurrentUser = (user) => ({
    ...user,
    id: user._id,
    _id: user._id,
    canCreateService:
      user.role === "provider" &&
      user.isApproved === true &&
      user.accountStatus === "active"
  });

  if (cached && Date.now() < cached.expiresAt) {
    return res.json({
      success: true,
      data: formatCurrentUser(cached.payload),
      meta: buildMeta({ cache: "fresh" }),
    });
  }

  if (cached?.payload) {
    void refreshUserCache(cacheKey, userId, cached.payload);
    return res.json({
      success: true,
      data: formatCurrentUser(cached.payload),
      meta: buildMeta({ cache: "stale" }),
    });
  }

  try {
    const user = await fetchUserById(userId);
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    setCacheEntry(cacheKey, user);
    return res.json({
      success: true,
      data: formatCurrentUser(user),
      meta: buildMeta({ cache: "refresh" }),
    });
  } catch (error) {
    if (connectDB.isMongoConnectionError(error) || error?.code === "USER_QUERY_TIMEOUT") {
      connectDB.scheduleReconnect("getCurrentUser-query-failed");
      return res.status(200).json({
        success: true,
        data: cached?.payload ? formatCurrentUser(cached.payload) : null,
        meta: buildMeta({
          degraded: true,
          reason: "database_query_failed",
          message: "Your profile is temporarily loading from fallback data.",
          cache: cached?.payload ? "stale" : "none",
          debug: {
            name: error?.name || "Error",
            code: error?.code || null,
            message: error?.message || "Unknown current user failure",
          },
        }),
      });
    }
    throw error;
  }
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

  if (
    typeof updates.profilePhoto === "string" &&
    updates.profilePhoto.startsWith("data:") &&
    getStringByteLength(updates.profilePhoto) > PROFILE_PHOTO_MAX_BYTES
  ) {
    const error = new Error("Profile photo is too large. Please upload a smaller image.");
    error.statusCode = 413;
    throw error;
  }

  if (Object.keys(updates).length === 0) {
    const cached = getCacheEntry(`current:${String(userId)}`);
    if (cached?.payload) {
      return res.json({ success: true, data: { ...cached.payload, id: cached.payload._id } });
    }

    const user = await fetchUserById(userId);
    return res.json({ success: true, data: user ? { ...user, id: user._id } : {} });
  }

  let user;

  try {
    user = await User.findByIdAndUpdate(
      String(userId),
      { $set: updates },
      { new: true, runValidators: true }
    )
      .select("-password")
      .lean();
  } catch (error) {
    if (!connectDB.isMongoConnectionError(error)) {
      throw error;
    }

    await connectDB.forceReconnect("updateCurrentUser");

    user = await User.findByIdAndUpdate(
      String(userId),
      { $set: updates },
      { new: true, runValidators: true }
    )
      .select("-password")
      .lean();
  }

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  clearUserCache(userId);
  setCacheEntry(`user:${String(userId)}`, user);
  setCacheEntry(`current:${String(userId)}`, user);

  res.json({ success: true, data: { ...user, id: user._id } });
});

exports.getProviderById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== "string" || id.trim() === "") {
    const error = new Error("Provider not found");
    error.statusCode = 404;
    throw error;
  }

  const provider = await fetchUserById(id.trim());
  if (!provider || provider.role !== "provider") {
    const error = new Error("Provider not found");
    error.statusCode = 404;
    throw error;
  }

  res.json({
    success: true,
    data: { ...provider, id: provider._id, _id: provider._id }
  });
});
