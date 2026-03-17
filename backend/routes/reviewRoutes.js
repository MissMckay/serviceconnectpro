const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
  createReview,
  getServiceReviews,
  getReviewByBooking,
  deleteReview
} = require("../controllers/reviewController");

/**
 * USER: Create Review
 */
router.post(
  "/",
  verifyToken,
  authorizeRoles("user"),
  createReview
);

/**
 * PUBLIC: Get Reviews By Service
 */
router.get("/service/:serviceId", getServiceReviews);

/**
 * USER: Get review by booking (for current user)
 */
router.get("/booking/:bookingId", verifyToken, getReviewByBooking);

/**
 * USER/ADMIN: Delete Review
 */
router.delete(
  "/:id",
  verifyToken,
  authorizeRoles("user", "admin"),
  deleteReview
);

module.exports = router;
