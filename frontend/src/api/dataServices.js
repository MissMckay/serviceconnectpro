import api from "./client";

const POLL_MS = 10000;
const CACHE_TTL_MS = 15000;
const PUBLIC_SERVICES_STORAGE_KEY = "serviceconnect:public-services-cache";
const PUBLIC_SERVICES_STORAGE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map();
const inflightRequests = new Map();
let publicDataPrewarmPromise = null;
let publicServicesSnapshotMemory = [];

function noopUnsub() {}

function getCacheKey(type, key = "") {
  return `${type}:${key}`;
}

function clearCacheByPrefix(prefix) {
  Array.from(responseCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) responseCache.delete(key);
  });
  Array.from(inflightRequests.keys()).forEach((key) => {
    if (key.startsWith(prefix)) inflightRequests.delete(key);
  });
}

function getStorage() {
  if (typeof window === "undefined") return null;
  if (typeof window.localStorage !== "undefined") return window.localStorage;
  if (typeof window.sessionStorage !== "undefined") return window.sessionStorage;
  return null;
}

function canUseStorage() {
  return Boolean(getStorage());
}

function normalizeServiceList(list) {
  return list.map((s) => ({
    _id: s._id,
    id: s._id,
    ...s,
    createdAt: s.createdAt ? new Date(s.createdAt) : null,
    thumbnailUrl: s.thumbnailUrl || (Array.isArray(s.images) && s.images[0]?.imageUrl) || null,
  }));
}

function writePublicServicesSnapshot(filters, services) {
  if (!canUseStorage() || filters && Object.keys(filters).length > 0) {
    return;
  }

  try {
    publicServicesSnapshotMemory = normalizeServiceList(Array.isArray(services) ? services : []);
    getStorage().setItem(
      PUBLIC_SERVICES_STORAGE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        services: publicServicesSnapshotMemory,
      })
    );
  } catch {
    // Ignore storage quota and serialization failures.
  }
}

function clearPublicServicesSnapshot() {
  publicServicesSnapshotMemory = [];
  if (!canUseStorage()) return;

  try {
    getStorage().removeItem(PUBLIC_SERVICES_STORAGE_KEY);
  } catch {
    // Ignore storage failures while clearing stale cache.
  }
}

export function getPublicServicesSnapshot() {
  if (publicServicesSnapshotMemory.length) {
    return publicServicesSnapshotMemory;
  }

  if (!canUseStorage()) return [];

  try {
    const raw = getStorage().getItem(PUBLIC_SERVICES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > PUBLIC_SERVICES_STORAGE_TTL_MS) {
      getStorage().removeItem(PUBLIC_SERVICES_STORAGE_KEY);
      return [];
    }

    publicServicesSnapshotMemory = normalizeServiceList(Array.isArray(parsed.services) ? parsed.services : []);
    return publicServicesSnapshotMemory;
  } catch {
    return [];
  }
}

async function getCachedOrFetch(cacheKey, fetcher, { forceFresh = false, ttlMs = CACHE_TTL_MS } = {}) {
  const now = Date.now();
  const cached = responseCache.get(cacheKey);

  if (!forceFresh && cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }

  const request = (async () => {
    const value = await fetcher();
    responseCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + ttlMs
    });
    return value;
  })().finally(() => {
    inflightRequests.delete(cacheKey);
  });

  inflightRequests.set(cacheKey, request);
  return request;
}

// ---------- Users ----------
export async function getUserProfile(uid, options = {}) {
  if (!uid) return null;
  try {
    return await getCachedOrFetch(
      getCacheKey("user", uid),
      async () => {
        const res = await api.get(`users/${uid}`);
        const d = res?.data ?? res;
        return d ? { id: d._id || d.id, _id: d._id || d.id, ...d } : null;
      },
      options
    );
  } catch {
    return null;
  }
}

export async function setUserProfile(uid, data) {
  try {
    const payload = { name: data.name, phone: data.phone, providerAddress: data.providerAddress, profilePhoto: data.profilePhoto };
    if (data.role != null) payload.role = data.role;
    await api.patch("users/me", payload);
  } catch (e) {
    throw e;
  }
}

export async function updateUserProfile(uid, data) {
  const result = await setUserProfile(uid, data);
  clearCacheByPrefix(getCacheKey("user", uid || ""));
  clearCacheByPrefix("services:");
  return result;
}

export async function deleteUserProfile(uid) {
  try {
    await api.delete(`admin/users/${uid}`);
  } catch (e) {
    throw e;
  }
}

