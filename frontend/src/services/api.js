import axios from "axios";
import { getStoredToken } from "../utils/storedAuth";

const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
const DEFAULT_GET_TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(import.meta.env.VITE_DEFAULT_GET_TIMEOUT_MS || "", 10) || 12000
);

const API = axios.create({
  baseURL: API_BASE_URL,
});

const isPublicGetRequest = (config) => {
  const method = String(config?.method || "get").toLowerCase();
  if (method !== "get") return false;
  const rawUrl = String(config?.url || "");
  const url = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  return (
    url === "/services" ||
    url.startsWith("/services/") ||
    url.startsWith("/reviews/service/")
  );
};

API.interceptors.request.use(async (req) => {
  const method = String(req?.method || "get").toLowerCase();
  if (method === "get" && !Number.isFinite(Number(req.timeout))) {
    req.timeout = DEFAULT_GET_TIMEOUT_MS;
  }
  if (isPublicGetRequest(req)) return req;
  const token = getStoredToken();
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

API.interceptors.response.use(
  (res) => res,
  (error) => {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Request failed";
    const err = new Error(message);
    err.status = error?.response?.status;
    err.data = error?.response?.data;
    err.original = error;
    return Promise.reject(err);
  }
);

export default API;
