const mongoose = require("mongoose");
const Service = require("../models/Service");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const connectDB = require("../config/db");

const getIntEnv = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseMaybeJson = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      return value;
    }
  }
  return value;
};

const IMAGE_FIELD_NAMES = [
  "images",
  "image",
  "imageUrl",
  "imageUrls",
  "photo",
  "photos",
  "photoUrls",
  "serviceImages"
];
const MAX_SERVICE_IMAGES = 7;
const MAX_SERVICE_IMAGE_BYTES = 550 * 1024;
const MAX_THUMBNAIL_BYTES = 180 * 1024;
const MAX_PROVIDER_AVATAR_BYTES = 80 * 1024;

const isImageObject = (value) =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      ("imageUrl" in value || "url" in value || "caption" in value)
  );

const objectValuesInOrder = (value) => {
  const keys = Object.keys(value);
  const numericKeys = keys.filter((key) => /^\d+$/.test(key));

  if (numericKeys.length === keys.length) {
    return numericKeys
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key]);
  }

  return Object.values(value);
};

const getImagesFromBody = (body = {}) => {
  const candidates = IMAGE_FIELD_NAMES
    .filter((fieldName) => Object.prototype.hasOwnProperty.call(body, fieldName))
    .map((fieldName) => parseMaybeJson(body[fieldName]))
    .filter((value) => value !== undefined && value !== null);

  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  return candidates;
};

const isMultipartRequest = (req) =>
  typeof req.headers?.["content-type"] === "string" &&
  req.headers["content-type"].toLowerCase().includes("multipart/form-data");

const normalizeServiceImages = (imagesInput) => {
  if (imagesInput === undefined) return undefined;

  const parsedImages = parseMaybeJson(imagesInput);
  const rawImages = Array.isArray(parsedImages)
    ? parsedImages
    : (parsedImages && typeof parsedImages === "object" && !isImageObject(parsedImages))
      ? objectValuesInOrder(parsedImages)
      : [parsedImages];

  return rawImages
    .map((item) => {
      const parsedItem = parseMaybeJson(item);

      if (Array.isArray(parsedItem)) {
        return normalizeServiceImages(parsedItem);
      }

      const normalizedItem = parsedItem && typeof parsedItem === "object" ? parsedItem : item;

      if (typeof normalizedItem === "string") {
        return { imageUrl: normalizedItem.trim(), thumbnailUrl: "", caption: "" };
      }

      if (normalizedItem && typeof normalizedItem === "object") {
        const imageUrl = (normalizedItem.imageUrl || normalizedItem.url || "").toString().trim();
        const thumbnailUrl = (normalizedItem.thumbnailUrl || normalizedItem.thumbUrl || "").toString().trim();
        const caption = typeof normalizedItem.caption === "string" ? normalizedItem.caption : "";
        return imageUrl ? { imageUrl, thumbnailUrl, caption } : null;
      }

      return null;
    })
    .flat()
    .filter(Boolean);
};

const getStringByteLength = (value) => Buffer.byteLength(String(value || ""), "utf8");

const sanitizeThumbnailUrl = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:") && getStringByteLength(trimmed) > MAX_THUMBNAIL_BYTES) {
    return "";
  }
  return trimmed;
};

const sanitizeProviderAvatarUrl = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:") && getStringByteLength(trimmed) > MAX_PROVIDER_AVATAR_BYTES) {
    return "";
  }
  return trimmed;
};

