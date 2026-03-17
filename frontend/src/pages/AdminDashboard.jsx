import { useEffect, useMemo, useState, useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API from "../services/api";
import { AuthContext } from "../context/AuthContext";
import { createAdminInviteCode, getAdminInviteCodesList, subscribeAdminInviteCodes, updateUserProfile, deleteUserProfile, getUserProfile, subscribeUsers } from "../firebase/firestoreServices";
import { getServiceMedia } from "../utils/serviceMedia";

const allowedSections = new Set(["overview", "users", "services", "reports", "create-admin"]);

const getSectionFromSearch = (search) => {
  const view = new URLSearchParams(search).get("view");
  return allowedSections.has(view) ? view : "overview";
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const formatDate = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
};

const getArrayPayload = (response) => {
  const data = response?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.users)) return data.users;
  if (Array.isArray(data?.services)) return data.services;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

const getNumberFromData = (data, keys) => {
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
};

const extractMeta = (response) => {
  const data = response?.data || {};
  const meta = data?.meta || data?.pagination || {};

  const page = getNumberFromData(meta, ["page", "currentPage"]) || getNumberFromData(data, ["page", "currentPage"]);
  const totalPages =
    getNumberFromData(meta, ["totalPages", "pages"]) || getNumberFromData(data, ["totalPages", "pages"]);
  const total =
    getNumberFromData(meta, ["total", "count", "totalCount"]) ||
    getNumberFromData(data, ["total", "count", "totalCount"]);

  return {
    page: page || 1,
    totalPages: totalPages || 1,
    total: total || 0
  };
};

const getProviderFromService = (service) => {
  const provider = service?.providerId || service?.provider || service?.createdBy || {};
  return {
    id: provider?._id || provider?.id || service?.providerId?._id || service?.providerId || "",
    name: provider?.name || service?.providerName || "N/A",
    phone: provider?.phone || service?.providerPhone || "N/A",
    address:
      provider?.providerAddress ||
      provider?.address ||
      provider?.location ||
      service?.providerAddress ||
      service?.providerLocation ||
      "N/A"
  };
};

const getFirstSuccessfulGet = async (requests) => {
  for (const request of requests) {
    try {
      const response = await API.get(request.path, request.config || {});
      return response;
    } catch {
      // Try next endpoint.
    }
  }
  return null;
};

const getBooleanLabel = (value) => (value === true ? "Yes" : "No");

const AdminDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [activeSection, setActiveSection] = useState(() => getSectionFromSearch(location.search));
  const [adminInviteCodes, setAdminInviteCodes] = useState([]);
  const [adminInviteLoading, setAdminInviteLoading] = useState(false);
  const [adminInviteError, setAdminInviteError] = useState("");
  const [users, setUsers] = useState([]);
  const [services, setServices] = useState([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isServicesLoading, setIsServicesLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ type: "", message: "" });
  const [removedServicesCount, setRemovedServicesCount] = useState(0);
  const [busyActionId, setBusyActionId] = useState("");
  const [usersFilters, setUsersFilters] = useState({
    search: "",
    role: "all",
    status: "all",
    approved: "all"
  });
  const [serviceFilters, setServiceFilters] = useState({
    search: "",
    category: "all",
    providerId: "",
    status: "all",
    page: 1,
    limit: 10
  });
  const [servicePagination, setServicePagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0
  });
  const [detailsModal, setDetailsModal] = useState({
    open: false,
    loading: false,
    user: null,
    details: null
  });

  useEffect(() => {
    setActiveSection(getSectionFromSearch(location.search));
  }, [location.search]);

  useEffect(() => {
    if (!toast.message) return undefined;
    const timer = setTimeout(() => {
      setToast({ type: "", message: "" });
    }, 2500);
    return () => clearTimeout(timer);
  }, [toast.message]);

  useEffect(() => {
    if (activeSection !== "create-admin" || !user?.uid) {
      setAdminInviteCodes([]);
      return;
    }
    const unsub = subscribeAdminInviteCodes(user.uid, setAdminInviteCodes, 2000);
    return () => { if (typeof unsub === "function") unsub(); };
  }, [activeSection, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    setIsUsersLoading(true);
    const unsub = subscribeUsers((list) => {
      setUsers(list);
      setIsUsersLoading(false);
    }, 2000);
    return () => { if (typeof unsub === "function") unsub(); };
  }, [user?.uid]);

  const showSuccess = (message) => setToast({ type: "success", message });
  const showError = (message) => setToast({ type: "error", message });

  const refreshUsers = async () => {
    setIsUsersLoading(true);
    setError("");

    const params = {
      search: usersFilters.search || undefined,
      role: usersFilters.role !== "all" ? usersFilters.role : undefined,
      status: usersFilters.status !== "all" ? usersFilters.status : undefined,
      approved:
        usersFilters.approved === "all"
          ? undefined
          : usersFilters.approved === "approved"
            ? true
            : false
    };

    try {
      const response = await getFirstSuccessfulGet([
        { path: "/admin/users", config: { params } },
        { path: "/auth/users" }
      ]);

      if (!response) {
        throw new Error("users-fetch-failed");
      }

      const nextUsers = getArrayPayload(response);
      setUsers(nextUsers);
    } catch {
      setError("Unable to load admin users.");
    } finally {
      setIsUsersLoading(false);
    }
  };

  const refreshServices = async () => {
    setIsServicesLoading(true);
    setError("");

    const params = {
      search: serviceFilters.search || undefined,
      category: serviceFilters.category !== "all" ? serviceFilters.category : undefined,
      providerId: serviceFilters.providerId || undefined,
      status: serviceFilters.status !== "all" ? serviceFilters.status : undefined,
      page: serviceFilters.page,
      limit: serviceFilters.limit
    };

    try {
      const response = await getFirstSuccessfulGet([
        { path: "/admin/services", config: { params } },
        { path: "/services" }
      ]);

      if (!response) {
        throw new Error("services-fetch-failed");
      }

      let nextServices = getArrayPayload(response);
      const meta = extractMeta(response);

      if (response.config?.url === "/services") {
        const search = normalizeText(serviceFilters.search);
        nextServices = nextServices.filter((service) => {
          const provider = getProviderFromService(service);
          const matchesSearch =
            !search ||
            normalizeText(service?.serviceName).includes(search) ||
            normalizeText(service?.category).includes(search) ||
            normalizeText(provider.name).includes(search);
          const matchesCategory =
            serviceFilters.category === "all" ||
            normalizeText(service?.category) === normalizeText(serviceFilters.category);
          const matchesStatus =
            serviceFilters.status === "all" ||
            normalizeText(service?.availabilityStatus) === normalizeText(serviceFilters.status);
          const matchesProvider =
            !serviceFilters.providerId || String(provider.id) === String(serviceFilters.providerId);
          return matchesSearch && matchesCategory && matchesStatus && matchesProvider;
        });

        const total = nextServices.length;
        const totalPages = Math.max(1, Math.ceil(total / serviceFilters.limit));
        const safePage = Math.min(Math.max(1, serviceFilters.page), totalPages);
        const start = (safePage - 1) * serviceFilters.limit;
        nextServices = nextServices.slice(start, start + serviceFilters.limit);
        setServicePagination({ page: safePage, totalPages, total });
      } else {
        setServicePagination({
          page: meta.page || serviceFilters.page,
          totalPages: meta.totalPages || 1,
          total: meta.total || nextServices.length
        });
      }

      setServices(nextServices);
    } catch {
      setServices([]);
      setServicePagination({ page: 1, totalPages: 1, total: 0 });
      setError("Unable to load admin services.");
    } finally {
      setIsServicesLoading(false);
    }
  };

  useEffect(() => {
    refreshServices();
  }, []);

  const filteredUsers = useMemo(() => {
    const search = normalizeText(usersFilters.search);
    const roleFilter = usersFilters.role !== "all" ? normalizeText(usersFilters.role) : "";
    const statusFilter = usersFilters.status !== "all" ? normalizeText(usersFilters.status) : "";
    const approvedFilter = usersFilters.approved === "all" ? null : usersFilters.approved === "approved";
    return users.filter((u) => {
      const matchesSearch =
        !search ||
        normalizeText(u?.name).includes(search) ||
        normalizeText(u?.email).includes(search) ||
        normalizeText(u?.phone).includes(search);
      const matchesRole = !roleFilter || normalizeText(u?.role) === roleFilter;
      const status = normalizeText(u?.accountStatus) || "active";
      const matchesStatus = !statusFilter || status === statusFilter;
      const matchesApproved =
        approvedFilter === null ||
        (approvedFilter === true && (u?.isApproved === true || normalizeText(u?.approvalStatus) === "approved")) ||
        (approvedFilter === false && u?.isApproved !== true && normalizeText(u?.approvalStatus) !== "approved");
      return matchesSearch && matchesRole && matchesStatus && matchesApproved;
    });
  }, [users, usersFilters.search, usersFilters.role, usersFilters.status, usersFilters.approved]);

  useEffect(() => {
    refreshServices();
  }, [
    serviceFilters.search,
    serviceFilters.category,
    serviceFilters.providerId,
    serviceFilters.status,
    serviceFilters.page,
    serviceFilters.limit
  ]);

  const refreshAllAdminTables = async () => {
    await refreshServices();
  };

  const usersSummary = useMemo(() => {
    const totalUsers = users.length;
    const totalProviders = users.filter((user) => normalizeText(user?.role) === "provider").length;
    const pendingProviders = users.filter(
      (user) => normalizeText(user?.role) === "provider" && user?.isApproved !== true
    ).length;
    const suspendedUsers = users.filter((user) => normalizeText(user?.accountStatus) === "suspended").length;
    return {
      totalUsers,
      totalProviders,
      pendingProviders,
      suspendedUsers
    };
  }, [users]);

  const reportsSummary = useMemo(
    () => ({
      ...usersSummary,
      totalServices: servicePagination.total || services.length,
      removedServices: removedServicesCount
    }),
    [usersSummary, servicePagination.total, services.length, removedServicesCount]
  );

  const reportMetrics = useMemo(() => {
    const providerBase = reportsSummary.totalProviders || 0;
    const userBase = reportsSummary.totalUsers || 0;
    const providerApprovalRate = providerBase
      ? Math.round(((providerBase - reportsSummary.pendingProviders) / providerBase) * 100)
      : 0;
    const suspensionRate = userBase ? Math.round((reportsSummary.suspendedUsers / userBase) * 100) : 0;

    return {
      providerApprovalRate,
      suspensionRate
    };
  }, [reportsSummary]);

  const userRoleOptions = useMemo(
    () =>
      ["all", "user", "provider", "admin"].map((role) => (
        <option key={`role-${role}`} value={role}>
          {role === "all" ? "All Roles" : role}
        </option>
      )),
    []
  );

  const serviceCategoryOptions = useMemo(() => {
    const categories = Array.from(
      new Set(
        services
          .map((service) => String(service?.category || "").trim())
          .filter((category) => category.length > 0)
      )
    );
    return ["all", ...categories];
  }, [services]);

  const runUserStatusAction = async (userId, accountStatus) => {
    setBusyActionId(`${userId}-status-${accountStatus}`);
    try {
      let apiSuccess = false;
      const requests = [
        () => API.put(`/admin/users/${userId}/status`, { accountStatus }),
        () => API.patch(`/admin/users/${userId}/status`, { accountStatus })
      ];
      for (const request of requests) {
        try {
          await request();
          apiSuccess = true;
          break;
        } catch {
          // Try next endpoint.
        }
      }
      try {
        await updateUserProfile(userId, { accountStatus });
      } catch (e) {
        if (!apiSuccess) throw new Error("status-update-failed");
      }
      showSuccess(`User ${accountStatus}.`);
    } catch (err) {
      showError(err?.response?.data?.message || "Unable to update account status.");
    } finally {
      setBusyActionId("");
    }
  };

  const handleProviderApproval = async (providerId, actionType) => {
    const actionId = `${providerId}-${actionType}`;
    setBusyActionId(actionId);
    const isApprove = actionType === "approve";

    const primaryPath = isApprove
      ? `/admin/providers/${providerId}/approve`
      : `/admin/providers/${providerId}/reject`;
    const fallbackPayload = isApprove
      ? { isApproved: true, accountStatus: "active" }
      : { isApproved: false, accountStatus: "suspended" };

    try {
      let success = false;
      const requests = [
        () => API.put(primaryPath, fallbackPayload),
        () => API.patch(primaryPath, fallbackPayload),
        () => API.patch(`/admin/providers/${providerId}`, fallbackPayload)
      ];

      for (const request of requests) {
        try {
          await request();
          success = true;
          break;
        } catch {
          // Try next endpoint.
        }
      }

      if (!success) throw new Error("provider-approval-failed");
      try {
        await updateUserProfile(providerId, isApprove
          ? { isApproved: true, approvalStatus: "approved", accountStatus: "active" }
          : { isApproved: false, approvalStatus: "rejected", accountStatus: "suspended" });
      } catch (firestoreErr) {
        console.warn("Firestore profile update (provider approval):", firestoreErr);
      }
      await refreshAllAdminTables();
      showSuccess(isApprove ? "Provider approved." : "Provider rejected.");
    } catch (err) {
      showError(err?.response?.data?.message || "Unable to update provider approval.");
    } finally {
      setBusyActionId("");
    }
  };

  const deleteUser = async (user) => {
    const userId = user?._id || user?.id;
    if (!userId) return;

    if (!window.confirm(`Delete user "${user?.name || user?.email || userId}"? This cannot be undone.`)) return;

    setBusyActionId(`${userId}-delete`);
    try {
      try {
        await API.delete(`/admin/users/${userId}`);
      } catch (apiErr) {
        await deleteUserProfile(userId);
      }
      showSuccess("User deleted.");
    } catch (err) {
      showError(
        err?.response?.data?.message ||
          "Unable to delete this user."
      );
    } finally {
      setBusyActionId("");
    }
  };

  const openUserDetails = async (user) => {
    const userId = user?._id || user?.id;
    if (!userId) return;

    setDetailsModal({
      open: true,
      loading: true,
      user,
      details: null
    });

    try {
      const response = await getFirstSuccessfulGet([
        { path: `/admin/users/${userId}` },
        { path: `/admin/users/${userId}/details` }
      ]);

      const payload = response?.data?.data || response?.data?.user || response?.data || {};
      const bookingsCount =
        payload?.bookingsCount || payload?.bookingCount || payload?.counts?.bookings || user?.bookingsCount || 0;
      const reviewsCount =
        payload?.reviewsCount || payload?.reviewCount || payload?.counts?.reviews || user?.reviewsCount || 0;

      setDetailsModal({
        open: true,
        loading: false,
        user: { ...user, ...payload },
        details: { ...payload, bookingsCount, reviewsCount }
      });
    } catch {
      try {
        const profile = await getUserProfile(userId);
        const merged = profile ? { ...user, ...profile } : user;
        setDetailsModal({
          open: true,
          loading: false,
          user: merged,
          details: {
            ...profile,
            bookingsCount: user?.bookingsCount || 0,
            reviewsCount: user?.reviewsCount || 0
          }
        });
      } catch {
        setDetailsModal({
          open: true,
          loading: false,
          user,
          details: {
            bookingsCount: user?.bookingsCount || 0,
            reviewsCount: user?.reviewsCount || 0
          }
        });
      }
    }
  };

  const closeUserDetails = () =>
    setDetailsModal({
      open: false,
      loading: false,
      user: null,
      details: null
    });

  const removeService = async (service) => {
    const serviceId = service?._id || service?.id;
    if (!serviceId) return;
    if (!window.confirm(`Remove service "${service?.serviceName || serviceId}"?`)) return;

    setBusyActionId(`${serviceId}-remove`);
    try {
      let success = false;
      const requests = [
        () => API.delete(`/admin/services/${serviceId}`),
        () => API.delete(`/services/${serviceId}`)
      ];
      for (const request of requests) {
        try {
          await request();
          success = true;
          break;
        } catch {
          // Try next endpoint.
        }
      }
      if (!success) throw new Error("service-delete-failed");
      setRemovedServicesCount((prev) => prev + 1);
      await refreshServices();
      showSuccess("Service removed.");
    } catch (err) {
      showError(err?.response?.data?.message || "Unable to remove service.");
    } finally {
      setBusyActionId("");
    }
  };

  const suspendProviderFromService = async (service) => {
    const provider = getProviderFromService(service);
    if (!provider.id) {
      showError("No provider ID available for this service.");
      return;
    }
    if (!window.confirm(`Suspend provider "${provider.name}"?`)) return;
    await runUserStatusAction(provider.id, "suspended");
  };

  const getUserBusy = (userId, suffix) => busyActionId === `${userId}-${suffix}`;

  return (
    <div className="admin-dashboard-page">
      <div className="admin-dashboard-shell">
        {toast.message && (
          <div
            className={`admin-toast ${toast.type === "error" ? "admin-toast-error" : "admin-toast-success"}`}
            role="status"
            aria-live="polite"
          >
            {toast.message}
          </div>
        )}

        {error && <p className="admin-error">{error}</p>}

        {activeSection === "overview" && (
          <section className="admin-grid admin-grid-overview">
            <article className="admin-card">
              <h2 className="admin-card-title">Admin Dashboard</h2>
              <p className="admin-subtitle">Overview is a live operations snapshot for day-to-day moderation.</p>
              <div className="admin-report-strip">
                <div className="admin-metric"><p>Total Users</p><strong>{reportsSummary.totalUsers}</strong></div>
                <div className="admin-metric"><p>Total Providers</p><strong>{reportsSummary.totalProviders}</strong></div>
                <div className="admin-metric"><p>Pending Providers</p><strong>{reportsSummary.pendingProviders}</strong></div>
                <div className="admin-metric"><p>Suspended Users</p><strong>{reportsSummary.suspendedUsers}</strong></div>
                <div className="admin-metric"><p>Total Services</p><strong>{reportsSummary.totalServices}</strong></div>
                <div className="admin-metric"><p>Removed Services</p><strong>{reportsSummary.removedServices}</strong></div>
              </div>
            </article>
          </section>
        )}

        {activeSection === "users" && (
          <section className="admin-grid">
            <article className="admin-card">
              <h2 className="admin-card-title">Manage Users</h2>
              <div className="admin-filters">
                <input type="search" placeholder="Search by name/email/phone" value={usersFilters.search} onChange={(event) => setUsersFilters((prev) => ({ ...prev, search: event.target.value }))} />
                <select value={usersFilters.role} onChange={(event) => setUsersFilters((prev) => ({ ...prev, role: event.target.value }))}>{userRoleOptions}</select>
                <select value={usersFilters.status} onChange={(event) => setUsersFilters((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="all">All Statuses</option><option value="active">Active</option><option value="suspended">Suspended</option>
                </select>
                <select value={usersFilters.approved} onChange={(event) => setUsersFilters((prev) => ({ ...prev, approved: event.target.value }))}>
                  <option value="all">All Approval</option><option value="approved">Approved</option><option value="pending">Not Approved</option>
                </select>
                <button type="button" className="admin-action-btn" onClick={refreshUsers} disabled={isUsersLoading}>Refresh</button>
              </div>

              {isUsersLoading ? <p>Loading users...</p> : (
                <div className="admin-table-wrap">
                  <table className="admin-table admin-users-table">
                    <thead>
                      <tr>
                        <th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Account Status</th><th>Approved</th><th>Created At</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 ? (
                        <tr><td colSpan="8" className="admin-empty-row">No users found.</td></tr>
                      ) : filteredUsers.map((user) => {
                        const userId = user?._id || user?.id;
                        const isProvider = normalizeText(user?.role) === "provider";
                        const status = normalizeText(user?.accountStatus) || "active";
                        const isApproved = user?.isApproved === true || normalizeText(user?.approvalStatus) === "approved";
                        const isPendingProvider = isProvider && !isApproved;
                        const isSuspended = status === "suspended";
                        return (
                          <tr key={userId}>
                            <td>{user?.name || "N/A"}</td><td>{user?.email || "N/A"}</td><td>{user?.phone || "N/A"}</td><td>{user?.role || "N/A"}</td><td>{status}</td><td>{getBooleanLabel(user?.isApproved)}</td><td>{formatDate(user?.createdAt)}</td>
                            <td>
                              <div className="admin-inline-actions">
                                <button type="button" className="admin-action-btn view-profile-btn" onClick={() => openUserDetails(user)}>View profile</button>
                                {isPendingProvider && (
                                  <>
                                    <button type="button" className="admin-action-btn approve-btn" onClick={() => handleProviderApproval(userId, "approve")} disabled={getUserBusy(userId, "approve")}>Accept</button>
                                    <button type="button" className="admin-action-btn reject-btn" onClick={() => handleProviderApproval(userId, "reject")} disabled={getUserBusy(userId, "reject")}>Reject</button>
                                  </>
                                )}
                                <button type="button" className="admin-action-btn suspend-btn" onClick={() => runUserStatusAction(userId, "suspended")} disabled={getUserBusy(userId, "status-suspended") || isSuspended}>Suspend</button>
                                <button type="button" className="admin-action-btn activate-btn" onClick={() => runUserStatusAction(userId, "active")} disabled={getUserBusy(userId, "status-active") || !isSuspended}>Activate</button>
                                <button type="button" className="admin-action-btn remove-btn" onClick={() => deleteUser(user)} disabled={getUserBusy(userId, "delete")}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        )}

        {activeSection === "services" && (
          <section className="admin-grid">
            <article className="admin-card">
              <h2 className="admin-card-title">Manage Services</h2>
              <div className="admin-filters">
                <input type="search" placeholder="Search by service/provider" value={serviceFilters.search} onChange={(event) => setServiceFilters((prev) => ({ ...prev, search: event.target.value, page: 1 }))} />
                <select value={serviceFilters.category} onChange={(event) => setServiceFilters((prev) => ({ ...prev, category: event.target.value, page: 1 }))}>
                  {serviceCategoryOptions.map((category) => (<option key={`category-${category}`} value={category}>{category === "all" ? "All Categories" : category}</option>))}
                </select>
                <input type="text" placeholder="Provider ID" value={serviceFilters.providerId} onChange={(event) => setServiceFilters((prev) => ({ ...prev, providerId: event.target.value, page: 1 }))} />
                <select value={serviceFilters.status} onChange={(event) => setServiceFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))}>
                  <option value="all">All Statuses</option><option value="available">Available</option><option value="unavailable">Unavailable</option>
                </select>
                <button type="button" className="admin-action-btn" onClick={refreshServices} disabled={isServicesLoading}>Refresh</button>
              </div>

              {isServicesLoading ? <p>Loading services...</p> : (
                <>
                  <div className="admin-table-wrap">
                    <table className="admin-table admin-services-table">
                      <thead>
                        <tr>
                          <th>Service Name</th><th>Provider Name</th><th>Provider Phone</th><th>Provider Address</th><th>Category</th><th>Price</th><th>Created At</th><th>Availability Status</th><th>Images Count</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {services.length === 0 ? (
                          <tr><td colSpan="10" className="admin-empty-row">No services found.</td></tr>
                        ) : services.map((service) => {
                          const serviceId = service?._id || service?.id;
                          const provider = getProviderFromService(service);
                          const imageCount = getServiceMedia(service).length;
                          return (
                            <tr key={serviceId}>
                              <td>{service?.serviceName || "N/A"}</td><td>{provider.name}</td><td>{provider.phone}</td><td>{provider.address}</td><td>{service?.category || "N/A"}</td><td>{Number.isFinite(Number(service?.price)) ? `$${Number(service.price).toLocaleString("en-US")}` : "N/A"}</td><td>{formatDate(service?.createdAt)}</td><td>{service?.availabilityStatus || "N/A"}</td><td>{imageCount}</td>
                              <td>
                                <div className="admin-inline-actions">
                                  <button type="button" className="admin-action-btn" onClick={() => navigate(`/services/${serviceId}`)}>View</button>
                                  <button type="button" className="admin-action-btn remove-btn" onClick={() => removeService(service)} disabled={busyActionId === `${serviceId}-remove`}>Remove Service</button>
                                  <button type="button" className="admin-action-btn suspend-btn" onClick={() => suspendProviderFromService(service)}>Suspend Provider</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="admin-pagination">
                    <button type="button" className="admin-action-btn" onClick={() => setServiceFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))} disabled={servicePagination.page <= 1}>Prev</button>
                    <span>Page {servicePagination.page} of {servicePagination.totalPages}</span>
                    <button type="button" className="admin-action-btn" onClick={() => setServiceFilters((prev) => ({ ...prev, page: Math.min(servicePagination.totalPages, prev.page + 1) }))} disabled={servicePagination.page >= servicePagination.totalPages}>Next</button>
                  </div>
                </>
              )}
            </article>
          </section>
        )}

        {activeSection === "create-admin" && (
          <section className="admin-grid">
            <article className="admin-card">
              <h2 className="admin-card-title">Create admin accounts</h2>
              <p className="admin-subtitle">Generate one-time invite links. Share each link with the person who should become an admin. They open the link, create their account, then sign in at <strong>Admin login</strong>. You can create as many admins as you need; the list below updates in real time.</p>
              {adminInviteError && <p className="admin-error">{adminInviteError}</p>}
              <div style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={adminInviteLoading || !user?.uid}
                  onClick={async () => {
                    setAdminInviteError("");
                    setAdminInviteLoading(true);
                    try {
                      await createAdminInviteCode(user.uid);
                      const list = await getAdminInviteCodesList();
                      setAdminInviteCodes(list);
                      showSuccess("Invite link created. It appears in the list below.");
                    } catch (e) {
                      setAdminInviteError(e?.message || "Failed to generate invite link.");
                    } finally {
                      setAdminInviteLoading(false);
                    }
                  }}
                >
                  {adminInviteLoading ? "Generating…" : "Generate another admin invite link"}
                </button>
              </div>
              <div style={{ marginTop: "1.5rem" }}>
                <h3 style={{ marginBottom: "0.75rem", fontSize: "1rem" }}>Invite links (updates in real time)</h3>
                {adminInviteCodes.length === 0 ? (
                  <p className="admin-empty-row">No invite links yet. Click the button above to generate one.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Link</th>
                          <th>Status</th>
                          <th>Created</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminInviteCodes.map((row) => {
                          const base = typeof window !== "undefined" ? window.location.origin : "";
                          const link = `${base}/register-admin?code=${row.code}`;
                          const used = !!row.usedBy;
                          const created = row.createdAt ? formatDate(row.createdAt) : "—";
                          return (
                            <tr key={row.id}>
                              <td>
                                <input
                                  type="text"
                                  readOnly
                                  value={link}
                                  style={{ width: "100%", maxWidth: "320px", padding: "6px 8px", fontSize: "13px", boxSizing: "border-box" }}
                                  onFocus={(e) => e.target.select()}
                                />
                              </td>
                              <td>
                                <span style={{ color: used ? "#6b7280" : "#059669", fontWeight: 500 }}>
                                  {used ? "Used" : "Pending"}
                                </span>
                              </td>
                              <td>{created}</td>
                              <td>
                                <button
                                  type="button"
                                  className="admin-action-btn"
                                  disabled={used}
                                  onClick={() => {
                                    navigator.clipboard.writeText(link);
                                    showSuccess("Link copied to clipboard.");
                                  }}
                                >
                                  Copy
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </article>
          </section>
        )}

        {activeSection === "reports" && (
          <section className="admin-grid admin-grid-overview">
            <article className="admin-card">
              <h2 className="admin-card-title">Reports Summary</h2>
              <p className="admin-subtitle">Report Summary is KPI-focused for trend reviews and stakeholder reporting.</p>
              <div className="admin-report-strip">
                <div className="admin-metric"><p>Total Users</p><strong>{reportsSummary.totalUsers}</strong></div>
                <div className="admin-metric"><p>Total Providers</p><strong>{reportsSummary.totalProviders}</strong></div>
                <div className="admin-metric"><p>Pending Providers</p><strong>{reportsSummary.pendingProviders}</strong></div>
                <div className="admin-metric"><p>Suspended Users</p><strong>{reportsSummary.suspendedUsers}</strong></div>
                <div className="admin-metric"><p>Total Services</p><strong>{reportsSummary.totalServices}</strong></div>
                <div className="admin-metric"><p>Removed Services</p><strong>{reportsSummary.removedServices}</strong></div>
                <div className="admin-metric"><p>Provider Approval Rate</p><strong>{reportMetrics.providerApprovalRate}%</strong></div>
                <div className="admin-metric"><p>User Suspension Rate</p><strong>{reportMetrics.suspensionRate}%</strong></div>
              </div>
            </article>
          </section>
        )}

        {detailsModal.open && (
          <div className="admin-modal-backdrop" role="presentation" onClick={closeUserDetails}>
            <div className="admin-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="admin-modal-header">
                <h3>User profile</h3>
                <button type="button" className="admin-action-btn" onClick={closeUserDetails}>Close</button>
              </div>
              {detailsModal.loading ? <p>Loading profile...</p> : (
                <div className="admin-modal-content">
                  <p><strong>Name:</strong> {detailsModal.user?.name || "N/A"}</p>
                  <p><strong>Email:</strong> {detailsModal.user?.email || "N/A"}</p>
                  <p><strong>Phone:</strong> {detailsModal.user?.phone || "N/A"}</p>
                  <p><strong>Role:</strong> {detailsModal.user?.role || "N/A"}</p>
                  <p><strong>Account Status:</strong> {detailsModal.user?.accountStatus || "active"}</p>
                  <p><strong>Approved:</strong> {getBooleanLabel(detailsModal.user?.isApproved)}</p>
                  <p><strong>Created At:</strong> {formatDate(detailsModal.user?.createdAt)}</p>
                  <p><strong>Address:</strong> {detailsModal.user?.providerAddress || detailsModal.user?.address || "N/A"}</p>
                  <p><strong>Bookings Count:</strong> {detailsModal.details?.bookingsCount || 0}</p>
                  <p><strong>Reviews Count:</strong> {detailsModal.details?.reviewsCount || 0}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
