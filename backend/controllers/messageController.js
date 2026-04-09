const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const connectDB = require("../config/db");

const CACHE_TTL_MS = 15000;
const CACHE_STALE_TTL_MS = 2 * 60 * 1000;
const MESSAGES_QUERY_TIMEOUT_MS = 2500;
const MESSAGES_REFRESH_TIMEOUT_MS = 900;

const conversationsCache = new Map();
const messagesCache = new Map();
const refreshPromises = new Map();

function participantKey(myId, otherId) {
  if (!myId || !otherId) return null;
  return [String(myId), String(otherId)].sort().join("_");
}

const withTimeout = (promise, timeoutMs, message) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const error = new Error(message);
      error.code = "MESSAGE_QUERY_TIMEOUT";
      reject(error);
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

const getCacheEntry = (cache, key) => {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.staleUntil <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached;
};

const setCacheEntry = (cache, key, payload) => {
  cache.set(key, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
    staleUntil: Date.now() + CACHE_STALE_TTL_MS,
  });
};

const clearMessageCaches = (conversationId, participantIds = []) => {
  if (conversationId) messagesCache.delete(`messages:${String(conversationId)}`);
  participantIds.forEach((participantId) => {
    if (participantId) conversationsCache.delete(`conversations:${String(participantId)}`);
  });
};

const buildMeta = ({ degraded = false, reason = null, message = null, cache = "none", debug = null } = {}) => ({
  degraded,
  reason,
  message,
  cache,
  ...(debug ? { debug } : {}),
});

const buildUserLookupMap = async (ids = []) => {
  const normalizedIds = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!normalizedIds.length) return new Map();

  const users = await User.find({ _id: { $in: normalizedIds } })
    .select("name email profilePhoto")
    .lean();

  return new Map(
    users.map((user) => [String(user._id), { _id: user._id, id: user._id, ...user }])
  );
};

const fetchConversationsPayload = async (currentId, timeoutMs = MESSAGES_QUERY_TIMEOUT_MS) => {
  const conversations = await withTimeout(
    Conversation.find({ participants: currentId })
      .sort({ lastMessageAt: -1 })
      .lean(),
    timeoutMs,
    `Conversations query exceeded ${timeoutMs}ms`
  );

  const otherIds = conversations
    .map((conv) => (conv.participants || []).find((p) => String(p) !== currentId))
    .filter(Boolean);
  const usersById = await buildUserLookupMap(otherIds);

  return conversations.map((conv) => {
    const otherId = (conv.participants || []).find((p) => String(p) !== currentId);
    const otherUser = otherId
      ? usersById.get(String(otherId)) || { _id: otherId, id: otherId, name: "Unknown" }
      : null;
    return {
      _id: conv._id,
      id: conv._id,
      participants: conv.participants,
      participantKey: conv.participantKey,
      lastMessageAt: conv.lastMessageAt,
      lastMessagePreview: conv.lastMessagePreview || "",
      bookingId: conv.bookingId || null,
      otherUser,
    };
  });
};

const fetchMessagesPayload = async (conversationId, currentId, timeoutMs = MESSAGES_QUERY_TIMEOUT_MS) => {
  const conv = await withTimeout(
    Conversation.findById(conversationId).lean(),
    timeoutMs,
    `Conversation lookup exceeded ${timeoutMs}ms`
  );
  if (!conv) {
    const error = new Error("Conversation not found");
    error.statusCode = 404;
    throw error;
  }

  const isParticipant = (conv.participants || []).some((p) => String(p) === currentId);
  if (!isParticipant) {
    const error = new Error("Access denied");
    error.statusCode = 403;
    throw error;
  }

  const messages = await withTimeout(
    Message.find({ conversationId: conv._id })
      .sort({ createdAt: 1 })
      .lean(),
    timeoutMs,
    `Messages query exceeded ${timeoutMs}ms`
  );

  const sendersById = await buildUserLookupMap(messages.map((message) => message.senderId));
  return messages.map((m) => {
    const sender = sendersById.get(String(m.senderId));
    return {
      ...m,
      senderId: m.senderId,
      user: sender
        ? { name: sender.name, profilePhoto: sender.profilePhoto }
        : { name: "Unknown" },
    };
  });
};

