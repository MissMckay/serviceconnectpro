import { io } from "socket.io-client";

let socket = null;

export function getMessageSocket() {
  const token = sessionStorage.getItem("token");
  if (!token) return null;
  if (socket?.connected) return socket;
  const origin = window.location.origin;
  socket = io(origin, {
    path: "/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],
  });
  return socket;
}

export function disconnectMessageSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinConversation(conversationId, onJoined) {
  const s = getMessageSocket();
  if (!s) {
    if (onJoined) onJoined({ error: "Not authenticated" });
    return;
  }
  s.emit("join_conversation", conversationId, (res) => {
    if (onJoined) onJoined(res || {});
  });
}

export function leaveConversation(conversationId) {
  const s = getMessageSocket();
  if (s) s.emit("leave_conversation", conversationId);
}

export function onMessage(callback) {
  const s = getMessageSocket();
  if (!s) return () => {};
  s.on("message", callback);
  return () => s.off("message", callback);
}
