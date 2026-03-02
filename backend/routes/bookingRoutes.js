const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
  createBooking,
  getMyBookings,
  getUserBookings,
  getProviderBookings,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
  deleteBooking
} = require("../controllers/bookingController");


/**
 * USER ROUTES
 */

// Create booking (User only)
router.post(
  "/",
  verifyToken,
  authorizeRoles("user"),
  createBooking
);

// Get bookings for logged-in user/provider
router.get(
  "/",
  verifyToken,
  authorizeRoles("user", "provider"),
  getMyBookings
);

// Get own bookings
router.get(
  "/user",
  verifyToken,
  authorizeRoles("user"),
  getUserBookings
);


/**
 * PROVIDER ROUTES
 */

// View bookings for own services
router.get(
  "/provider",
  verifyToken,
  authorizeRoles("provider"),
  getProviderBookings
);

// Get booking by id (User/Provider)
router.get(
  "/:id",
  verifyToken,
  authorizeRoles("user", "provider"),
  getBookingById
);

// Delete booking history item (User/Provider owner)
router.delete(
  "/:id",
  verifyToken,
  authorizeRoles("user", "provider"),
  deleteBooking
);

// Update booking status (Accept / Reject)
router.put(
  "/:id",
  verifyToken,
  authorizeRoles("provider"),
  updateBookingStatus
);

// Update booking status (Accept / Reject)
router.put(
  "/:id/status",
  verifyToken,
  authorizeRoles("provider"),
  updateBookingStatus
);

// Cancel booking (User only)
router.put(
  "/cancel/:id",
  verifyToken,
  authorizeRoles("user"),
  cancelBooking
);

module.exports = router;
