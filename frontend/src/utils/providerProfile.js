export const getEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || value.uid || "";
};

export const getServiceProviderId = (service) =>
  getEntityId(service?.providerId) ||
  getEntityId(service?.provider) ||
  getEntityId(service?.createdBy) ||
  getEntityId(service?.owner) ||
  "";

export const getLiveProviderPhoto = (service, providerProfiles = {}) => {
  const providerId = getServiceProviderId(service);
  const liveProfilePhoto = providerId ? providerProfiles?.[providerId]?.profilePhoto : "";

  return (
    liveProfilePhoto ||
    service?.providerProfilePhoto ||
    service?.providerId?.profilePhoto ||
    service?.provider?.profilePhoto ||
    service?.createdBy?.profilePhoto ||
    ""
  );
};
