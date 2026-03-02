const API_BASE = "/api/admin";
const TOKEN_KEY = "admin_jwt_token";

const authPanel = document.getElementById("authPanel");
const appShell = document.getElementById("appShell");
const tokenInput = document.getElementById("tokenInput");
const saveTokenBtn = document.getElementById("saveTokenBtn");
const authError = document.getElementById("authError");
const appError = document.getElementById("appError");
const pageTitle = document.getElementById("pageTitle");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");

const usersTableBody = document.getElementById("usersTableBody");
const servicesTableBody = document.getElementById("servicesTableBody");
const reportCards = document.getElementById("reportCards");
const toast = document.getElementById("toast");
const userModal = document.getElementById("userModal");
const userDetailsContent = document.getElementById("userDetailsContent");
const closeUserModal = document.getElementById("closeUserModal");

const userSearch = document.getElementById("userSearch");
const userRoleFilter = document.getElementById("userRoleFilter");
const userStatusFilter = document.getElementById("userStatusFilter");
const userApprovedFilter = document.getElementById("userApprovedFilter");
const applyUserFilters = document.getElementById("applyUserFilters");

const serviceSearch = document.getElementById("serviceSearch");
const serviceCategoryFilter = document.getElementById("serviceCategoryFilter");
const serviceProviderFilter = document.getElementById("serviceProviderFilter");
const serviceStatusFilter = document.getElementById("serviceStatusFilter");
const applyServiceFilters = document.getElementById("applyServiceFilters");

let currentPage = "users";
let jwtToken = localStorage.getItem(TOKEN_KEY) || "";
let currentUsers = [];
let currentServices = [];

const showToast = (message, type = "ok") => {
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = "toast";
  }, 2200);
};

const showError = (message) => {
  appError.textContent = message || "";
};

const formatDate = (value) => (value ? new Date(value).toLocaleString() : "-");

const formatMoney = (value) => {
  return Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
};

const qs = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      query.set(key, value);
    }
  });
  const text = query.toString();
  return text ? `?${text}` : "";
};

