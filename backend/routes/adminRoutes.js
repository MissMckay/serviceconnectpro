const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const requireDbConnection = require("../middleware/requireDbConnection");

const {
  getAllUsers,
  getUserDetailsAdmin,
  updateUserRole,
  getDashboardStats,
  updateUserStatus,
  deleteUser,
  getAllProviders,
  getPendingProviders,
  updateProviderApprovalStatus,
  approveProvider,
  rejectProvider,
  updateProviderAccountStatus,
  getAllServicesAdmin,
  updateServiceAdmin,
  deleteServiceAdmin
} = require("../controllers/adminController");

router.use(requireDbConnection, verifyToken, isAdmin);

router.get("/users", getAllUsers);
router.get("/users/:id", getUserDetailsAdmin);
router.put("/users/:id/role", updateUserRole);
router.patch("/users/:id/status", updateUserStatus);
router.put("/users/:id/status", updateUserStatus);
router.delete("/users/:id", deleteUser);

router.get("/dashboard", getDashboardStats);
router.get("/dashboard-stats", getDashboardStats);
router.get("/stats", getDashboardStats);

router.get("/providers", getAllProviders);
router.get("/providers/pending", getPendingProviders);
router.patch("/providers/:id/approval", updateProviderApprovalStatus);
router.put("/providers/:id/approval", updateProviderApprovalStatus);
router.patch("/providers/:id/approve", approveProvider);
router.put("/providers/:id/approve", approveProvider);
router.patch("/providers/:id/reject", rejectProvider);
router.put("/providers/:id/reject", rejectProvider);
router.patch("/providers/:id/status", updateProviderAccountStatus);
router.put("/providers/:id/status", updateProviderAccountStatus);

router.get("/services", getAllServicesAdmin);
router.patch("/services/:id", updateServiceAdmin);
router.put("/services/:id", updateServiceAdmin);
router.delete("/services/:id", deleteServiceAdmin);

module.exports = router;
