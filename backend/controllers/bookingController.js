const mongoose = require("mongoose");
const Service = require("../models/Service");
const Booking = require("../models/Booking");
const asyncHandler = require("../utils/asyncHandler");
const connectDB = require("../config/db");

const BOOKING_QUERY_TIMEOUT_MS = 3500;
const BOOKING_REFRESH_TIMEOUT_MS = 1200;
const BOOKING_CACHE_TTL_MS = 15000;
const BOOKING_CACHE_STALE_TTL_MS = 60000;
const providerBookingsCache = new Map();

const withTimeout = (promise, timeoutMs, message) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const error = new Error(message);
      error.name = "MongoNetworkTimeoutError";
      error.code = "BOOKING_QUERY_TIMEOUT";
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

const findBookingForWrite = (id) => Booking.findById(id).read("secondaryPreferred");

const getProviderBookingsCacheKey = (providerId) => String(providerId || "");

const getProviderBookingsCacheEntry = (providerId) => {
  const cacheKey = getProviderBookingsCacheKey(providerId);
  const cached = providerBookingsCache.get(cacheKey);
  if (!cached) return null;
  if (cached.staleUntil <= Date.now()) {
    providerBookingsCache.delete(cacheKey);
    return null;
  }
  return cached;
};

const setProviderBookingsCacheEntry = (providerId, payload) => {
  providerBookingsCache.set(getProviderBookingsCacheKey(providerId), {
    payload,
    expiresAt: Date.now() + BOOKING_CACHE_TTL_MS,
    staleUntil: Date.now() + BOOKING_CACHE_STALE_TTL_MS,
  });
};

const clearProviderBookingsCache = (providerId) => {
  if (providerId) {
    providerBookingsCache.delete(getProviderBookingsCacheKey(providerId));
    return;
  }
  providerBookingsCache.clear();
};

const fetchProviderBookings = async (providerId, timeoutMs = BOOKING_QUERY_TIMEOUT_MS) =>
  withTimeout(
    Booking.find({ providerId })
      .select("serviceId userId providerId bookingDate status createdAt updatedAt")
      .sort({ createdAt: -1 })
      .populate("serviceId", "serviceName category price thumbnailUrl")
      .populate("userId", "name email phone")
      .maxTimeMS(timeoutMs)
      .lean(),
    timeoutMs,
    `Provider bookings query exceeded ${timeoutMs}ms`
  );

const retryBookingCreate = async (payload, reason) => {
  await connectDB.forceReconnect(reason);
  return Booking.create(payload);
};

const saveBookingWithRetry = async (booking, reason) => {
  try {
    await booking.save();
    return booking;
  } catch (error) {
    if (!connectDB.isMongoConnectionError(error)) {
      throw error;
    }

    await connectDB.forceReconnect(reason);
    const retryBooking = await findBookingForWrite(booking._id);
    if (!retryBooking) {
      const notFoundError = new Error("Booking not found");
      notFoundError.statusCode = 404;
      throw notFoundError;
    }

    retryBooking.set(booking.toObject());
    await retryBooking.save();
    return retryBooking;
  }
};

const deleteBookingWithRetry = async (booking, reason) => {
  try {
    await booking.deleteOne();
  } catch (error) {
    if (!connectDB.isMongoConnectionError(error)) {
      throw error;
    }

    await connectDB.forceReconnect(reason);
    const retryBooking = await findBookingForWrite(booking._id);
    if (!retryBooking) {
      return;
    }
    await retryBooking.deleteOne();
  }
};

exports.createBooking = asyncHandler(async (req, res) => {
  const { serviceId, bookingDate } = req.body;

  if (!serviceId || !mongoose.Types.ObjectId.isValid(serviceId)) {
    const error = new Error("Valid serviceId is required");
    error.statusCode = 400;
    throw error;
  }

  // Accept missing bookingDate from older clients and default to now.
  const parsedDate = bookingDate ? new Date(bookingDate) : new Date();
  if (Number.isNaN(parsedDate.getTime())) {
    const error = new Error("Invalid bookingDate");
    error.statusCode = 400;
    throw error;
  }

  const service = await Service.findById(serviceId).read("secondaryPreferred");

  if (!service) {
    const error = new Error("Service not found");
    error.statusCode = 404;
    throw error;
  }

  const bookingPayload = {
    serviceId: service._id,
    providerId: service.providerId,
    userId: req.user.id,
    bookingDate: parsedDate,
    status: "Pending"
  };

  let booking;
  try {
    booking = await Booking.create(bookingPayload);
  } catch (error) {
    if (!connectDB.isMongoConnectionError(error)) {
      throw error;
    }
    booking = await retryBookingCreate(bookingPayload, "createBooking-create");
  }
  clearProviderBookingsCache(service.providerId);

  res.status(201).json({
    success: true,
    data: booking
  });
});

