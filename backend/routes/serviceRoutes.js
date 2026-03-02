const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
  createService,
  getAllServices,
  getServiceById,
  updateService,
  deleteService
} = require("../controllers/serviceController");

// Public
router.get("/", getAllServices);
router.get("/:id", getServiceById);

// Provider
router.post("/", verifyToken, authorizeRoles("provider"), createService);
router.put("/:id", verifyToken, authorizeRoles("provider"), updateService);
router.delete("/:id", verifyToken, authorizeRoles("provider"), deleteService);

module.exports = router;
