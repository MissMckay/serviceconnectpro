const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
const DEFAULT_GET_TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(import.meta.env.VITE_DEFAULT_GET_TIMEOUT_MS || "", 10) || 12000
);

async function getToken() {
  return sessionStorage.getItem("token");
}

export async function apiRequest(path, options = {}) {
  const token = await getToken();
  const url = path.startsWith("http") ? path : `${BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const method = String(options.method || "GET").toUpperCase();
  const timeoutMs =
    Number.isFinite(Number(options.timeoutMs))
      ? Math.max(0, Number(options.timeoutMs))
      : method === "GET"
        ? DEFAULT_GET_TIMEOUT_MS
        : 0;
  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
  const headers = {
    "Content-Type": "application/json",
    ...fetchOptions.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller =
    timeoutMs > 0 && !fetchOptions.signal ? new AbortController() : null;
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
    : null;

  let res;
  try {
    res = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller?.signal || fetchOptions.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const err = new Error(`Request took longer than ${timeoutMs}ms`);
      err.status = 408;
      err.code = "REQUEST_TIMEOUT";
      throw err;
    }
    throw error;
  } finally {
    if (timeoutId != null) globalThis.clearTimeout(timeoutId);
  }

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
  get: (path, options = {}) => apiRequest(path, { method: "GET", ...options }),
  post: (path, body, options = {}) => apiRequest(path, { method: "POST", body: body ? JSON.stringify(body) : undefined, ...options }),
  patch: (path, body, options = {}) => apiRequest(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined, ...options }),
  put: (path, body, options = {}) => apiRequest(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined, ...options }),
  delete: (path, options = {}) => apiRequest(path, { method: "DELETE", ...options }),
};

export default api;