const apiRequest = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwtToken}`,
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || `Request failed (${response.status})`;
    if (response.status === 401 || response.status === 403) {
      resetAuth(message);
    }
    throw new Error(message);
  }

  return data;
};

const resetAuth = (message) => {
  localStorage.removeItem(TOKEN_KEY);
  jwtToken = "";
  appShell.classList.add("hidden");
  authPanel.classList.remove("hidden");
  authError.textContent = message || "Session expired. Please provide token.";
};

const switchPage = (page) => {
  currentPage = page;
  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active", section.id === `${page}Page`);
  });
  pageTitle.textContent = page === "users" ? "Manage Users" : "Manage Services";
};

const roleSelectId = (userId) => `role-select-${userId}`;

const renderUsers = (users = []) => {
  currentUsers = users;
  usersTableBody.innerHTML = users.map((user) => `
    <tr>
      <td>${user.name || "-"}</td>
      <td>${user.email || "-"}</td>
      <td>${user.phone || "-"}</td>
      <td>${user.role || "-"}</td>
      <td>
        <span class="status-pill ${user.accountStatus === "active" ? "pill-ok" : "pill-danger"}">
          ${user.accountStatus || "active"}
        </span>
      </td>
      <td>
        <span class="status-pill ${user.isApproved ? "pill-ok" : "pill-warn"}">
          ${user.isApproved ? "true" : "false"}
        </span>
      </td>
      <td>${formatDate(user.createdAt)}</td>
      <td>
        <div class="actions">
          <select id="${roleSelectId(user._id)}" class="btn-sm btn-muted" aria-label="Select role for ${user.email || user.name || "user"}">
            <option value="user" ${user.role === "user" ? "selected" : ""}>User</option>
            <option value="provider" ${user.role === "provider" ? "selected" : ""}>Provider</option>
            <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
          </select>
          <button class="btn-sm btn-primary" data-action="update-role" data-id="${user._id}">Update Role</button>
          <button class="btn-sm btn-primary" data-action="suspend-user" data-id="${user._id}">Suspend</button>
          <button class="btn-sm btn-primary" data-action="activate-user" data-id="${user._id}">Activate</button>
          ${user.role === "provider" ? `<button class="btn-sm btn-muted" data-action="approve-provider" data-id="${user._id}">Approve Provider</button>` : ""}
          ${user.role === "provider" ? `<button class="btn-sm btn-muted" data-action="reject-provider" data-id="${user._id}">Reject Provider</button>` : ""}
          <button class="btn-sm btn-muted" data-action="view-user" data-id="${user._id}">View Details</button>
          <button class="btn-sm btn-danger" data-action="delete-user" data-id="${user._id}">Delete User</button>
        </div>
      </td>
    </tr>
  `).join("");
};

const renderServices = (services = []) => {
  currentServices = services;
  servicesTableBody.innerHTML = services.map((service) => `
    <tr>
      <td>${service.serviceName || "-"}</td>
      <td>${service.providerId?.name || "-"}</td>
      <td>${service.providerId?.phone || "-"}</td>
      <td>${service.providerId?.providerAddress || "-"}</td>
      <td>${service.category || "-"}</td>
      <td>${formatMoney(service.price)}</td>
      <td>${formatDate(service.createdAt)}</td>
      <td>${service.availabilityStatus || "Available"}</td>
      <td>${service.imagesCount ?? (Array.isArray(service.images) ? service.images.length : 0)}</td>
      <td>
        <div class="actions">
          <button class="btn-sm btn-muted" data-action="view-service" data-id="${service._id}">View</button>
          <button class="btn-sm btn-danger" data-action="remove-service" data-id="${service._id}">Remove Service</button>
          <button class="btn-sm btn-primary" data-action="suspend-provider-from-service" data-provider-id="${service.providerId?._id || ""}">Suspend Provider</button>
        </div>
      </td>
    </tr>
  `).join("");
};

const renderReports = (stats = {}) => {
  const cards = [
    { label: "Total Users", value: stats.totalUsers || 0 },
    { label: "Total Providers", value: stats.totalProviders || 0 },
    { label: "Pending Providers", value: stats.pendingProviders || 0 },
    { label: "Suspended Users", value: stats.suspendedUsers || 0 },
    { label: "Total Services", value: stats.totalServices || 0 },
    { label: "Removed Services", value: stats.removedServices || 0 }
  ];

  reportCards.innerHTML = cards.map((card) => `
    <article class="report-card">
      <h3>${card.label}</h3>
      <p>${card.value}</p>
    </article>
  `).join("");
};

const loadReports = async () => {
  const payload = await apiRequest("/dashboard-stats");
  renderReports(payload.data || {});
};

const loadUsers = async () => {
  const payload = await apiRequest(`/users${qs({
    search: userSearch.value,
    role: userRoleFilter.value,
    status: userStatusFilter.value,
    approved: userApprovedFilter.value
  })}`);
  renderUsers(payload.data || []);
};

const loadServices = async () => {
  const payload = await apiRequest(`/services${qs({
    search: serviceSearch.value,
    category: serviceCategoryFilter.value,
    providerId: serviceProviderFilter.value,
    status: serviceStatusFilter.value
  })}`);
  renderServices(payload.data || []);
};

const refreshCurrentPage = async () => {
  showError("");
  try {
    await loadReports();
    if (currentPage === "users") await loadUsers();
    if (currentPage === "services") await loadServices();
  } catch (err) {
    showError(err.message);
  }
};

const handleAction = async (action, fn) => {
  try {
    await fn();
    await refreshCurrentPage();
    showToast(action, "ok");
  } catch (err) {
    showError(err.message);
    showToast(err.message, "error");
  }
};

usersTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!id) return;

  if (action === "suspend-user") {
    return handleAction("User suspended", async () => {
      await apiRequest(`/users/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ accountStatus: "suspended" })
      });
    });
  }

  if (action === "activate-user") {
    return handleAction("User activated", async () => {
      await apiRequest(`/users/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ accountStatus: "active" })
      });
    });
  }

  if (action === "update-role") {
    const roleElement = document.getElementById(roleSelectId(id));
    const role = roleElement?.value;
    if (!role) {
      showError("Select a valid role first.");
      return;
    }

    return handleAction("Role updated", async () => {
      await apiRequest(`/users/${id}/role`, {
        method: "PUT",
        body: JSON.stringify({ role })
      });
    });
  }

  if (action === "approve-provider") {
    return handleAction("Provider approved", async () => {
      await apiRequest(`/providers/${id}/approve`, {
        method: "PUT",
        body: JSON.stringify({ isApproved: true })
      });
    });
  }

  if (action === "reject-provider") {
    return handleAction("Provider rejected", async () => {
      await apiRequest(`/providers/${id}/reject`, {
        method: "PUT",
        body: JSON.stringify({ isApproved: false, accountStatus: "suspended" })
      });
    });
  }

  if (action === "view-user") {
    return handleAction("Loaded user details", async () => {
      const payload = await apiRequest(`/users/${id}`);
      userDetailsContent.textContent = JSON.stringify(payload.data || {}, null, 2);
      userModal.classList.remove("hidden");
    });
  }

  if (action === "delete-user") {
    if (!window.confirm("Delete this user? This will suspend by default.")) return;
    return handleAction("User removed", async () => {
      await apiRequest(`/users/${id}`, { method: "DELETE" });
    });
  }
});

servicesTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  const providerId = button.dataset.providerId;

  if (action === "view-service" && id) {
    window.open(`/api/services/${id}`, "_blank");
    return;
  }

  if (action === "remove-service" && id) {
    if (!window.confirm("Remove this service?")) return;
    return handleAction("Service removed", async () => {
      await apiRequest(`/services/${id}`, { method: "DELETE" });
    });
  }

  if (action === "suspend-provider-from-service" && providerId) {
    return handleAction("Provider suspended", async () => {
      await apiRequest(`/users/${providerId}/status`, {
        method: "PUT",
        body: JSON.stringify({ accountStatus: "suspended" })
      });
    });
  }
});

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", async () => {
    switchPage(button.dataset.page);
    await refreshCurrentPage();
  });
});

closeUserModal.addEventListener("click", () => {
  userModal.classList.add("hidden");
});

applyUserFilters.addEventListener("click", refreshCurrentPage);
applyServiceFilters.addEventListener("click", refreshCurrentPage);
refreshBtn.addEventListener("click", refreshCurrentPage);

logoutBtn.addEventListener("click", () => {
  resetAuth("Logged out.");
  tokenInput.value = "";
});

saveTokenBtn.addEventListener("click", async () => {
  const nextToken = tokenInput.value.trim();
  if (!nextToken) {
    authError.textContent = "Token is required.";
    return;
  }

  jwtToken = nextToken;
  localStorage.setItem(TOKEN_KEY, jwtToken);
  authError.textContent = "";
  authPanel.classList.add("hidden");
  appShell.classList.remove("hidden");
  switchPage(currentPage);
  await refreshCurrentPage();
});

const boot = async () => {
  if (!jwtToken) {
    authPanel.classList.remove("hidden");
    appShell.classList.add("hidden");
    return;
  }

  tokenInput.value = jwtToken;
  authPanel.classList.add("hidden");
  appShell.classList.remove("hidden");
  switchPage(currentPage);
  await refreshCurrentPage();
};

boot();
