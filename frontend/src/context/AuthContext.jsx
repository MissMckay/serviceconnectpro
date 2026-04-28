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
const AUTH_STORAGE_KEY = "token";

const getAvailableStorages = () => {
  const storages = [];
  if (typeof window === "undefined") return storages;
  if (typeof window.localStorage !== "undefined") storages.push(window.localStorage);
  if (typeof window.sessionStorage !== "undefined") storages.push(window.sessionStorage);
  return storages;
};

const getStoredToken = () => {
  for (const storage of getAvailableStorages()) {
    const token = storage.getItem(AUTH_STORAGE_KEY);
    if (token) {
      return {
        token,
        version: storage.getItem(AUTH_SESSION_VERSION_KEY),
        storage,
      };
    }
  }
  return { token: "", version: "", storage: null };
};

const clearStoredAuth = () => {
  getAvailableStorages().forEach((storage) => {
    storage.removeItem("token");
    storage.removeItem("user");
    storage.removeItem("role");
    storage.removeItem(AUTH_SESSION_VERSION_KEY);
  });
};

const storeToken = (token, rememberMe = false) => {
  clearStoredAuth();
  const targetStorage =
    typeof window !== "undefined" && rememberMe && typeof window.localStorage !== "undefined"
      ? window.localStorage
      : typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
        ? window.sessionStorage
        : null;

  if (!targetStorage) return;

  targetStorage.removeItem("user");
  targetStorage.removeItem("role");
  if (token) {
    targetStorage.setItem("token", token);
    targetStorage.setItem(AUTH_SESSION_VERSION_KEY, AUTH_SESSION_VERSION);
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { token, version: authSessionVersion } = getStoredToken();

      if (token && authSessionVersion !== AUTH_SESSION_VERSION) {
        clearStoredAuth();
        setUser(null);
        setAuthReady(true);
        return;
      }

      if (!token) {
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
      identifier: formData.identifier || formData.email || formData.phone,
      password: formData.password,
    });
    const token = res?.data?.token || res?.token;
    const u = res?.data?.user || res?.user;
    storeToken(token, Boolean(formData.rememberMe));
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
    storeToken(token, Boolean(formData.rememberMe));
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
    storeToken(token, Boolean(formData.rememberMe));
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

  const requestLoginOtp = async ({ identifier }) => {
    const res = await API.post("/auth/request-login-otp", { identifier });
    return res?.data || res || {};
  };

  const verifyLoginOtp = async ({ identifier, otp, rememberMe }) => {
    const res = await API.post("/auth/verify-login-otp", { identifier, otp });
    const token = res?.data?.token || res?.token;
    const u = res?.data?.user || res?.user;
    storeToken(token, Boolean(rememberMe));
    if (u) {
      const uid = u.id || u._id;
      const merged = { ...defaultProfile, ...u, uid, id: uid, _id: uid };
      setUser(merged);
      return merged;
    }
    return null;
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
        requestLoginOtp,
        verifyLoginOtp,
        completePasswordReset,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
