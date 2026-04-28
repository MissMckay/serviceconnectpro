export const getStoredToken = () => {
  if (typeof window === "undefined") return "";
  return (
    window.localStorage?.getItem("token") ||
    window.sessionStorage?.getItem("token") ||
    ""
  );
};

export const clearStoredAuthData = () => {
  if (typeof window === "undefined") return;
  [window.localStorage, window.sessionStorage].forEach((storage) => {
    if (!storage) return;
    storage.removeItem("token");
    storage.removeItem("user");
    storage.removeItem("role");
    storage.removeItem("serviceconnect_auth_session_version");
  });
};
