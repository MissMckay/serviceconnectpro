import api from "./client";

const POLL_MS = 10000;
const CACHE_TTL_MS = 15000;
const PUBLIC_SERVICES_STORAGE_KEY = "serviceconnect:public-services-cache";
const PUBLIC_SERVICES_STORAGE_TTL_MS = 5 * 60 * 1000;
const PUBLIC_SERVICES_TIMEOUT_MS = 3000;
const MAX_SERVICE_IMAGE_COUNT = 7;
const MAX_PROVIDER_AVATAR_BYTES = 80 * 1024;
const responseCache = new Map();
const inflightRequests = new Map();
let publicDataPrewarmPromise = null;
let publicServicesSnapshotMemory = [];

function noopUnsub() {}

function createWindowAwarePoller(fetcher, pollMs) {
  const canListen =
    typeof window !== "undefined" && typeof document !== "undefined";

  let intervalId = null;

  const stopPolling = () => {
    if (intervalId == null) return;
    clearInterval(intervalId);
    intervalId = null;
  };

  const startPolling = () => {
    if (!Number.isFinite(Number(pollMs)) || Number(pollMs) <= 0 || intervalId != null) {
      return;
    }

    if (canListen && document.visibilityState === "hidden") {
      return;
    }

    intervalId = setInterval(() => {
      if (canListen && document.visibilityState === "hidden") return;
      fetcher(true);
    }, Number(pollMs));
  };

  const handleRefresh = () => {
    fetcher(true);
    startPolling();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      handleRefresh();
    } else {
      stopPolling();
    }
  };

  fetcher(false);
  startPolling();

  if (canListen) {
    window.addEventListener("focus", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  return () => {
    stopPolling();
    if (!canListen) return;
    window.removeEventListener("focus", handleRefresh);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

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

function getApproxBytes(value) {
  return new Blob([String(value || "")]).size;
}

function normalizeProviderAvatar(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:") && getApproxBytes(trimmed) > MAX_PROVIDER_AVATAR_BYTES) {
    return "";
  }
  return trimmed;
}

function normalizeServiceList(list) {
  return list.map((s) => ({
    _id: s._id,
    id: s._id,
    ...s,
    createdAt: s.createdAt ? new Date(s.createdAt) : null,
    thumbnailUrl:
      (Array.isArray(s.images) && (s.images[0]?.thumbnailUrl || s.images[0]?.imageUrl)) ||
      s.thumbnailUrl ||
      null,
    providerProfilePhoto: normalizeProviderAvatar(s.providerProfilePhoto),
  }));
}

function extractServicesPayload(payload) {
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const pagination = payload?.pagination || payload?.meta || {};
  return { list, pagination };
}

function normalizeServiceFilters(filters = {}) {
  const rawCategory = filters?.category ?? filters?.selectedCategory;
  const rawLocation = filters?.location;
  const rawMinPrice = filters?.minPrice;
  const rawMaxPrice = filters?.maxPrice;
  const rawProviderId = filters?.providerId;

  const category =
    typeof rawCategory === "string" && rawCategory.trim() && rawCategory.trim() !== "All"
      ? rawCategory.trim()
      : undefined;
  const location =
    typeof rawLocation === "string" && rawLocation.trim()
      ? rawLocation.trim()
      : undefined;
  const providerId =
    typeof rawProviderId === "string" && rawProviderId.trim()
      ? rawProviderId.trim()
      : undefined;

  let minPrice =
    rawMinPrice != null && rawMinPrice !== "" && Number.isFinite(Number(rawMinPrice))
      ? Number(rawMinPrice)
      : undefined;
  let maxPrice =
    rawMaxPrice != null && rawMaxPrice !== "" && Number.isFinite(Number(rawMaxPrice))
      ? Number(rawMaxPrice)
      : undefined;

  if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  return {
    category,
    location,
    providerId,
    minPrice,
    maxPrice
  };
}

function buildServicesQuery(normalizedFilters = {}, options = {}) {
  const params = new URLSearchParams();
  if (normalizedFilters.category) params.set("category", normalizedFilters.category);
  if (normalizedFilters.minPrice != null) params.set("minPrice", normalizedFilters.minPrice);
  if (normalizedFilters.maxPrice != null) params.set("maxPrice", normalizedFilters.maxPrice);
  if (normalizedFilters.location) params.set("location", normalizedFilters.location);
  if (normalizedFilters.providerId) params.set("providerId", normalizedFilters.providerId);
  const defaultLimit = normalizedFilters.providerId ? 50 : 24;
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : defaultLimit;
  params.set("limit", String(Math.min(Math.max(Math.trunc(limit), 1), 100)));
  return params.toString();
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
    try {
      const value = await fetcher();
      responseCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + ttlMs
      });
      return value;
    } catch (error) {
      if (cached) return cached.value;
      throw error;
    }
  })().finally(() => {
    inflightRequests.delete(cacheKey);
  });

  inflightRequests.set(cacheKey, request);
  return request;
}

