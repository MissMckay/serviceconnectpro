const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const {
  getConversations,
  getMessages,
  getOrCreateConversation,
  sendMessage
} = require("../controllers/messageController");

router.use(verifyToken);

router.get("/conversations", getConversations);
router.get("/conversations/:conversationId/messages", getMessages);
router.get("/get-or-create-conversation", getOrCreateConversation);
router.get("/messages", getMessages);
router.post("/", sendMessage);

module.exports = router;