const hydrateProviderAvatars = async (services = [], timeoutMs = 600) => {
  const providerIds = [
    ...new Set(
      services
        .map((service) => String(service?.providerId || "").trim())
        .filter((providerId) => providerId && mongoose.Types.ObjectId.isValid(providerId))
    ),
  ];

  if (!providerIds.length) {
    return services.map((service) => ({
      ...service,
      providerProfilePhoto: sanitizeProviderAvatarUrl(service?.providerProfilePhoto),
    }));
  }

  try {
    const providers = await withTimeout(
      User.find({ _id: { $in: providerIds } })
        .select("_id profilePhoto")
        .maxTimeMS(Math.max(250, timeoutMs))
        .lean(),
      timeoutMs,
      `Provider avatar lookup exceeded ${timeoutMs}ms`
    );
    const avatarByProviderId = new Map(
      providers.map((provider) => [
        String(provider._id),
        sanitizeProviderAvatarUrl(provider.profilePhoto),
      ])
    );

    return services.map((service) => ({
      ...service,
      providerProfilePhoto:
        sanitizeProviderAvatarUrl(service?.providerProfilePhoto) ||
        avatarByProviderId.get(String(service?.providerId || "")) ||
        "",
    }));
  } catch (_) {
    return services.map((service) => ({
      ...service,
      providerProfilePhoto: sanitizeProviderAvatarUrl(service?.providerProfilePhoto),
    }));
  }
};

const normalizeServiceCardPayload = async (services = [], timeoutMs = 600) =>
  hydrateProviderAvatars(
    services.map((service) => ({
      ...service,
      thumbnailUrl: sanitizeThumbnailUrl(service?.thumbnailUrl),
      providerProfilePhoto: sanitizeProviderAvatarUrl(service?.providerProfilePhoto),
    })),
    timeoutMs
  );

const validateNormalizedImages = (images = []) => {
  images.forEach((image, index) => {
    const imageUrl = typeof image?.imageUrl === "string" ? image.imageUrl.trim() : "";
    const thumbnailUrl = typeof image?.thumbnailUrl === "string" ? image.thumbnailUrl.trim() : "";

    if (!imageUrl) return;

    if (imageUrl.startsWith("data:") && getStringByteLength(imageUrl) > MAX_SERVICE_IMAGE_BYTES) {
      const error = new Error(`Service image ${index + 1} is too large. Please upload a smaller image.`);
      error.statusCode = 413;
      throw error;
    }

    if (thumbnailUrl.startsWith("data:") && getStringByteLength(thumbnailUrl) > MAX_THUMBNAIL_BYTES) {
      const error = new Error(`Service thumbnail ${index + 1} is too large. Please upload a smaller image.`);
      error.statusCode = 413;
      throw error;
    }
  });
};

exports.createService = asyncHandler(async (req, res) => {
  const { serviceName, category, description, price, availabilityStatus, providerName, providerAddress } = req.body;
  if (String(req.user?.role || "").toLowerCase() !== "provider") {
    const error = new Error("Only providers can create services");
    error.statusCode = 403;
    throw error;
  }

  if (!serviceName || !category || !description || price === undefined) {
    const error = new Error("serviceName, category, description and price are required");
    error.statusCode = 400;
    throw error;
  }

  if (Number(price) <= 0) {
    const error = new Error("price must be a positive number");
    error.statusCode = 400;
    throw error;
  }

  const normalizedImages = normalizeServiceImages(getImagesFromBody(req.body)) || [];
  if (isMultipartRequest(req) && normalizedImages.length === 0) {
    const error = new Error("Multipart file upload is not supported on this endpoint. Send image URLs in the body.");
    error.statusCode = 400;
    throw error;
  }
  if (normalizedImages.length > MAX_SERVICE_IMAGES) {
    const error = new Error(`Maximum ${MAX_SERVICE_IMAGES} images are allowed`);
    error.statusCode = 400;
    throw error;
  }
  validateNormalizedImages(normalizedImages);

  const servicePayload = {
    serviceName,
    category,
    description,
    price: Number(price),
      availabilityStatus: ["Available", "Unavailable"].includes(availabilityStatus)
      ? availabilityStatus
      : "Available",
    images: normalizedImages,
    thumbnailUrl: Array.isArray(normalizedImages)
      ? sanitizeThumbnailUrl(normalizedImages[0]?.thumbnailUrl) || ""
      : "",
    providerId: String(req.user.id),
    providerName: typeof providerName === "string" ? providerName.trim() : "",
    providerAddress: typeof providerAddress === "string" ? providerAddress.trim() : "",
  };

  let service;
  try {
    service = await Service.create(servicePayload);
  } catch (error) {
    if (!connectDB.isMongoConnectionError(error)) {
      throw error;
    }
    await connectDB.ensureConnected();
    service = await Service.create(servicePayload);
  }

  clearServicesListCache();

  res.status(201).json({
    success: true,
    data: service
  });
});

