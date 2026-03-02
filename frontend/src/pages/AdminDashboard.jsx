import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API from "../services/api";
import { getServiceMedia } from "../utils/serviceMedia";

const allowedSections = new Set(["overview", "users", "services", "reports"]);

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

  const [activeSection, setActiveSection] = useState(() => getSectionFromSearch(location.search));
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
      setUsers([]);
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
    refreshUsers();
    refreshServices();
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [usersFilters.search, usersFilters.role, usersFilters.status, usersFilters.approved]);

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
    await Promise.all([refreshUsers(), refreshServices()]);
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
      let success = false;
      const requests = [
        () => API.put(`/admin/users/${userId}/status`, { accountStatus }),
        () => API.patch(`/admin/users/${userId}/status`, { accountStatus })
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

      if (!success) throw new Error("status-update-failed");
      await refreshAllAdminTables();
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

    if (!window.confirm(`Delete user "${user?.name || user?.email || userId}"?`)) return;

    setBusyActionId(`${userId}-delete`);
    try {
      await API.delete(`/admin/users/${userId}`);
      await refreshAllAdminTables();
      showSuccess("User deleted.");
    } catch (err) {
      showError(
        err?.response?.data?.message ||
          "Unable to delete this user. Backend may enforce suspension-only safe deletion."
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
        user,
        details: {
          ...payload,
          bookingsCount,
          reviewsCount
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
                      {users.length === 0 ? (
                        <tr><td colSpan="8" className="admin-empty-row">No users found.</td></tr>
                      ) : users.map((user) => {
                        const userId = user?._id || user?.id;
                        const isProvider = normalizeText(user?.role) === "provider";
                        const status = normalizeText(user?.accountStatus) || "active";
                        return (
                          <tr key={userId}>
                            <td>{user?.name || "N/A"}</td><td>{user?.email || "N/A"}</td><td>{user?.phone || "N/A"}</td><td>{user?.role || "N/A"}</td><td>{status}</td><td>{getBooleanLabel(user?.isApproved)}</td><td>{formatDate(user?.createdAt)}</td>
                            <td>
                              <div className="admin-inline-actions">
                                <button type="button" className="admin-action-btn suspend-btn" onClick={() => runUserStatusAction(userId, "suspended")} disabled={getUserBusy(userId, "status-suspended")}>Suspend</button>
                                <button type="button" className="admin-action-btn activate-btn" onClick={() => runUserStatusAction(userId, "active")} disabled={getUserBusy(userId, "status-active")}>Activate</button>
                                {isProvider && <button type="button" className="admin-action-btn approve-btn" onClick={() => handleProviderApproval(userId, "approve")} disabled={getUserBusy(userId, "approve")}>Approve Provider</button>}
                                {isProvider && <button type="button" className="admin-action-btn reject-btn" onClick={() => handleProviderApproval(userId, "reject")} disabled={getUserBusy(userId, "reject")}>Reject Provider</button>}
                                <button type="button" className="admin-action-btn" onClick={() => openUserDetails(user)}>View Details</button>
                                <button type="button" className="admin-action-btn remove-btn" onClick={() => deleteUser(user)} disabled={getUserBusy(userId, "delete")}>Delete User</button>
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
                <h3>User Details</h3>
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
