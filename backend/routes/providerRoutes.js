const express = require("express");
const router = express.Router();
const { getProviderById } = require("../controllers/userLookupController");

router.get("/:id", getProviderById);

module.exports = router;