export function subscribeUserProfile(uid, setProfile) {
  if (!uid) {
    if (setProfile) setProfile(null);
    return noopUnsub;
  }
  const fetchProfile = async () => {
    try {
      const p = await getUserProfile(uid, { forceFresh: true });
      if (setProfile) setProfile(p);
    } catch {
      if (setProfile) setProfile(null);
    }
  };
  fetchProfile();
  const id = setInterval(fetchProfile, POLL_MS);
  return () => clearInterval(id);
}

/** Subscribe to users list with optional poll interval. */
export function subscribeUsers(setData, pollMs = 5000) {
  const fetchUsers = async () => {
    try {
      const res = await api.get("admin/users");
      const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
      const normalized = list.map((u) => ({
        _id: u._id || u.id,
        id: u._id || u.id,
        ...u,
        createdAt: u.createdAt ? new Date(u.createdAt) : null,
        updatedAt: u.updatedAt ? new Date(u.updatedAt) : null,
      }));
      if (setData) setData(normalized);
    } catch {
      if (setData) setData([]);
    }
  };
  fetchUsers();
  const id = setInterval(fetchUsers, pollMs);
  return () => clearInterval(id);
}

// ---------- Services ----------
export function servicesRef() {
  return null;
}

export async function getServices(filters = {}) {
  const options = filters?.__options || {};
  const normalizedFilters = {};
  if (filters.category && filters.category !== "All") normalizedFilters.category = filters.category;
  if (filters.minPrice != null && filters.minPrice !== "") normalizedFilters.minPrice = filters.minPrice;
  if (filters.maxPrice != null && filters.maxPrice !== "") normalizedFilters.maxPrice = filters.maxPrice;
  if (filters.location && String(filters.location).trim()) normalizedFilters.location = filters.location;
  const params = new URLSearchParams();
  if (normalizedFilters.category) params.set("category", normalizedFilters.category);
  if (normalizedFilters.minPrice != null) params.set("minPrice", normalizedFilters.minPrice);
  if (normalizedFilters.maxPrice != null) params.set("maxPrice", normalizedFilters.maxPrice);
  if (normalizedFilters.location) params.set("location", normalizedFilters.location);
  const q = params.toString();
  const path = `services${q ? `?${q}` : ""}`;
  return getCachedOrFetch(
    getCacheKey("services", q),
    async () => {
      const res = await api.get(path);
      const payload = res?.data ?? res;
      const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      const normalizedList = normalizeServiceList(list);
      writePublicServicesSnapshot(normalizedFilters, normalizedList);
      return normalizedList;
    },
    options
  );
}

export function prewarmPublicData() {
  if (!publicDataPrewarmPromise) {
    publicDataPrewarmPromise = getServices().catch(() => null);
  }
  return publicDataPrewarmPromise;
}

export function subscribeServices(filters, setData) {
  const normalizedFilters = {
    category: filters?.category,
    minPrice: filters?.minPrice,
    maxPrice: filters?.maxPrice,
    location: filters?.location,
  };
  const hasActiveFilters = Object.values(normalizedFilters).some((value) => value != null && value !== "" && value !== "All");

  if (!hasActiveFilters) {
    const cachedSnapshot = getPublicServicesSnapshot();
    if (cachedSnapshot.length && setData) {
      setData(cachedSnapshot);
    }
  }

  const fetchList = async (forceFresh = false) => {
    try {
      const list = await getServices({ ...(filters || {}), __options: { forceFresh } });
      if (setData) setData(list);
    } catch {
      if (setData) setData([]);
    }
  };
  fetchList(false);
  const id = setInterval(() => fetchList(true), POLL_MS);
  return () => clearInterval(id);
}

export async function getServiceById(id, options = {}) {
  if (!id) return null;
  try {
    return await getCachedOrFetch(
      getCacheKey("service", id),
      async () => {
        const res = await api.get(`services/${id}`);
        const payload = res?.data ?? res;
        const s = payload?.data ?? payload;
        return s ? { _id: s._id, id: s._id, ...s, createdAt: s.createdAt ? new Date(s.createdAt) : null } : null;
      },
      options
    );
  } catch {
    return null;
  }
}

