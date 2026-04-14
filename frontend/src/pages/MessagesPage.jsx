import { useEffect, useState, useRef, useContext } from "react";
import { useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import {
  subscribeConversations,
  subscribeMessages,
  sendMessage as sendMessageToFirestore,
  getOrCreateConversation,
} from "../firebase/firestoreServices";

const getEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") return String(value._id || value.id || value.uid || "").trim();
  return String(value || "").trim();
};

export default function MessagesPage() {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const currentUserId = user?.uid || null;

  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [compose, setCompose] = useState(null);
  const [pendingRecipient, setPendingRecipient] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesThreadRef = useRef(null);
  const messagesEndRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);

  const selectedConversation = conversations.find((c) => String(c._id) === String(selected?.id));
  const otherUser =
    selectedConversation?.otherUser ||
    pendingRecipient ||
    (compose ? { _id: compose.recipientId, name: compose.recipientName } : null);

  useEffect(() => {
    const state = location.state;
    if (state?.recipientId && state?.recipientName) {
      const recipientId = getEntityId(state.recipientId);
      if (!recipientId) return;
      const nextRecipient = { _id: recipientId, recipientId, name: state.recipientName, recipientName: state.recipientName };
      setPendingRecipient(nextRecipient);
      setCompose({ recipientId, recipientName: state.recipientName });
      if (typeof window.history.replaceState === "function") {
        window.history.replaceState({}, "", location.pathname);
      }
    }
  }, []);

  useEffect(() => {
    if (!currentUserId || !compose?.recipientId) return;

    let cancelled = false;

    const ensureConversation = async () => {
      try {
        const conv = await getOrCreateConversation(currentUserId, String(compose.recipientId));
        if (cancelled || !conv?._id) return;
        setSelected({ id: conv._id });
        setCompose(null);
        setError("");
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Failed to open conversation.");
      }
    };

    ensureConversation();

    return () => {
      cancelled = true;
    };
  }, [compose?.recipientId, currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setLoading(false);
      setConversations([]);
      return;
    }
    setLoading(true);
    let unsub;
    try {
      unsub = subscribeConversations(currentUserId, (list) => {
        setConversations(list);
        setLoading(false);
        setError("");
      });
    } catch (err) {
      setError(err?.message || "Failed to load conversations.");
      setConversations([]);
      setLoading(false);
    }
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!loading && compose && conversations.length > 0 && !selected?.id) {
      const match = conversations.find(
        (c) => c.otherUser && String(c.otherUser._id) === String(compose.recipientId)
      );
      if (match) {
        setSelected({ id: match._id });
        setPendingRecipient(match.otherUser || null);
        setCompose(null);
      }
    }
  }, [loading, conversations, compose, selected?.id]);

  useEffect(() => {
    if (!selected?.id) {
      setMessages([]);
      return;
    }
    shouldStickToBottomRef.current = true;
    const unsub = subscribeMessages(selected.id, (list) => {
      setMessages(Array.isArray(list) ? list : []);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [selected?.id]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  const handleThreadScroll = () => {
    const thread = messagesThreadRef.current;
    if (!thread) return;
    const distanceFromBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 72;
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    const rawRecipient = otherUser?._id || compose?.recipientId || selectedConversation?.otherUser?._id;
    const recipientId = getEntityId(rawRecipient);
    if (!text || sending || !currentUserId) return;

    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage = {
      _id: optimisticId,
      id: optimisticId,
      senderId: currentUserId,
      text,
      createdAt: new Date(),
      pending: true,
    };

    setSending(true);
    setError("");
    setInput("");
    shouldStickToBottomRef.current = true;
    setMessages((prev) => [...prev, optimisticMessage]);
    try {
      let convId = selected?.id;
      if (compose && recipientId) {
        const conv = await getOrCreateConversation(currentUserId, recipientId);
        convId = conv._id;
        setSelected({ id: convId });
        if (conv?.otherUser) setPendingRecipient(conv.otherUser);
        setCompose(null);
      }
      if (convId || recipientId) {
        const savedMessage = await sendMessageToFirestore(convId, currentUserId, text, { recipientId });
        setMessages((prev) => [
          ...prev.filter((message) => message._id !== optimisticId),
          ...(savedMessage ? [savedMessage] : []),
        ]);
      } else {
        throw new Error("Unable to determine who to message.");
      }
    } catch (err) {
      setMessages((prev) => prev.filter((message) => message._id !== optimisticId));
      setInput(text);
      setError(err?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr) => {
    const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getInitials = (u) => {
    const name = u?.name || u?.email || "?";
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    return name.slice(0, 2).toUpperCase();
  };

  if (!currentUserId) {
    return (
      <div className="messages-page">
        <p className="messages-error">Please sign in to view messages.</p>
      </div>
    );
  }

  return (
    <div className="messages-page">
      <div className="messages-layout">
        <aside className="messages-sidebar">
          <h2 className="messages-sidebar-title">Messages</h2>
          {error && <p className="messages-error">{error}</p>}
          {loading ? (
            <p className="messages-loading">Loading conversations…</p>
          ) : conversations.length === 0 ? (
            <p className="messages-empty">No conversations yet. Book a service to start chatting.</p>
          ) : (
            <ul className="messages-conversation-list">
              {conversations.map((conv) => {
                const other = conv.otherUser;
                const name = other?.name || other?.email || "Unknown";
                const isActive = selected?.id === conv._id;
                return (
                  <li key={conv._id}>
                    <button
                      type="button"
                      className={`messages-conv-btn ${isActive ? "active" : ""}`}
                      onClick={() => {
                        setSelected({ id: conv._id });
                        setError("");
                      }}
                    >
                      <span className="messages-conv-avatar">
                        {other?.profilePhoto ? (
                          <img src={other.profilePhoto} alt="" />
                        ) : (
                          <span>{getInitials(other)}</span>
                        )}
                      </span>
                      <span className="messages-conv-info">
                        <span className="messages-conv-name">{name}</span>
                        {conv.lastMessagePreview && (
                          <span className="messages-conv-preview">{conv.lastMessagePreview}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="messages-main">
          {!selected && !compose ? (
            <div className="messages-placeholder">
              <p>Select a conversation or book a service to start messaging.</p>
            </div>
          ) : (
            <>
              <header className="messages-thread-header">
                <span className="messages-thread-avatar">
                  {otherUser?.profilePhoto ? (
                    <img src={otherUser.profilePhoto} alt="" />
                  ) : (
                    <span>{getInitials(otherUser)}</span>
                  )}
                </span>
                <span className="messages-thread-name">{otherUser?.name || otherUser?.email || "Unknown"}</span>
              </header>

              <div className="messages-thread" ref={messagesThreadRef} onScroll={handleThreadScroll}>
                {messages.map((msg) => {
                  const isMe = String(msg.senderId) === String(currentUserId);
                  return (
                    <div
                      key={msg._id}
                      className={`messages-bubble ${isMe ? "messages-bubble-me" : "messages-bubble-them"}`}
                    >
                      <span className="messages-bubble-text">{msg.text}</span>
                      <span className="messages-bubble-time">{formatTime(msg.createdAt)}</span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form className="messages-send-form" onSubmit={handleSend}>
                <input
                  type="text"
                  placeholder="Type a message…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={sending}
                  className="messages-input"
                />
                <button type="submit" className="messages-send-btn" disabled={sending || !input.trim()}>
                  {sending ? "Sending…" : "Send"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