exports.getConversations = asyncHandler(async (req, res) => {
  const currentId = req.user?.id ? String(req.user.id) : null;
  if (!currentId) {
    return res.status(400).json({ message: "Invalid user" });
  }
  const cacheKey = `conversations:${currentId}`;
  const cached = getCacheEntry(conversationsCache, cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    return res.json({ success: true, data: cached.payload, meta: buildMeta({ cache: "fresh" }) });
  }

  if (cached?.payload) {
    const refreshKey = `refresh:${cacheKey}`;
    if (!refreshPromises.has(refreshKey)) {
      refreshPromises.set(
        refreshKey,
        fetchConversationsPayload(currentId, MESSAGES_REFRESH_TIMEOUT_MS)
          .then((payload) => {
            setCacheEntry(conversationsCache, cacheKey, payload);
            return payload;
          })
          .catch((error) => {
            if (connectDB.isMongoConnectionError(error) || error?.code === "MESSAGE_QUERY_TIMEOUT") {
              connectDB.scheduleReconnect("getConversations-refresh-failed");
            }
            return cached.payload;
          })
          .finally(() => refreshPromises.delete(refreshKey))
      );
    }

    return res.json({ success: true, data: cached.payload, meta: buildMeta({ cache: "stale" }) });
  }

  try {
    const payload = await fetchConversationsPayload(currentId);
    setCacheEntry(conversationsCache, cacheKey, payload);
    return res.json({ success: true, data: payload, meta: buildMeta({ cache: "refresh" }) });
  } catch (error) {
    if (connectDB.isMongoConnectionError(error) || error?.code === "MESSAGE_QUERY_TIMEOUT") {
      connectDB.scheduleReconnect("getConversations-query-failed");
      return res.status(200).json({
        success: true,
        data: cached?.payload || [],
        meta: buildMeta({
          degraded: true,
          reason: "database_query_failed",
          message: "Messages are temporarily loading from fallback data.",
          cache: cached?.payload ? "stale" : "none",
          debug: {
            name: error?.name || "Error",
            code: error?.code || null,
            message: error?.message || "Unknown conversations failure",
          },
        }),
      });
    }
    throw error;
  }
});

exports.getMessages = asyncHandler(async (req, res) => {
  const conversationId = req.query.conversationId || req.params.conversationId;
  if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
    return res.status(400).json({ message: "Valid conversationId is required" });
  }
  const currentId = String(req.user.id);
  const cacheKey = `messages:${String(conversationId)}`;
  const cached = getCacheEntry(messagesCache, cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    return res.json({ success: true, data: cached.payload, meta: buildMeta({ cache: "fresh" }) });
  }

  if (cached?.payload) {
    const refreshKey = `refresh:${cacheKey}`;
    if (!refreshPromises.has(refreshKey)) {
      refreshPromises.set(
        refreshKey,
        fetchMessagesPayload(conversationId, currentId, MESSAGES_REFRESH_TIMEOUT_MS)
          .then((payload) => {
            setCacheEntry(messagesCache, cacheKey, payload);
            return payload;
          })
          .catch((error) => {
            if (connectDB.isMongoConnectionError(error) || error?.code === "MESSAGE_QUERY_TIMEOUT") {
              connectDB.scheduleReconnect("getMessages-refresh-failed");
            }
            return cached.payload;
          })
          .finally(() => refreshPromises.delete(refreshKey))
      );
    }

    return res.json({ success: true, data: cached.payload, meta: buildMeta({ cache: "stale" }) });
  }

  try {
    const payload = await fetchMessagesPayload(conversationId, currentId);
    setCacheEntry(messagesCache, cacheKey, payload);
    return res.json({ success: true, data: payload, meta: buildMeta({ cache: "refresh" }) });
  } catch (error) {
    if (connectDB.isMongoConnectionError(error) || error?.code === "MESSAGE_QUERY_TIMEOUT") {
      connectDB.scheduleReconnect("getMessages-query-failed");
      return res.status(200).json({
        success: true,
        data: cached?.payload || [],
        meta: buildMeta({
          degraded: true,
          reason: "database_query_failed",
          message: "This conversation is temporarily loading from fallback data.",
          cache: cached?.payload ? "stale" : "none",
          debug: {
            name: error?.name || "Error",
            code: error?.code || null,
            message: error?.message || "Unknown messages failure",
          },
        }),
      });
    }
    throw error;
  }
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
  let conv = await Conversation.findOne({ participantKey: key })
    .lean();
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
  clearMessageCaches(conversation._id, conversation.participants || []);
  setCacheEntry(messagesCache, `messages:${String(conversation._id)}`, [
    ...((getCacheEntry(messagesCache, `messages:${String(conversation._id)}`)?.payload || []).filter(
      (entry) => String(entry?._id) !== String(populated?._id)
    )),
    populated,
  ]);

  const io = req.app.get("io");
  if (io) {
    const room = `conversation:${conversation._id}`;
    io.to(room).emit("message", populated);
  }

  res.status(201).json({ success: true, data: { ...populated, id: populated._id, _id: populated._id } });
});
