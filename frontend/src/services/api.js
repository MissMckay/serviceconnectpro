import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

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

API.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");
  if (token && !isPublicGetRequest(req)) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

export default API;
