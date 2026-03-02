const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getServiceSearchLocations = (service) => {
  const address = service?.address;
  const provider = service?.provider;
  const providerId = service?.providerId;
  const createdBy = service?.createdBy;

  return [
    service?.location,
    service?.city,
    service?.area,
    service?.providerLocation,
    service?.providerAddress,
    service?.provider_address,
    service?.addressLine,
    service?.providerName,
    service?.providerPhone,
    service?.provider_address_name,
    service?.address?.city,
    service?.address?.street,
    service?.address?.location,
    typeof address === "string" ? address : "",
    provider?.address,
    provider?.location,
    provider?.name,
    providerId?.providerAddress,
    providerId?.address,
    providerId?.location,
    createdBy?.address,
    createdBy?.location
  ]
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
    .map((value) => String(value));
};

const matchesAllTerms = (target, query) => {
  const normalizedTarget = normalizeSearchText(target);
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!terms.length) return true;
  return terms.every((term) => normalizedTarget.includes(term));
};

const matchesLocationQuery = (service, query) => {
  const terms = normalizeSearchText(query);
  if (!terms) return true;
  const searchable = getServiceSearchLocations(service).join(" ");
  return matchesAllTerms(searchable, terms);
};

const matchesMinRating = (serviceRating, requestedRating) => {
  const min = Number(requestedRating);
  if (!Number.isFinite(min) || min <= 0) return true;
  const rating = Number(serviceRating);
  if (!Number.isFinite(rating)) return false;
  return rating + 0.001 >= min;
};

export { normalizeSearchText, getServiceSearchLocations, matchesLocationQuery, matchesMinRating };
