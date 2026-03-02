const Review = require("../models/Review");
const Booking = require("../models/Booking");
const Service = require("../models/Service");
const asyncHandler = require("../utils/asyncHandler");
const { reviewSchema } = require("../validation/reviewValidation");

const recalculateServiceAverageRating = async (serviceId) => {
  const reviews = await Review.find({ serviceId }).select("rating");

  if (!reviews.length) {
    await Service.findByIdAndUpdate(serviceId, { averageRating: 0 });
    return 0;
  }

  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const roundedAverage = Number(avg.toFixed(1));

  await Service.findByIdAndUpdate(serviceId, { averageRating: roundedAverage });
  return roundedAverage;
};

exports.createReview = asyncHandler(async (req, res) => {
  const { bookingId, rating, comment } = req.body;
  const { error } = reviewSchema.validate(req.body);

  if (error) {
    const validationError = new Error(error.details[0].message);
    validationError.statusCode = 400;
    throw validationError;
  }

  const booking = await Booking.findById(bookingId);

  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  if (booking.userId.toString() !== req.user.id) {
    const error = new Error("Not authorized");
    error.statusCode = 403;
    throw error;
  }

  if (booking.status !== "Completed") {
    const error = new Error("Only completed bookings can be reviewed");
    error.statusCode = 400;
    throw error;
  }

  const existing = await Review.findOne({ bookingId });
  if (existing) {
    // Idempotent behavior: if already reviewed, return success so UI does not fail.
    return res.status(200).json({
      success: true,
      message: "Review already submitted",
      data: existing,
      alreadyExists: true
    });
  }

  let review;
  try {
    review = await Review.create({
      bookingId,
      serviceId: booking.serviceId,
      userId: req.user.id,
      rating,
      comment
    });
  } catch (err) {
    // Handles concurrent duplicate submissions safely.
    if (err && err.code === 11000) {
      const duplicate = await Review.findOne({ bookingId });
      return res.status(200).json({
        success: true,
        message: "Review already submitted",
        data: duplicate || null,
        alreadyExists: true
      });
    }

    throw err;
  }

  await recalculateServiceAverageRating(booking.serviceId);

  res.status(201).json({
    success: true,
    data: review
  });
});

exports.deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    const error = new Error("Review not found");
    error.statusCode = 404;
    throw error;
  }

  const isAdmin = req.user.role === "admin";
  const isOwner = review.userId.toString() === req.user.id;

  if (!isAdmin && !isOwner) {
    const error = new Error("Not authorized");
    error.statusCode = 403;
    throw error;
  }

  const { serviceId } = review;
  await review.deleteOne();
  await recalculateServiceAverageRating(serviceId);

  res.json({
    success: true,
    message: "Review deleted successfully"
  });
});

exports.getServiceReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({
    serviceId: req.params.serviceId
  })
    .sort({ createdAt: -1 })
    .populate("userId", "name");

  res.json({
    success: true,
    data: reviews
  });
});