// In-memory cache for services list to make repeat loads / retries instant (TTL 5s)
const listCache = new Map();
const listRefreshPromises = new Map();
const serviceDetailCache = new Map();
const serviceDetailRefreshPromises = new Map();
const LIST_CACHE_TTL_MS = getIntEnv("SERVICES_LIST_CACHE_TTL_MS", 5000);
const LIST_CACHE_STALE_TTL_MS = getIntEnv("SERVICES_LIST_CACHE_STALE_TTL_MS", 60000);
const SERVICES_QUERY_TIMEOUT_MS = getIntEnv("SERVICES_QUERY_TIMEOUT_MS", 6000);
const SERVICES_REFRESH_TIMEOUT_MS = getIntEnv("SERVICES_REFRESH_TIMEOUT_MS", 1500);
const MONGO_CONNECTED_STATE = 1;

const getCacheKey = (page, limit, category, minPrice, maxPrice, location = "", providerId = "") =>
  `${page}|${limit}|${category}|${minPrice}|${maxPrice}|${location}|${providerId}`;

const buildServicesMeta = ({
  degraded = false,
  reason = null,
  message = null,
  readyState = mongoose.connection.readyState,
  cache = "none",
  debug = null,
} = {}) => ({
  degraded,
  reason,
  message,
  cache,
  ...(debug ? { debug } : {}),
  database: {
    readyState,
    connected: readyState === MONGO_CONNECTED_STATE,
  },
});

const attachMeta = (payload, meta) => ({
  ...payload,
  meta,
});

const clearServicesListCache = () => {
  listCache.clear();
  listRefreshPromises.clear();
  serviceDetailCache.clear();
  serviceDetailRefreshPromises.clear();
};

const archiveServicesByProvider = async (providerId, removedBy = null) => {
  const normalizedProviderId = String(providerId || "").trim();
  if (!normalizedProviderId) return 0;

  const result = await Service.updateMany(
    {
      providerId: normalizedProviderId,
      moderationStatus: { $ne: "removed" },
    },
    {
      $set: {
        availabilityStatus: "Unavailable",
        moderationStatus: "removed",
        removedAt: new Date(),
        removedBy: removedBy ? String(removedBy) : null,
      },
    }
  );

  clearServicesListCache();
  return Number(result?.modifiedCount || result?.nModified || 0);
};

const getMissingProviderIds = async (services = [], timeoutMs = 600) => {
  const providerIds = [
    ...new Set(
      services
        .map((service) => String(service?.providerId || "").trim())
        .filter((providerId) => providerId && mongoose.Types.ObjectId.isValid(providerId))
    ),
  ];

  if (!providerIds.length) {
    return [];
  }

  try {
    const providers = await withTimeout(
      User.find({ _id: { $in: providerIds } })
        .select("_id")
        .maxTimeMS(Math.max(250, timeoutMs))
        .lean(),
      timeoutMs,
      `Provider existence lookup exceeded ${timeoutMs}ms`
    );

    const existingProviderIds = new Set(providers.map((provider) => String(provider._id)));
    return providerIds.filter((providerId) => !existingProviderIds.has(providerId));
  } catch (_) {
    return [];
  }
};

