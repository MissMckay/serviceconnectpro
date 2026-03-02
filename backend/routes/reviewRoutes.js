const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
  createReview,
  getServiceReviews,
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
 * USER/ADMIN: Delete Review
 */
router.delete(
  "/:id",
  verifyToken,
  authorizeRoles("user", "admin"),
  deleteReview
);

module.exports = router;
