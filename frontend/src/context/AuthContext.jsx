import { createContext, useEffect, useState } from "react";
import API from "../services/api";

export const AuthContext = createContext();

const defaultProfile = {
  role: "user",
  accountStatus: "active",
  isApproved: true,
  approvalStatus: "approved",
  phone: "Not provided",
  providerAddress: "Not provided",
  profilePhoto: "",
};
const AUTH_PROFILE_TIMEOUT_MS = 5000;
const AUTH_SESSION_VERSION_KEY = "serviceconnect_auth_session_version";
const AUTH_SESSION_VERSION = "2";

const clearStoredAuth = () => {
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
  sessionStorage.removeItem("role");
  sessionStorage.removeItem(AUTH_SESSION_VERSION_KEY);
};

const storeToken = (token) => {
  sessionStorage.removeItem("user");
  sessionStorage.removeItem("role");
  if (token) {
    sessionStorage.setItem("token", token);
    sessionStorage.setItem(AUTH_SESSION_VERSION_KEY, AUTH_SESSION_VERSION);
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const load = async () => {
      const token = sessionStorage.getItem("token");
      const authSessionVersion = sessionStorage.getItem(AUTH_SESSION_VERSION_KEY);

      if (token && authSessionVersion !== AUTH_SESSION_VERSION) {
        clearStoredAuth();
        setUser(null);
        setAuthReady(true);
        return;
      }

      if (!token) {
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("role");
        setUser(null);
        setAuthReady(true);
        return;
      }
      try {
        const res = await API.get("/users/me", { timeout: AUTH_PROFILE_TIMEOUT_MS });
        const data = res?.data?.data || res?.data || null;
        if (data) {
          setUser({ ...defaultProfile, ...data, uid: data._id || data.id, id: data._id || data.id, _id: data._id || data.id });
        } else {
          setUser(null);
          clearStoredAuth();
        }
      } catch (e) {
        setUser(null);
        clearStoredAuth();
      } finally {
        setAuthReady(true);
      }
    };
    load();
  }, []);

  const login = async (formData) => {
    const res = await API.post("/auth/login", {
      email: formData.email,
      password: formData.password,
    });
    const token = res?.data?.token || res?.token;
    const u = res?.data?.user || res?.user;
    storeToken(token);
    if (u) {
      const uid = u.id || u._id;
      const merged = { ...defaultProfile, ...u, uid, id: uid, _id: uid };
      setUser(merged);
      return merged;
    }
    const me = await API.get("/users/me", { timeout: AUTH_PROFILE_TIMEOUT_MS });
    const data = me?.data?.data || me?.data || null;
    const uid = data?._id || data?.id;
    const merged = { ...defaultProfile, ...data, uid, id: uid, _id: uid };
    setUser(merged);
    return merged;
  };

  const register = async (formData) => {
    const res = await API.post("/auth/register", {
      name: formData.name,
      email: formData.email,
      password: formData.password,
      role: formData.role || "user",
      phone: formData.phone || "Not provided",
      providerAddress: formData.providerAddress || "Not provided",
    });
    const token = res?.data?.token || res?.token;
    const u = res?.data?.user || res?.user;
    storeToken(token);
    const uid = u?.id || u?._id;
    const merged = { ...defaultProfile, ...u, uid, id: uid, _id: uid };
    setUser(merged);
    return merged;
  };

  const registerAdmin = async (formData) => {
    const res = await API.post("/auth/register-admin", {
      name: formData.name,
      email: formData.email,
      password: formData.password,
      phone: formData.phone || "Not provided",
    });
    const token = res?.data?.token || res?.token;
    const u = res?.data?.user || res?.user;
    storeToken(token);
    const uid = u?.id || u?._id;
    const merged = { ...defaultProfile, ...u, uid, id: uid, _id: uid };
    setUser(merged);
    return merged;
  };

  const logout = async () => {
    clearStoredAuth();
    setUser(null);
  };

  const resetPassword = async (email) => {
    const res = await API.post("/auth/forgot-password", { email });
    return res?.data || res || {};
  };

  const completePasswordReset = async ({ token, password }) => {
    const res = await API.post("/auth/reset-password", { token, password });
    return res?.data || res || {};
  };

  const refreshProfile = async () => {
    try {
      const res = await API.get("/users/me", { timeout: AUTH_PROFILE_TIMEOUT_MS });
      const data = res?.data?.data || res?.data || null;
      const uid = data?._id || data?.id;
      setUser({ ...defaultProfile, ...data, uid, id: uid, _id: uid });
    } catch (e) {
      console.error("refreshProfile failed", e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        login,
        register,
        registerAdmin,
        logout,
        resetPassword,
        completePasswordReset,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