const archiveServicesByProviders = async (providerIds = [], removedBy = null) => {
  const uniqueProviderIds = [...new Set(providerIds.map((providerId) => String(providerId || "").trim()).filter(Boolean))];
  if (!uniqueProviderIds.length) return 0;

  const result = await Service.updateMany(
    {
      providerId: { $in: uniqueProviderIds },
      moderationStatus: { $ne: "removed" },
    },
    {
      $set: {
        availabilityStatus: "Unavailable",
        moderationStatus: "removed",
        removedAt: new Date(),
        removedBy: removedBy ? String(removedBy) : null,
      },
    }
  );

  clearServicesListCache();
  return Number(result?.modifiedCount || result?.nModified || 0);
};

const getCacheEntry = (cacheKey) => {
  const cached = listCache.get(cacheKey);
  if (!cached) return null;

  if (cached.staleUntil <= Date.now()) {
    listCache.delete(cacheKey);
    return null;
  }

  return cached;
};

const setCacheEntry = (cacheKey, payload) => {
  listCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + LIST_CACHE_TTL_MS,
    staleUntil: Date.now() + LIST_CACHE_STALE_TTL_MS,
  });

  if (listCache.size > 50) {
    const firstKey = listCache.keys().next().value;
    if (firstKey !== undefined) listCache.delete(firstKey);
  }
};

const getServiceDetailCacheKey = (serviceId) => `detail:${String(serviceId || "")}`;

const getServiceDetailCacheEntry = (serviceId) => {
  const cached = serviceDetailCache.get(getServiceDetailCacheKey(serviceId));
  if (!cached) return null;

  if (cached.staleUntil <= Date.now()) {
    serviceDetailCache.delete(getServiceDetailCacheKey(serviceId));
    return null;
  }

  return cached;
};

const setServiceDetailCacheEntry = (serviceId, payload) => {
  serviceDetailCache.set(getServiceDetailCacheKey(serviceId), {
    payload,
    expiresAt: Date.now() + LIST_CACHE_TTL_MS,
    staleUntil: Date.now() + LIST_CACHE_STALE_TTL_MS,
  });
};

const withTimeout = (promise, timeoutMs, message) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const error = new Error(message);
      error.code = "SERVICES_QUERY_TIMEOUT";
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

const getFallbackServicesPayload = (page, limit, cachedPayload, meta) => {
  if (cachedPayload) {
    return attachMeta(cachedPayload, meta);
  }

  return {
    success: true,
    data: [],
    pagination: {
      page,
      limit,
      total: 0,
      totalPages: 1,
      hasNextPage: false
    },
    meta,
  };
};

const applyServiceUpdates = (service, body = {}) => {
  const allowedFields = ["serviceName", "category", "description", "price", "availabilityStatus", "providerName", "providerAddress"];

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      if (field === "price") {
        service.price = Number(body.price);
      } else {
        service[field] = body[field];
      }
    }
  });

  if (IMAGE_FIELD_NAMES.some((fieldName) => Object.prototype.hasOwnProperty.call(body, fieldName))) {
    const normalizedImages = normalizeServiceImages(getImagesFromBody(body)) || [];
    validateNormalizedImages(normalizedImages);
    service.images = normalizedImages;
    service.thumbnailUrl = Array.isArray(normalizedImages)
      ? sanitizeThumbnailUrl(normalizedImages[0]?.thumbnailUrl) || ""
      : "";
  }
};