export async function createService(providerId, data) {
  const priceNum = Number(data.price);
  const price = Number.isFinite(priceNum) ? priceNum : 0;
  const body = {
    serviceName: String(data.serviceName ?? "").trim(),
    category: String(data.category ?? "").trim(),
    description: String(data.description ?? "").trim(),
    price,
    availabilityStatus: String(data.availabilityStatus || "Available"),
    images: Array.isArray(data.images) ? data.images.slice(0, 10) : [],
    providerName: data.providerName ?? "",
    providerAddress: data.providerAddress ?? "",
    providerProfilePhoto: data.providerProfilePhoto ?? "",
  };
  const res = await api.post("services", body);
  clearCacheByPrefix("services:");
  clearPublicServicesSnapshot();
  const payload = res?.data ?? res;
  const service = payload?.data ?? payload;
  return { serviceId: service?._id || service?.id, imagesSkipped: false };
}

export async function updateService(serviceId, data) {
  const body = {};
  if (data.serviceName != null) body.serviceName = data.serviceName;
  if (data.category != null) body.category = data.category;
  if (data.description != null) body.description = data.description;
  if (data.price != null) body.price = Number(data.price);
  if (data.availabilityStatus != null) body.availabilityStatus = data.availabilityStatus;
  if (data.images != null) body.images = Array.isArray(data.images) ? data.images.slice(0, 10) : [];
  if (data.providerProfilePhoto != null) body.providerProfilePhoto = data.providerProfilePhoto;
  await api.put(`services/${serviceId}`, body);
  clearCacheByPrefix("services:");
  clearCacheByPrefix(getCacheKey("service", serviceId));
  clearPublicServicesSnapshot();
}

export async function deleteService(serviceId) {
  await api.delete(`services/${serviceId}`);
  clearCacheByPrefix("services:");
  clearCacheByPrefix(getCacheKey("service", serviceId));
  clearPublicServicesSnapshot();
}

// ---------- Bookings ----------
export function bookingsRef() {
  return null;
}

export async function getBookingsByUser(userId) {
  try {
    const res = await api.get("bookings/user");
    const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
    return list.map((b) => ({
      _id: b._id,
      id: b._id,
      ...b,
      createdAt: b.createdAt ? new Date(b.createdAt) : null,
      bookingDate: b.bookingDate ? new Date(b.bookingDate) : null,
    }));
  } catch {
    return [];
  }
}

export function subscribeBookingsByUser(userId, setData) {
  const fetchList = async () => {
    try {
      const list = await getBookingsByUser(userId);
      if (setData) setData(list);
    } catch {
      if (setData) setData([]);
    }
  };
  fetchList();
  const id = setInterval(fetchList, POLL_MS);
  return () => clearInterval(id);
}

export async function getBookingsByProvider(providerId) {
  try {
    const res = await api.get("bookings/provider");
    const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
    return list.map((b) => ({
      _id: b._id,
      id: b._id,
      ...b,
      createdAt: b.createdAt ? new Date(b.createdAt) : null,
      bookingDate: b.bookingDate ? new Date(b.bookingDate) : null,
    }));
  } catch {
    return [];
  }
}

export function subscribeBookingsByProvider(providerId, setData) {
  const fetchList = async () => {
    try {
      const list = await getBookingsByProvider(providerId);
      if (setData) setData(list);
    } catch {
      if (setData) setData([]);
    }
  };
  fetchList();
  const id = setInterval(fetchList, POLL_MS);
  return () => clearInterval(id);
}

export async function createBooking(userId, data) {
  const res = await api.post("bookings", {
    serviceId: data.serviceId,
    bookingDate: data.bookingDate instanceof Date ? data.bookingDate.toISOString() : data.bookingDate,
  });
  const b = res?.data ?? res;
  return b._id || b.id;
}

export async function updateBookingStatus(bookingId, status) {
  await api.put(`bookings/${bookingId}`, { status });
}

export async function getBookingById(bookingId) {
  try {
    const res = await api.get(`bookings/${bookingId}`);
    const b = res?.data ?? res;
    return b
      ? {
          _id: b._id,
          id: b._id,
          ...b,
          createdAt: b.createdAt ? new Date(b.createdAt) : null,
          bookingDate: b.bookingDate ? new Date(b.bookingDate) : null,
        }
      : null;
  } catch {
    return null;
  }
}

// ---------- Conversations & Messages ----------
export async function getOrCreateConversation(myId, otherId) {
  try {
    const res = await api.get(`messages/get-or-create-conversation?otherId=${encodeURIComponent(otherId)}`);
    const c = res?.data ?? res;
    return c
      ? {
          _id: c._id,
          id: c._id,
          ...c,
          lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt) : null,
          createdAt: c.createdAt ? new Date(c.createdAt) : null,
        }
      : null;
  } catch (e) {
    throw e;
  }
}

