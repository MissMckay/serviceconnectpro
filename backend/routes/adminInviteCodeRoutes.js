const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const {
  createAdminInviteCode,
  getAdminInviteCode,
  markAdminInviteCodeUsed,
  listAdminInviteCodesByCreator,
} = require("../controllers/adminInviteCodeController");

router.get("/", verifyToken, isAdmin, listAdminInviteCodesByCreator);
router.post("/", verifyToken, isAdmin, createAdminInviteCode);

router.get("/:codeId", getAdminInviteCode);
router.patch("/:codeId/used", verifyToken, markAdminInviteCodeUsed);

module.exports = router;
