const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");

function participantKey(myId, otherId) {
  if (!myId || !otherId) return null;
  return [String(myId), String(otherId)].sort().join("_");
}

exports.getConversations = asyncHandler(async (req, res) => {
  const currentId = req.user?.id ? String(req.user.id) : null;
  if (!currentId) {
    return res.status(400).json({ message: "Invalid user" });
  }

  const conversations = await Conversation.find({ participants: currentId })
    .sort({ lastMessageAt: -1 })
    .lean();

  const list = [];
  for (const conv of conversations) {
    const otherId = (conv.participants || []).find((p) => String(p) !== currentId);
    let otherUser = null;
    if (otherId) {
      const u = await User.findById(otherId).select("name email profilePhoto").lean();
      otherUser = u ? { _id: u._id, id: u._id, ...u } : { _id: otherId, id: otherId, name: "Unknown" };
    }
    list.push({
      _id: conv._id,
      id: conv._id,
      participants: conv.participants,
      participantKey: conv.participantKey,
      lastMessageAt: conv.lastMessageAt,
      lastMessagePreview: conv.lastMessagePreview || "",
      bookingId: conv.bookingId || null,
      otherUser,
    });
  }

  res.json({ success: true, data: list });
});

exports.getMessages = asyncHandler(async (req, res) => {
  const conversationId = req.query.conversationId || req.params.conversationId;
  if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
    return res.status(400).json({ message: "Valid conversationId is required" });
  }

  const conv = await Conversation.findById(conversationId).lean();
  if (!conv) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  const currentId = String(req.user.id);
  const isParticipant = (conv.participants || []).some((p) => String(p) === currentId);
  if (!isParticipant) {
    return res.status(403).json({ message: "Access denied" });
  }

  const messages = await Message.find({ conversationId: conv._id })
    .sort({ createdAt: 1 })
    .lean();

  const withSender = [];
  for (const m of messages) {
    const u = await User.findById(m.senderId).select("name profilePhoto").lean();
    withSender.push({
      ...m,
      senderId: m.senderId,
      user: u ? { name: u.name, profilePhoto: u.profilePhoto } : { name: "Unknown" },
    });
  }

  res.json({ success: true, data: withSender });
});

exports.getOrCreateConversation = asyncHandler(async (req, res) => {
  const myId = String(req.user.id);
  const otherId = (req.params.otherId || req.query.otherId || "").trim();
  if (!otherId) {
    return res.status(400).json({ message: "otherId is required (query or param)" });
  }
  const key = participantKey(myId, otherId);
  if (!key) {
    return res.status(400).json({ message: "Invalid user ids" });
  }
  let conv = await Conversation.findOne({ participantKey: key }).lean();
  if (!conv) {
    conv = await Conversation.create({
      participants: [myId, otherId].sort(),
      participantKey: key,
      lastMessagePreview: "",
    });
    conv = conv.toObject ? conv.toObject() : conv;
  }
  res.json({ success: true, data: { ...conv, id: conv._id, _id: conv._id } });
});

exports.sendMessage = asyncHandler(async (req, res) => {
  const { recipientId: rawRecipientId, text, conversationId: bodyConvId, bookingId } = req.body;
  const senderId = req.user?.id != null ? String(req.user.id) : null;
  const recipientId =
    rawRecipientId != null && typeof rawRecipientId === "string"
      ? rawRecipientId.trim()
      : rawRecipientId != null && typeof rawRecipientId === "object" && rawRecipientId.toString
        ? String(rawRecipientId.toString())
        : null;

  if (!senderId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (!text || typeof text !== "string") {
    return res.status(400).json({ message: "text is required" });
  }
  const trimmedText = text.trim();
  if (!trimmedText.length) {
    return res.status(400).json({ message: "Message text cannot be empty" });
  }

  let conversation;
  if (bodyConvId && mongoose.Types.ObjectId.isValid(bodyConvId)) {
    conversation = await Conversation.findById(bodyConvId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    const isParticipant = (conversation.participants || []).some((p) => String(p) === senderId);
    if (!isParticipant) {
      return res.status(403).json({ message: "Access denied" });
    }
  } else if (recipientId) {
    const key = participantKey(senderId, recipientId);
    if (!key) {
      return res.status(400).json({ message: "Invalid recipient" });
    }
    conversation = await Conversation.findOne({ participantKey: key });
    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, recipientId].sort(),
        participantKey: key,
        lastMessagePreview: "",
      });
    }
  } else {
    return res.status(400).json({ message: "conversationId or recipientId is required" });
  }

  const message = await Message.create({
    conversationId: conversation._id,
    senderId,
    text: trimmedText,
  });

  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessagePreview = trimmedText.slice(0, 100);
  if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) {
    conversation.bookingId = bookingId;
  }
  await conversation.save();

  const populated = await Message.findById(message._id).lean();

  const io = req.app.get("io");
  if (io) {
    const room = `conversation:${conversation._id}`;
    io.to(room).emit("message", populated);
  }

  res.status(201).json({ success: true, data: { ...populated, id: populated._id, _id: populated._id } });
});