export async function getConversations(userId) {
  try {
    const res = await api.get("messages/conversations");
    const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
    return list.map((c) => ({
      _id: c._id,
      id: c._id,
      ...c,
      lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt) : null,
      createdAt: c.createdAt ? new Date(c.createdAt) : null,
    }));
  } catch {
    return [];
  }
}

export function subscribeConversations(userId, setData) {
  const fetchList = async () => {
    try {
      const list = await getConversations(userId);
      if (setData) setData(list);
    } catch {
      if (setData) setData([]);
    }
  };
  fetchList();
  const id = setInterval(fetchList, POLL_MS);
  return () => clearInterval(id);
}

export async function getMessages(conversationId) {
  try {
    const res = await api.get(`messages/conversations/${conversationId}/messages`);
    const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
    return list.map((m) => ({
      _id: m._id,
      id: m._id,
      ...m,
      createdAt: m.createdAt ? new Date(m.createdAt) : null,
    }));
  } catch {
    return [];
  }
}

export function subscribeMessages(conversationId, setData) {
  if (!conversationId) {
    if (setData) setData([]);
    return noopUnsub;
  }
  const fetchList = async () => {
    try {
      const list = await getMessages(conversationId);
      if (setData) setData(list);
    } catch {
      if (setData) setData([]);
    }
  };
  fetchList();
  const id = setInterval(fetchList, POLL_MS);
  return () => clearInterval(id);
}

export async function sendMessage(conversationId, senderId, text) {
  const res = await api.post("messages", {
    conversationId,
    text: String(text).trim(),
  });
  const m = res?.data ?? res;
  return m._id || m.id;
}

// ---------- Reviews ----------
export async function getReviewsByService(serviceId) {
  try {
    const res = await api.get(`reviews/service/${serviceId}`);
    const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
    return list.map((r) => ({
      _id: r._id,
      id: r._id,
      ...r,
      createdAt: r.createdAt ? new Date(r.createdAt) : null,
    }));
  } catch {
    return [];
  }
}

export async function createReview(data) {
  await api.post("reviews", {
    bookingId: data.bookingId,
    rating: data.rating,
    comment: data.comment ?? "",
  });
  return null;
}

export async function getReviewByBookingAndUser(bookingId, userId) {
  try {
    const res = await api.get(`reviews/booking/${bookingId}`);
    const r = res?.data ?? res;
    return r ? { _id: r._id, id: r._id, ...r, createdAt: r.createdAt ? new Date(r.createdAt) : null } : null;
  } catch {
    return null;
  }
}

// ---------- Admin invite codes ----------
export async function createAdminInviteCode(createdByUid) {
  const res = await api.post("admin-invite-codes", {});
  const d = res?.data ?? res;
  return d?.code ?? d?.id ?? null;
}

export async function getAdminInviteCode(codeId) {
  try {
    const res = await api.get(`admin-invite-codes/${codeId}`);
    const d = res?.data ?? res;
    return d
      ? {
          id: d.id ?? d.code,
          ...d,
          createdAt: d.createdAt ? new Date(d.createdAt) : null,
        }
      : null;
  } catch {
    return null;
  }
}

export async function markAdminInviteCodeUsed(codeId, uid) {
  await api.patch(`admin-invite-codes/${codeId}/used`, { uid });
}

/** Fetch admin invite codes list once (for immediate refetch after creating a new code). */
export async function getAdminInviteCodesList() {
  try {
    const res = await api.get("admin-invite-codes");
    const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
    return list.map((d) => ({
      id: d.id ?? d.code,
      code: d.code ?? d.id,
      createdBy: d.createdBy,
      createdAt: d.createdAt ? new Date(d.createdAt) : null,
      usedBy: d.usedBy ?? null,
      usedAt: d.usedAt ? new Date(d.usedAt) : null,
    }));
  } catch {
    return [];
  }
}

/** Subscribe to admin invite codes with optional poll interval (default 2s for real-time updates). */
export function subscribeAdminInviteCodes(createdByUid, setData, pollMs = 2000) {
  const fetchList = async () => {
    try {
      const res = await api.get("admin-invite-codes");
      const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
      const normalized = list.map((d) => ({
        id: d.id ?? d.code,
        code: d.code ?? d.id,
        createdBy: d.createdBy,
        createdAt: d.createdAt ? new Date(d.createdAt) : null,
        usedBy: d.usedBy ?? null,
        usedAt: d.usedAt ? new Date(d.usedAt) : null,
      }));
      if (setData) setData(normalized);
    } catch {
      if (setData) setData([]);
    }
  };
  fetchList();
  const id = setInterval(fetchList, pollMs);
  return () => clearInterval(id);
}