async function fetchInBatches(items, batchSize, fetchItem) {
  const results = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map((item) => fetchItem(item)));
    results.push(...batchResults);
  }

  return results;
}

async function fetchServicesCollection(normalizedFilters, { onFirstPage, allPages = false, limit, timeoutMs } = {}) {
  const baseQuery = buildServicesQuery(normalizedFilters, { limit });
  const requestTimeoutMs = Number.isFinite(Number(timeoutMs))
    ? Number(timeoutMs)
    : PUBLIC_SERVICES_TIMEOUT_MS;

  const fetchPage = async (page) => {
    const pageParams = new URLSearchParams(baseQuery);
    pageParams.set("page", String(page));
    const res = await api.get(`services?${pageParams.toString()}`, {
      timeoutMs: requestTimeoutMs,
    });
    return res?.data ?? res;
  };

  const firstPayload = await fetchPage(1);
  const { list: firstList, pagination } = extractServicesPayload(firstPayload);
  const normalizedFirstList = normalizeServiceList(firstList);

  if (typeof onFirstPage === "function") {
    onFirstPage(normalizedFirstList, pagination);
  }

  if (!allPages) {
    return normalizedFirstList;
  }

  const totalPages = Math.max(
    Number.parseInt(pagination?.totalPages, 10) || 1,
    pagination?.hasNextPage ? 2 : 1
  );

  if (totalPages <= 1) {
    return normalizedFirstList;
  }

  const remainingPages = Array.from(
    { length: Math.max(0, totalPages - 1) },
    (_, index) => index + 2
  );

  const remainingPayloads =
    remainingPages.length > 0
      ? await fetchInBatches(remainingPages, 3, fetchPage)
      : [];

  return normalizeServiceList([
    ...firstList,
    ...remainingPayloads.flatMap((payload) => extractServicesPayload(payload).list),
  ]);
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
  const fetchProfile = async (forceFresh = true) => {
    try {
      const p = await getUserProfile(uid, { forceFresh });
      if (setProfile) setProfile(p);
    } catch {
      if (setProfile) setProfile(null);
    }
  };
  return createWindowAwarePoller(fetchProfile, POLL_MS);
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
  return createWindowAwarePoller(fetchUsers, pollMs);
}

// ---------- Services ----------
export function servicesRef() {
  return null;
}