const fetchServicesPage = async ({
  page,
  limit,
  skip,
  category,
  minPrice,
  maxPrice,
  location,
  providerId,
  timeoutMs = SERVICES_QUERY_TIMEOUT_MS,
}) => {
  const filter = { moderationStatus: { $ne: "removed" } };
  if (category && category !== "All") filter.category = category;
  if (Number.isFinite(minPrice) && minPrice >= 0) filter.price = { ...(filter.price || {}), $gte: minPrice };
  if (Number.isFinite(maxPrice) && maxPrice >= 0) filter.price = { ...(filter.price || {}), $lte: maxPrice };
  if (location) filter.providerAddress = { $regex: location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  if (providerId) filter.providerId = providerId;

  const fetchLimit = limit + 1;
  const rawServices = await withTimeout(
    Service.find(filter)
      .select("serviceName category description price availabilityStatus providerId providerName providerAddress averageRating reviewsCount createdAt thumbnailUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(fetchLimit)
      .maxTimeMS(Math.max(250, timeoutMs))
      .lean(),
    timeoutMs,
    `Services query exceeded ${timeoutMs}ms`
  );

  const hasMore = rawServices.length > limit;
  let list = rawServices.slice(0, limit);

  const missingProviderIds = await getMissingProviderIds(list, Math.min(timeoutMs, 600));
  if (missingProviderIds.length) {
    const missingSet = new Set(missingProviderIds);
    list = list.filter((service) => !missingSet.has(String(service?.providerId || "").trim()));
    void archiveServicesByProviders(missingProviderIds, "system-orphaned-provider");
  }

  const services = await normalizeServiceCardPayload(list, Math.min(timeoutMs, 600));

  const totalPages = hasMore ? page + 1 : page;
  const total = (page - 1) * limit + services.length + (hasMore ? 1 : 0);

  return {
    success: true,
    data: services,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, totalPages),
      hasNextPage: hasMore
    }
  };
};

const refreshServicesCache = async (cacheKey, params, cachedPayload) => {
  if (listRefreshPromises.has(cacheKey)) {
    return listRefreshPromises.get(cacheKey);
  }

  const refreshPromise = fetchServicesPage({
    ...params,
    timeoutMs: SERVICES_REFRESH_TIMEOUT_MS,
  })
    .then((payload) => {
      setCacheEntry(cacheKey, payload);
      return payload;
    })
    .catch((error) => {
      if (connectDB.isMongoConnectionError(error)) {
        connectDB.scheduleReconnect("getAllServices-refresh-failed");
      }

      if (cachedPayload) {
        return cachedPayload;
      }

      throw error;
    })
    .finally(() => {
      listRefreshPromises.delete(cacheKey);
    });

  listRefreshPromises.set(cacheKey, refreshPromise);
  return refreshPromise;
};

const fetchServiceDetail = async (id, timeoutMs = 4000) =>
  withTimeout(
    Service.findOne({ _id: id, moderationStatus: { $ne: "removed" } })
      .select("serviceName category description price availabilityStatus providerId providerName providerAddress averageRating reviewsCount createdAt thumbnailUrl images")
      .slice("images", MAX_SERVICE_IMAGES)
      .maxTimeMS(timeoutMs)
      .lean(),
    timeoutMs,
    `Service detail query exceeded ${timeoutMs}ms`
  ).then(async (service) => {
    if (!service) return service;
    const missingProviderIds = await getMissingProviderIds([service], Math.min(timeoutMs, 600));
    if (missingProviderIds.length) {
      void archiveServicesByProviders(missingProviderIds, "system-orphaned-provider");
      return null;
    }
    const [normalized] = await normalizeServiceCardPayload([service], Math.min(timeoutMs, 600));
    return normalized;
  });

