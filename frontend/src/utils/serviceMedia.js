import { getLiveProviderPhoto } from "./providerProfile";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

export const normalizeUrl = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed) return "";
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return `${API_ORIGIN}${trimmed}`.replace(/([^:]\/)\/+/g, "$1");
  }
  const normalizedPath = trimmed.startsWith("uploads/") ? trimmed : `uploads/${trimmed}`;
  return `${API_ORIGIN}/${normalizedPath}`.replace(/([^:]\/)\/+/g, "$1");
};

const pushMedia = (items, url, description = "") => {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return;
  items.push({
    url: normalizedUrl,
    description: typeof description === "string" ? description.trim() : ""
  });
};

const getDescriptionValue = (entry) =>
  entry?.description ||
  entry?.imageDescription ||
  entry?.mediaDescription ||
  entry?.photoDescription ||
  entry?.desc ||
  entry?.caption ||
  entry?.alt ||
  entry?.altText ||
  "";

const getProviderPhotoCandidates = (service) =>
  [
    service?.providerProfilePhoto,
    service?.providerId?.profilePhoto,
    service?.provider?.profilePhoto,
    service?.createdBy?.profilePhoto,
  ]
    .map((value) => normalizeUrl(value))
    .filter(Boolean);

const pickServiceThumbnail = (service) => {
  const providerPhotoCandidates = new Set(getProviderPhotoCandidates(service));
  const imageEntries = Array.isArray(service?.images) ? service.images : [];

  for (const entry of imageEntries) {
    if (!entry || typeof entry !== "object") continue;

    const normalizedThumb = normalizeUrl(entry.thumbnailUrl || entry.thumbUrl || "");
    if (normalizedThumb && !providerPhotoCandidates.has(normalizedThumb)) {
      return normalizedThumb;
    }
  }

  const normalizedStoredThumb = normalizeUrl(service?.thumbnailUrl || "");
  if (normalizedStoredThumb && !providerPhotoCandidates.has(normalizedStoredThumb)) {
    return normalizedStoredThumb;
  }

  for (const entry of imageEntries) {
    if (typeof entry === "string") {
      const normalizedImage = normalizeUrl(entry);
      if (normalizedImage && !providerPhotoCandidates.has(normalizedImage)) {
        return normalizedImage;
      }
      continue;
    }

    const normalizedImage = normalizeUrl(
      entry?.imageUrl ||
        entry?.url ||
        entry?.image ||
        entry?.src ||
        entry?.path ||
        entry?.imageURL ||
        entry?.fileUrl
    );
    if (normalizedImage && !providerPhotoCandidates.has(normalizedImage)) {
      return normalizedImage;
    }
  }

  return "";
};

export const getServiceMedia = (service) => {
  const items = [];

  // Backend format: images: [{ imageUrl, caption }]
  const imagesList = service?.images;
  if (Array.isArray(imagesList) && imagesList.length > 0) {
    imagesList.forEach((entry) => {
      if (typeof entry === "string") {
        pushMedia(items, entry, "");
        return;
      }
      const raw =
        entry?.imageUrl ??
        entry?.url ??
        entry?.image ??
        entry?.src ??
        entry?.path ??
        entry?.imageURL ??
        entry?.fileUrl ??
        entry?.publicUrl ??
        entry?.secure_url;
      const url = raw != null && typeof raw === "string" ? raw.trim() : String(raw || "").trim();
      if (url) pushMedia(items, url, getDescriptionValue(entry));
    });
  }

  const objectLists = [service?.imageDetails, service?.media, service?.photos];
  objectLists.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((entry) => {
      if (typeof entry === "string") {
        pushMedia(items, entry, "");
        return;
      }
      pushMedia(
        items,
        entry?.url ||
          entry?.image ||
          entry?.src ||
          entry?.path ||
          entry?.imageUrl ||
          entry?.imageURL ||
          entry?.fileUrl ||
          entry?.publicUrl ||
          entry?.secure_url,
        getDescriptionValue(entry)
      );
    });
  });

  const mixedLists = [service?.serviceImages, service?.gallery];
  mixedLists.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((entry) => {
      if (typeof entry === "string") {
        pushMedia(items, entry, "");
      } else {
        pushMedia(
          items,
          entry?.url ||
            entry?.image ||
            entry?.src ||
            entry?.path ||
            entry?.imageUrl ||
            entry?.imageURL ||
            entry?.fileUrl ||
            entry?.publicUrl ||
            entry?.secure_url,
          getDescriptionValue(entry)
        );
      }
    });
  });

  [
    service?.images?.[0]?.thumbnailUrl,
    service?.thumbnailUrl,
    service?.image,
    service?.serviceImage,
    service?.thumbnail,
    service?.photo,
  ].forEach(
    (single) => pushMedia(items, single, "")
  );

  const deduped = [];
  const seen = new Set();
  items.forEach((item) => {
    const key = item.url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(item);
  });

  return deduped.slice(0, 7);
};

export const getServiceImageUrls = (service, max = 10) =>
  getServiceMedia(service)
    .slice(0, max)
    .map((item) => item.url);

/** First image URL for card display. Uses thumbnailUrl first (saved on create/update), then images[0], then getServiceMedia. */
export function getFirstServiceImageUrl(service) {
  const prioritizedThumbnail = pickServiceThumbnail(service);
  if (prioritizedThumbnail) return prioritizedThumbnail;

  const thumb =
    service?.firstImageUrl ||
    service?.serviceImage ||
    service?.thumbnail ||
    service?.image ||
    service?.photo;
  if (thumb && typeof thumb === "string" && thumb.trim()) return normalizeUrl(thumb.trim()) || thumb.trim();

  const media = getServiceMedia(service);
  if (media.length > 0 && media[0]?.url) return media[0].url;
  return "";
}

export function getMarketplaceCardMedia(service, providerProfiles = {}) {
  return {
    serviceImageUrl: getFirstServiceImageUrl(service),
    providerPhotoUrl: normalizeUrl(getLiveProviderPhoto(service, providerProfiles)),
    mediaCount: getServiceMedia(service).length,
  };
}