exports.getProviderBookings = asyncHandler(async (req, res) => {
  const providerId = String(req.user.id || "");
  const cached = getProviderBookingsCacheEntry(providerId);

  if (cached && Date.now() < cached.expiresAt) {
    return res.json({
      success: true,
      data: cached.payload,
      meta: { cache: "fresh" },
    });
  }

  if (cached?.payload) {
    void fetchProviderBookings(providerId, BOOKING_REFRESH_TIMEOUT_MS)
      .then((bookings) => setProviderBookingsCacheEntry(providerId, bookings))
      .catch((error) => {
        if (connectDB.isMongoConnectionError(error) || error?.code === "BOOKING_QUERY_TIMEOUT") {
          connectDB.scheduleReconnect("getProviderBookings-refresh");
        }
      });

    return res.json({
      success: true,
      data: cached.payload,
      meta: { cache: "stale" },
    });
  }

  let bookings;
  try {
    bookings = await fetchProviderBookings(providerId, BOOKING_QUERY_TIMEOUT_MS);
    setProviderBookingsCacheEntry(providerId, bookings);
  } catch (error) {
    if (connectDB.isMongoConnectionError(error) || error?.code === "BOOKING_QUERY_TIMEOUT") {
      connectDB.scheduleReconnect("getProviderBookings-query");
    }

    return res.status(200).json({
      success: true,
      data: cached?.payload || [],
      meta: {
        degraded: true,
        reason: "database_query_failed",
        message: "Booking requests could not be refreshed right now.",
        cache: cached?.payload ? "stale" : "none",
      },
    });
  }

  res.json({
    success: true,
    data: bookings,
    meta: { cache: "refresh" },
  });
});

exports.getBookingById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    const error = new Error("Invalid booking id");
    error.statusCode = 400;
    throw error;
  }

  const booking = await Booking.findById(req.params.id)
    .read("secondaryPreferred")
    .select("serviceId userId providerId bookingDate status createdAt updatedAt")
    .populate("serviceId", "serviceName category description price availabilityStatus providerId providerName providerAddress averageRating reviewsCount createdAt thumbnailUrl images")
    .populate("userId", "name email phone")
    .populate("providerId", "name email providerAddress")
    .maxTimeMS(4000)
    .lean();

  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  const uid = String(req.user.id);
  const isOwnerUser = (booking.userId && (booking.userId._id ? String(booking.userId._id) : String(booking.userId))) === uid;
  const isOwnerProvider = (booking.providerId && (booking.providerId._id ? String(booking.providerId._id) : String(booking.providerId))) === uid;

  if (!isOwnerUser && !isOwnerProvider) {
    const error = new Error("Access denied");
    error.statusCode = 403;
    throw error;
  }

  res.json({
    success: true,
    data: booking
  });
});

exports.updateBookingStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!status) {
    const error = new Error("Status is required");
    error.statusCode = 400;
    throw error;
  }

  const allowedStatuses = ["Pending", "Accepted", "Rejected", "Completed"];
  if (!allowedStatuses.includes(status)) {
    const error = new Error("Invalid status value");
    error.statusCode = 400;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    const error = new Error("Invalid booking id");
    error.statusCode = 400;
    throw error;
  }

  const booking = await findBookingForWrite(req.params.id);

  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  booking.status = status;
  await saveBookingWithRetry(booking, "updateBookingStatus-save");
  clearProviderBookingsCache(booking.providerId);

  res.json({
    success: true,
    data: booking
  });
});

exports.getMyBookings = asyncHandler(async (req, res) => {
  if (req.user.role === "user") {
    return exports.getUserBookings(req, res);
  }

  if (req.user.role === "provider") {
    return exports.getProviderBookings(req, res);
  }

  const error = new Error("No booking view available for this role");
  error.statusCode = 403;
  throw error;
});

// Get User Booking History (serviceId includes images for booking cards)
exports.getUserBookings = asyncHandler(async (req, res) => {
  const bookings = await withTimeout(
    Booking.find({
      userId: req.user.id
    })
      .select("serviceId userId providerId bookingDate status createdAt updatedAt")
      .sort({ createdAt: -1 })
      .populate("serviceId", "serviceName price thumbnailUrl providerName providerAddress")
      .populate("providerId", "name email providerAddress")
      .maxTimeMS(BOOKING_QUERY_TIMEOUT_MS)
      .lean(),
    BOOKING_QUERY_TIMEOUT_MS,
    `User bookings query exceeded ${BOOKING_QUERY_TIMEOUT_MS}ms`
  );

  res.json({
    success: true,
    data: bookings
  });
});

// Cancel Booking (User only if Pending)
exports.cancelBooking = asyncHandler(async (req, res) => {
  const booking = await findBookingForWrite(req.params.id);

  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  if (booking.status !== "Pending") {
    const error = new Error("Cannot cancel this booking");
    error.statusCode = 400;
    throw error;
  }

  booking.status = "Cancelled";
  await saveBookingWithRetry(booking, "cancelBooking-save");
  clearProviderBookingsCache(booking.providerId);

  res.json({
    success: true,
    data: booking
  });
});

// Delete booking (User/Provider owner)
exports.deleteBooking = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    const error = new Error("Invalid booking id");
    error.statusCode = 400;
    throw error;
  }

  const booking = await findBookingForWrite(req.params.id);

  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  const isOwnerUser = booking.userId?.toString() === req.user.id;
  const isOwnerProvider = booking.providerId?.toString() === req.user.id;

  if (!isOwnerUser && !isOwnerProvider) {
    const error = new Error("Access denied");
    error.statusCode = 403;
    throw error;
  }

  await deleteBookingWithRetry(booking, "deleteBooking-delete");
  clearProviderBookingsCache(booking.providerId);

  res.json({
    success: true,
    message: "Booking deleted successfully"
  });
});
