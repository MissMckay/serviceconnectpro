const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const { getCurrentUser, getUserById } = require("../controllers/userLookupController");

router.get("/me", verifyToken, getCurrentUser);
router.get("/:id", getUserById);

module.exports = router;
