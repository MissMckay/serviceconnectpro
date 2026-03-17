const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

async function getToken() {
  return sessionStorage.getItem("token");
}

export async function apiRequest(path, options = {}) {
  const token = await getToken();
  const url = path.startsWith("http") ? path : `${BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    ...options,
    headers,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.message || res.statusText || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => apiRequest(path, { method: "GET" }),
  post: (path, body) => apiRequest(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: (path, body) => apiRequest(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: (path, body) => apiRequest(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: (path) => apiRequest(path, { method: "DELETE" }),
};

export default api;