exports.getAllServices = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const minPrice = parseInt(req.query.minPrice, 10);
  const maxPrice = parseInt(req.query.maxPrice, 10);
  const location = typeof req.query.location === "string" ? req.query.location.trim().toLowerCase() : "";
  const providerId = typeof req.query.providerId === "string" ? req.query.providerId.trim() : "";
  const cacheKey = getCacheKey(page, limit, category, minPrice, maxPrice, location, providerId);

  const cached = getCacheEntry(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return res.json(
      attachMeta(
        cached.payload,
        buildServicesMeta({ cache: "fresh" })
      )
    );
  }

  const connectionStatus =
    typeof connectDB.getConnectionStatus === "function"
      ? connectDB.getConnectionStatus()
      : {
          readyState: mongoose.connection.readyState,
          connected: mongoose.connection.readyState === MONGO_CONNECTED_STATE,
          degraded: false,
          lastConnectionIssue: null,
        };

  if (connectionStatus.degraded) {
    connectDB.scheduleReconnect("getAllServices-degraded");
    return res.json(
      getFallbackServicesPayload(
        page,
        limit,
        cached?.payload,
        buildServicesMeta({
          degraded: true,
          reason: "database_degraded",
          message: "Services are temporarily loading from fallback data while the database reconnects.",
          readyState: connectionStatus.readyState,
          cache: cached?.payload ? "stale" : "none",
        })
      )
    );
  }

  if (mongoose.connection.readyState !== MONGO_CONNECTED_STATE) {
    connectDB.scheduleReconnect("getAllServices-not-connected");
    return res.json(
      getFallbackServicesPayload(
        page,
        limit,
        cached?.payload,
        buildServicesMeta({
          degraded: true,
          reason: "database_unavailable",
          message: "Services are temporarily unavailable because the database is not connected.",
          cache: cached?.payload ? "stale" : "none",
        })
      )
    );
  }

  if (cached?.payload) {
    void refreshServicesCache(
      cacheKey,
      { page, limit, skip, category, minPrice, maxPrice, location, providerId },
      cached.payload
    );

    return res.json(
      attachMeta(
        cached.payload,
        buildServicesMeta({ cache: "stale" })
      )
    );
  }

  try {
    const payload = await fetchServicesPage({
      page,
      limit,
      skip,
      category,
      minPrice,
      maxPrice,
      location,
      providerId,
    });

    setCacheEntry(cacheKey, payload);

    res.set("Cache-Control", "public, max-age=5, stale-while-revalidate=60");
    res.json(
      attachMeta(
        payload,
        buildServicesMeta({ cache: "refresh" })
      )
    );
  } catch (err) {
    if (connectDB.isMongoConnectionError(err)) {
      connectDB.scheduleReconnect("getAllServices-query-failed");
    }
    // If we have any cached payload (even expired), return it so the UI loads fast during brief Atlas hiccups.
    const lastCached = getCacheEntry(cacheKey) || cached;
    res.status(200).json(
      getFallbackServicesPayload(
        page,
        limit,
        lastCached?.payload,
        buildServicesMeta({
          degraded: true,
          reason: "database_query_failed",
          message: "Services could not be refreshed because the database is temporarily unavailable.",
          cache: lastCached?.payload ? "stale" : "none",
          debug: {
            name: err?.name || "Error",
            code: err?.code || null,
            message: err?.message || "Unknown services query failure",
          },
        })
      )
    );
  }
});

exports.getServiceById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) {
    const error = new Error("Invalid service ID");
    error.statusCode = 400;
    throw error;
  }
  const cacheKey = getServiceDetailCacheKey(id);
  const cached = getServiceDetailCacheEntry(id);

  if (cached && Date.now() < cached.expiresAt) {
    return res.json({
      success: true,
      data: cached.payload,
      meta: buildServicesMeta({ cache: "fresh" }),
    });
  }

  if (cached?.payload) {
    if (!serviceDetailRefreshPromises.has(cacheKey)) {
      const refreshPromise = fetchServiceDetail(id, 1200)
        .then((service) => {
          if (service) setServiceDetailCacheEntry(id, service);
          return service;
        })
        .catch((error) => {
          if (connectDB.isMongoConnectionError(error)) {
            connectDB.scheduleReconnect("getServiceById-refresh-failed");
          }
          return cached.payload;
        })
        .finally(() => {
          serviceDetailRefreshPromises.delete(cacheKey);
        });

      serviceDetailRefreshPromises.set(cacheKey, refreshPromise);
    }

    return res.json({
      success: true,
      data: cached.payload,
      meta: buildServicesMeta({ cache: "stale" }),
    });
  }

  try {
    const service = await fetchServiceDetail(id, 4000);
    if (!service) {
      const error = new Error("Service not found");
      error.statusCode = 404;
      throw error;
    }
    setServiceDetailCacheEntry(id, service);
    res.json({
      success: true,
      data: service,
      meta: buildServicesMeta({ cache: "refresh" }),
    });
  } catch (error) {
    if (connectDB.isMongoConnectionError(error)) {
      connectDB.scheduleReconnect("getServiceById-query-failed");
    }
    if (connectDB.isMongoConnectionError(error) || error?.code === "SERVICES_QUERY_TIMEOUT") {
      return res.status(200).json({
        success: true,
        data: cached?.payload || null,
        meta: buildServicesMeta({
          degraded: true,
          reason: "database_query_failed",
          message: "Service details could not be refreshed right now.",
          cache: cached?.payload ? "stale" : "none",
          debug: {
            name: error?.name || "Error",
            code: error?.code || null,
            message: error?.message || "Unknown service detail failure",
          },
        }),
      });
    }
    throw error;
  }
});