export async function getServices(filters = {}) {
  const options = filters?.__options || {};
  const normalizedFilters = normalizeServiceFilters(filters);
  const baseQuery = buildServicesQuery(normalizedFilters, options);
  return getCachedOrFetch(
    getCacheKey("services", baseQuery),
    async () => {
      const normalizedList = await fetchServicesCollection(normalizedFilters, {
        allPages: options.allPages === true,
        limit: options.limit,
        timeoutMs: options.timeoutMs,
      });
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

export function subscribeServices(filters, setData, options = {}) {
  const normalizedFilters = normalizeServiceFilters(filters);
  const baseQuery = buildServicesQuery(normalizedFilters, options);
  const cacheKey = getCacheKey("services", baseQuery);
  const hasActiveFilters = Object.values(normalizedFilters).some(
    (value) => value != null && value !== "" && value !== "All"
  );
  const pollMs =
    options.pollMs === 0
      ? 0
      : Number.isFinite(Number(options.pollMs))
        ? Number(options.pollMs)
        : POLL_MS;

  if (!hasActiveFilters) {
    const cachedSnapshot = getPublicServicesSnapshot();
    if (cachedSnapshot.length && setData) {
      setData(cachedSnapshot);
    }
  }

  const fetchList = async (forceFresh = false) => {
    try {
      if (!forceFresh) {
        const cached = responseCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          if (setData) setData(cached.value);
          return;
        }
      }

      const list = await fetchServicesCollection(normalizedFilters, {
        onFirstPage(firstPageList) {
          if (setData) setData(firstPageList);
          writePublicServicesSnapshot(normalizedFilters, firstPageList);
        },
        allPages: options.allPages === true,
        limit: options.limit,
        timeoutMs: options.timeoutMs,
      });

      responseCache.set(cacheKey, {
        value: list,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      if (setData) setData(list);
    } catch {
      if (setData) setData([]);
    }
  };
  const canListenForRefresh = typeof window !== "undefined";

  const handleRefresh = () => {
    fetchList(true);
  };

  if (canListenForRefresh) {
    window.addEventListener("services:updated", handleRefresh);
  }

  const cleanupPolling = createWindowAwarePoller(fetchList, pollMs);

  return () => {
    cleanupPolling();
    if (!canListenForRefresh) return;
    window.removeEventListener("services:updated", handleRefresh);
  };
}

export async function getServiceById(id, options = {}) {
  if (!id) return null;
  try {
    return await getCachedOrFetch(
      getCacheKey("service", id),
      async () => {
        const res = await api.get(`services/${id}`, {
          timeoutMs: Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 5000,
        });
        const payload = res?.data ?? res;
        const s = payload?.data ?? payload;
        return s
          ? {
              _id: s._id,
              id: s._id,
              ...s,
              providerProfilePhoto: normalizeProviderAvatar(s.providerProfilePhoto),
              createdAt: s.createdAt ? new Date(s.createdAt) : null,
            }
          : null;
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
    images: Array.isArray(data.images) ? data.images.slice(0, MAX_SERVICE_IMAGE_COUNT) : [],
    providerName: data.providerName ?? "",
    providerAddress: data.providerAddress ?? "",
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
  if (data.images != null) body.images = Array.isArray(data.images) ? data.images.slice(0, MAX_SERVICE_IMAGE_COUNT) : [];
  if (data.providerName != null) body.providerName = data.providerName;
  if (data.providerAddress != null) body.providerAddress = data.providerAddress;
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
  return createWindowAwarePoller(fetchList, POLL_MS);
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
  return createWindowAwarePoller(fetchList, POLL_MS);
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

export async function cancelBooking(bookingId) {
  await api.put(`bookings/cancel/${bookingId}`, {});
}

export async function deleteBooking(bookingId) {
  await api.delete(`bookings/${bookingId}`);
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
    return await getCachedOrFetch(
      getCacheKey("conversation-link", [myId || "me", otherId || ""].join(":")),
      async () => {
        const res = await api.get(`messages/get-or-create-conversation?otherId=${encodeURIComponent(otherId)}`);
        const payload = res?.data ?? res;
        const c = payload?.data ?? payload;
        return c
          ? {
              _id: c._id,
              id: c._id,
              ...c,
              lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt) : null,
              createdAt: c.createdAt ? new Date(c.createdAt) : null,
            }
          : null;
      },
      { ttlMs: 30000 }
    );
  } catch (e) {
    throw e;
  }
}

export async function getConversations(userId, options = {}) {
  try {
    return await getCachedOrFetch(
      getCacheKey("conversations", userId || "me"),
      async () => {
        const res = await api.get("messages/conversations");
        const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
        return list.map((c) => ({
          _id: c._id,
          id: c._id,
          ...c,
          lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt) : null,
          createdAt: c.createdAt ? new Date(c.createdAt) : null,
        }));
      },
      { ttlMs: 10000, ...options }
    );
  } catch {
    return [];
  }
}

export function subscribeConversations(userId, setData) {
  const cacheKey = getCacheKey("conversations", userId || "me");
  const fetchList = async () => {
    try {
      const list = await getConversations(userId, { forceFresh: true });
      if (setData) setData(list);
    } catch {
      if (setData) setData([]);
    }
  };
  const cached = responseCache.get(cacheKey);
  if (cached?.value && setData) {
    setData(cached.value);
  }
  return createWindowAwarePoller(fetchList, 8000);
}

export async function getMessages(conversationId, options = {}) {
  try {
    return await getCachedOrFetch(
      getCacheKey("messages", conversationId),
      async () => {
        const res = await api.get(`messages/conversations/${conversationId}/messages`);
        const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
        return list.map((m) => ({
          _id: m._id,
          id: m._id,
          ...m,
          createdAt: m.createdAt ? new Date(m.createdAt) : null,
        }));
      },
      { ttlMs: 5000, ...options }
    );
  } catch {
    return [];
  }
}

export function subscribeMessages(conversationId, setData) {
  if (!conversationId) {
    if (setData) setData([]);
    return noopUnsub;
  }
  const cacheKey = getCacheKey("messages", conversationId);
  const fetchList = async () => {
    try {
      const list = await getMessages(conversationId, { forceFresh: true });
      if (setData) setData(list);
    } catch {
      if (setData) setData([]);
    }
  };
  const cached = responseCache.get(cacheKey);
  if (cached?.value && setData) {
    setData(cached.value);
  }
  return createWindowAwarePoller(fetchList, 5000);
}

export async function sendMessage(conversationId, senderId, text, options = {}) {
  const body = {
    text: String(text).trim(),
  };
  if (conversationId) body.conversationId = conversationId;
  if (options?.recipientId) body.recipientId = options.recipientId;
  const res = await api.post("messages", body);
  clearCacheByPrefix(getCacheKey("messages", conversationId));
  clearCacheByPrefix("conversations:");
  const payload = res?.data ?? res;
  const m = payload?.data ?? payload;
  return m
    ? {
        _id: m._id || m.id,
        id: m._id || m.id,
        ...m,
        createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
      }
    : null;
}

// ---------- Reviews ----------
export async function getReviewsByService(serviceId) {
  if (!serviceId) return [];
  try {
    return await getCachedOrFetch(
      getCacheKey("reviews", serviceId),
      async () => {
        const res = await api.get(`reviews/service/${serviceId}`);
        const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
        return list.map((r) => ({
          _id: r._id,
          id: r._id,
          ...r,
          createdAt: r.createdAt ? new Date(r.createdAt) : null,
        }));
      }
    );
  } catch {
    return [];
  }
}

export async function createReview(data) {
  const res = await api.post("reviews", {
    bookingId: data.bookingId,
    rating: data.rating,
    comment: data.comment ?? "",
  });
  clearCacheByPrefix(getCacheKey("reviews", data.serviceId || ""));
  clearCacheByPrefix("services:");
  const payload = res?.data ?? res;
  return payload?.data ?? payload ?? null;
}

export async function getReviewByBookingAndUser(bookingId, userId) {
  try {
    const res = await api.get(`reviews/booking/${bookingId}`);
    const r = Object.prototype.hasOwnProperty.call(res || {}, "data") ? res.data : res;
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
  return createWindowAwarePoller(fetchList, pollMs);
}
