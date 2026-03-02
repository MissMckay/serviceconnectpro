const normalizeText = (value) => String(value || "").trim().toLowerCase();

export const getAccountStatus = (user) => {
  const status = normalizeText(user?.accountStatus || user?.status || "");
  if (status === "suspended") return "suspended";
  if (status === "active") return "active";
  return "active";
};

export const isProviderApproved = (user) => {
  if (user?.isApproved === true) return true;
  const approvalStatus = normalizeText(user?.approvalStatus);
  return approvalStatus === "approved";
};

export const canProviderCreateServices = (user) => {
  const role = normalizeText(user?.role);
  return role === "provider" && isProviderApproved(user) && getAccountStatus(user) === "active";
};

export const getProviderAccessMessage = (user) => {
  if (normalizeText(user?.role) !== "provider") {
    return "Only provider accounts can add services.";
  }
  if (!isProviderApproved(user)) {
    return "Pending admin approval.";
  }
  if (getAccountStatus(user) !== "active") {
    return "Your account is suspended. Contact admin to reactivate.";
  }
  return "";
};