exports.updateService = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) {
    const error = new Error("Invalid service ID");
    error.statusCode = 400;
    throw error;
  }
  const service = await Service.findById(id).read("secondaryPreferred");
  if (!service) {
    const error = new Error("Service not found");
    error.statusCode = 404;
    throw error;
  }
  if (String(service.providerId) !== String(req.user.id)) {
    const error = new Error("Not authorized to update this service");
    error.statusCode = 403;
    throw error;
  }

  if (IMAGE_FIELD_NAMES.some((fieldName) => Object.prototype.hasOwnProperty.call(req.body, fieldName))) {
    const normalizedImages = normalizeServiceImages(getImagesFromBody(req.body)) || [];
    if (isMultipartRequest(req) && normalizedImages.length === 0) {
      const error = new Error("Multipart file upload is not supported on this endpoint. Send image URLs in the body.");
      error.statusCode = 400;
      throw error;
    }
    if (normalizedImages.length > MAX_SERVICE_IMAGES) {
      const error = new Error(`Maximum ${MAX_SERVICE_IMAGES} images are allowed`);
      error.statusCode = 400;
      throw error;
    }
  }

  applyServiceUpdates(service, req.body);

  if (service.price <= 0) {
    const error = new Error("price must be a positive number");
    error.statusCode = 400;
    throw error;
  }

  try {
    await service.save();
    clearServicesListCache();
  } catch (error) {
    if (!connectDB.isMongoConnectionError(error)) {
      throw error;
    }

    await connectDB.ensureConnected();

    const retryService = await Service.findById(id);
    if (!retryService) {
      const notFoundError = new Error("Service not found");
      notFoundError.statusCode = 404;
      throw notFoundError;
    }

    if (String(retryService.providerId) !== String(req.user.id)) {
      const authError = new Error("Not authorized to update this service");
      authError.statusCode = 403;
      throw authError;
    }

    applyServiceUpdates(retryService, req.body);

    if (retryService.price <= 0) {
      const retryValidationError = new Error("price must be a positive number");
      retryValidationError.statusCode = 400;
      throw retryValidationError;
    }

    await retryService.save();
    clearServicesListCache();
    return res.json({
      success: true,
      data: retryService
    });
  }

  res.json({
    success: true,
    data: service
  });
});

exports.deleteService = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) {
    const error = new Error("Invalid service ID");
    error.statusCode = 400;
    throw error;
  }
  const service = await Service.findById(id).read("secondaryPreferred");
  if (!service) {
    const error = new Error("Service not found");
    error.statusCode = 404;
    throw error;
  }
  if (String(service.providerId) !== String(req.user.id)) {
    const error = new Error("Not authorized to delete this service");
    error.statusCode = 403;
    throw error;
  }

  await service.deleteOne();
  clearServicesListCache();

  res.json({
    success: true,
    message: "Service deleted successfully"
  });
});

exports.archiveServicesByProvider = archiveServicesByProvider;
exports.clearServicesListCache = clearServicesListCache;
