const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const { getCurrentUser, getUserById, updateCurrentUser } = require("../controllers/userLookupController");

router.route("/me")
  .get(verifyToken, getCurrentUser)
  .patch(verifyToken, updateCurrentUser);
router.get("/:id", getUserById);

module.exports = router;
