import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

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

async function getToken() {
  return sessionStorage.getItem("token");
}

API.interceptors.request.use(async (req) => {
  if (isPublicGetRequest(req)) return req;
  const token = await getToken();
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
