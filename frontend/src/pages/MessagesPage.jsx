import { useEffect, useState, useRef, useContext } from "react";
import { useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import {
  subscribeConversations,
  subscribeMessages,
  sendMessage as sendMessageToFirestore,
  getOrCreateConversation,
} from "../firebase/firestoreServices";

export default function MessagesPage() {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const currentUserId = user?.uid || null;

  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [compose, setCompose] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);

  const selectedConversation = conversations.find((c) => c._id === selected?.id);
  const otherUser = selectedConversation?.otherUser || (compose ? { _id: compose.recipientId, name: compose.recipientName } : null);

  useEffect(() => {
    const state = location.state;
    if (state?.recipientId && state?.recipientName) {
      setCompose({ recipientId: state.recipientId, recipientName: state.recipientName });
      if (typeof window.history.replaceState === "function") {
        window.history.replaceState({}, "", location.pathname);
      }
    }
  }, []);

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
    if (!loading && compose && conversations.length > 0) {
      const match = conversations.find(
        (c) => c.otherUser && String(c.otherUser._id) === String(compose.recipientId)
      );
      if (match) {
        setSelected({ id: match._id });
        setCompose(null);
      }
    }
  }, [loading, conversations, compose]);

  useEffect(() => {
    if (!selected?.id) {
      setMessages([]);
      return;
    }
    const unsub = subscribeMessages(selected.id, setMessages);
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [selected?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    const rawRecipient = otherUser?._id;
    const recipientId = rawRecipient != null ? String(rawRecipient) : null;
    if (!text || sending || !currentUserId) return;

    setSending(true);
    setError("");
    try {
      let convId = selected?.id;
      if (compose && recipientId) {
        const conv = await getOrCreateConversation(currentUserId, recipientId);
        convId = conv._id;
        setSelected({ id: convId });
        setCompose(null);
      }
      if (convId) {
        await sendMessageToFirestore(convId, currentUserId, text);
        setInput("");
      }
    } catch (err) {
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

              <div className="messages-thread">
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
