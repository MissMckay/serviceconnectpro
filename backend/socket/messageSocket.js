const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");

function getUserIdFromToken(token) {
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const id = decoded.id || decoded.userId || decoded._id;
    return id && mongoose.Types.ObjectId.isValid(id) ? id : null;
  } catch {
    return null;
  }
}

function attachMessageSocket(io) {
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      (socket.handshake.headers?.authorization || "").replace("Bearer ", "");
    const userId = getUserIdFromToken(token);
    if (!userId) {
      return next(new Error("Authentication required"));
    }
    socket.userId = userId;
    next();
  });

  io.on("connection", (socket) => {
    socket.on("join_conversation", async (conversationId, cb) => {
      if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        if (typeof cb === "function") cb({ error: "Invalid conversation id" });
        return;
      }
      const conv = await Conversation.findById(conversationId);
      if (!conv) {
        if (typeof cb === "function") cb({ error: "Conversation not found" });
        return;
      }
      const isParticipant = (conv.participants || []).some(
        (p) => p.toString() === socket.userId
      );
      if (!isParticipant) {
        if (typeof cb === "function") cb({ error: "Access denied" });
        return;
      }
      const room = `conversation:${conversationId}`;
      socket.join(room);
      if (typeof cb === "function") cb({ ok: true });
    });

    socket.on("leave_conversation", (conversationId) => {
      if (conversationId) socket.leave(`conversation:${conversationId}`);
    });
  });
}

module.exports = { attachMessageSocket };
