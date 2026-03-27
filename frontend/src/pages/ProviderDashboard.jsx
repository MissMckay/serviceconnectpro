import { useEffect, useState, useMemo, useContext } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import {
  subscribeBookingsByProvider,
  subscribeServices,
  updateBookingStatus,
  createService as createServiceFirestore,
  updateService as updateServiceFirestore,
  deleteService as deleteServiceFirestore,
  updateUserProfile,
} from "../firebase/firestoreServices";
import { getServiceMedia } from "../utils/serviceMedia";
import { canProviderCreateServices, getProviderAccessMessage } from "../utils/providerAccess";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from "recharts";
import { formatLrdPrice } from "../utils/currency";

const defaultFormState = {
  serviceName: "",
  category: "",
  description: "",
  price: "",
  availabilityStatus: "Available",
  imageDetails: []
};

const serviceCategoryOptions = [
  "Tutor / Teaching",
  "Exam Prep Coaching",
  "ICT Training",
  "Computer Repair",
  "Phone Repair",
  "Electrical",
  "Solar Installation",
  "Plumbing",
  "Carpentry",
  "Masonry",
  "Painting",
  "Cleaning",
  "Laundry",
  "Catering",
  "Baking",
  "Event Decoration",
  "Hair Braiding",
  "Barbing",
  "Tailoring",
  "Makeup Services",
  "Photography",
  "Videography",
  "Generator Repair",
  "Motorbike Repair",
  "Delivery Services"
];

const MAX_MEDIA_PAYLOAD_BYTES = 20 * 1024 * 1024;

const getDataArray = (res) =>
  Array.isArray(res?.data?.data) ? res.data.data : Array.isArray(res?.data) ? res.data : [];

const getEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || "";
};

const decodeJwtPayload = (token) => {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

const getApproxPayloadBytes = (value) => {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
};

const ProviderDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refreshProfile } = useContext(AuthContext);
  const providerProfile = user || {};
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const getSectionFromSearch = (search) => {
    const view = new URLSearchParams(search).get("view");
    if (view === "add" || view === "manage" || view === "bookings" || view === "profile" || view === "settings") {
      return view;
    }
    return "dashboard";
  };
  const [activeSection, setActiveSection] = useState(() => getSectionFromSearch(location.search));
  const [serviceForm, setServiceForm] = useState(defaultFormState);
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    phone: "",
    providerAddress: ""
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const showSuccess = (message) => setFeedback({ type: "success", message });
  const showError = (message) => setFeedback({ type: "error", message });
  const notifyServicesUpdated = () => {
    const stamp = String(Date.now());
    localStorage.setItem("services:lastUpdatedAt", stamp);
    window.dispatchEvent(new CustomEvent("services:updated", { detail: stamp }));
  };

  const getCurrentProviderId = () => getEntityId(user?.uid) || getEntityId(user?._id) || "";

  const belongsToCurrentProvider = (service, providerId) => {
    if (!providerId) return false;
    const serviceProviderId = getEntityId(service?.providerId) || getEntityId(service?.provider) || getEntityId(service?.createdBy);
    return String(serviceProviderId) === String(providerId);
  };

  const syncProviderPhotoAcrossServices = async (profilePhoto) => {
    const role = String(providerProfile?.role || user?.role || "").toLowerCase();
    if (role !== "provider") return;

    const providerId = getCurrentProviderId();
    const ownedServices = services.filter((service) => belongsToCurrentProvider(service, providerId));
    if (!ownedServices.length) return;

    await Promise.all(
      ownedServices.map((service) =>
        updateServiceFirestore(service._id, { providerProfilePhoto: profilePhoto || "" })
      )
    );
    notifyServicesUpdated();
  };

  useEffect(() => {
    const providerId = getCurrentProviderId();
    if (!providerId) {
      setBookings([]);
      setServices([]);
      return;
    }
    const unsubBookings = subscribeBookingsByProvider(providerId, setBookings);
    const unsubServices = subscribeServices({}, (list) => {
      setServices(list.filter((s) => belongsToCurrentProvider(s, providerId)));
    });
    return () => {
      if (typeof unsubBookings === "function") unsubBookings();
      if (typeof unsubServices === "function") unsubServices();
    };
  }, [user?.uid]);

  useEffect(() => {
    setActiveSection(getSectionFromSearch(location.search));
  }, [location.search]);

  useEffect(() => {
    setSettingsForm({
      name: providerProfile?.name || "",
      phone: providerProfile?.phone || "",
      providerAddress: providerProfile?.providerAddress || ""
    });
  }, [providerProfile?.name, providerProfile?.phone, providerProfile?.providerAddress]);

  useEffect(() => {
    if (!feedback.message) return undefined;
    const timer = setTimeout(() => {
      setFeedback({ type: "", message: "" });
    }, 5000);
    return () => clearTimeout(timer);
  }, [feedback.message]);

  const updateMediaField = (index, field, value) => {
    setServiceForm((prev) => ({
      ...prev,
      imageDetails: prev.imageDetails.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry
      )
    }));
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`Unable to read file ${file.name}`));
      reader.readAsDataURL(file);
    });

  const handleProfilePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      if (file) showError("Please select an image file (e.g. JPG, PNG).");
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (user?.uid) await updateUserProfile(user.uid, { profilePhoto: dataUrl });
      await syncProviderPhotoAcrossServices(dataUrl);
      await refreshProfile();
      showSuccess("Profile photo updated across your services.");
    } catch (err) {
      showError(err?.message || "Failed to update profile photo.");
    }
    event.target.value = "";
  };

  const handleRemoveProfilePhoto = async () => {
    try {
      if (user?.uid) await updateUserProfile(user.uid, { profilePhoto: "" });
      await syncProviderPhotoAcrossServices("");
      await refreshProfile();
      showSuccess("Profile photo removed from your profile and services.");
    } catch (err) {
      showError(err?.message || "Failed to remove profile photo.");
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const name = String(settingsForm.name || "").trim();
      const phone = String(settingsForm.phone || "").trim();
      const providerAddress = String(settingsForm.providerAddress || "").trim();
      const payload = { name: name || providerProfile?.name, phone: phone || "Not provided", providerAddress: providerAddress || "Not provided" };
      if (user?.uid) await updateUserProfile(user.uid, payload);
      await refreshProfile();
      showSuccess("Settings saved.");
    } catch (err) {
      showError(err?.message || "Failed to save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const addSelectedImages = async (event) => {
    const incomingFiles = Array.from(event.target.files || []);
    if (!incomingFiles.length) return;

    const remainingSlots = Math.max(0, 10 - serviceForm.imageDetails.length);
    if (remainingSlots <= 0) {
      showError("You can upload up to 10 images.");
      event.target.value = "";
      return;
    }

    const filesToUpload = incomingFiles.slice(0, remainingSlots);
    const skippedCount = Math.max(0, incomingFiles.length - filesToUpload.length);
    const results = await Promise.allSettled(
      filesToUpload.map(async (file) => ({
        url: await readFileAsDataUrl(file),
        description: "",
        name: file.name
      }))
    );

    const uploaded = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    const failedNames = results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.status === "rejected")
      .map(({ index }) => filesToUpload[index]?.name)
      .filter(Boolean);

    if (uploaded.length) {
      setServiceForm((prev) => ({
        ...prev,
        imageDetails: [...prev.imageDetails, ...uploaded].slice(0, 10)
      }));
    }

    if (failedNames.length || skippedCount > 0) {
      const failuresText = failedNames.length
        ? ` Failed to read: ${failedNames.join(", ")}.`
        : "";
      const skippedText = skippedCount > 0 ? ` ${skippedCount} file(s) were skipped due to the 10-image limit.` : "";
      showError(`Some files were not added.${failuresText}${skippedText}`);
    } else {
      showSuccess(`${uploaded.length} image(s) added.`);
    }

    event.target.value = "";
  };

  const removeMediaRow = (index) => {
    setServiceForm((prev) => {
      const nextItems = prev.imageDetails.filter((_, entryIndex) => entryIndex !== index);
      return {
        ...prev,
        imageDetails: nextItems
      };
    });
  };

  const updateStatus = async (id, status) => {
    try {
      await updateBookingStatus(id, status);
      showSuccess(`Booking marked as ${status}.`);
    } catch (err) {
      showError(err?.message || "Unable to update booking status.");
    }
  };

  const createServiceSubmit = async (event) => {
    event.preventDefault();
    if (!canProviderCreateServices(providerProfile)) {
      showError(getProviderAccessMessage(providerProfile));
      return;
    }
    if (!serviceForm.serviceName.trim()) {
      showError("Service name is required.");
      return;
    }
    const providerId = getCurrentProviderId();
    if (!providerId) {
      showError("Not signed in.");
      return;
    }
    const providerName = String(providerProfile?.name || "").trim();
    const providerAddress = String(providerProfile?.providerAddress || "").trim();

    // Build images as plain data-URL entries (no Firebase Storage).
    const normalizedMedia = (serviceForm.imageDetails || [])
      .map((entry) => ({
        url: String(entry?.url || "").trim(),
        description: String(entry?.description || "").trim()
      }))
      .filter((entry) => entry.url)
      .slice(0, 10);

    const images = normalizedMedia.map((m) => ({
      imageUrl: m.url,
      caption: m.description || ""
    }));

    setIsCreating(true);
    try {
      if (editingServiceId) {
        await updateServiceFirestore(editingServiceId, {
          serviceName: serviceForm.serviceName,
          category: serviceForm.category,
          description: serviceForm.description,
          price: Number(serviceForm.price) || 0,
          availabilityStatus: serviceForm.availabilityStatus || "Available",
          images,
          providerProfilePhoto: providerProfile?.profilePhoto || "",
        });
        showSuccess("Service updated successfully.");
      } else {
        const result = await createServiceFirestore(providerId, {
          serviceName: serviceForm.serviceName,
          category: serviceForm.category,
          description: serviceForm.description,
          price: Number(serviceForm.price) || 0,
          availabilityStatus: serviceForm.availabilityStatus || "Available",
          images,
          providerName,
          providerAddress,
          providerProfilePhoto: providerProfile?.profilePhoto || "",
        });
        const skipped = result && typeof result === "object" && result.imagesSkipped;
        showSuccess(
          skipped
            ? "Service added. Enable Firebase Storage to upload images later."
            : "Service added successfully."
        );
      }
      setServiceForm({ ...defaultFormState });
      setEditingServiceId("");
      notifyServicesUpdated();
      navigate("/provider?view=manage");
    } catch (err) {
      const msg = err?.message || (editingServiceId ? "Unable to update service" : "Unable to create service");
      const code = err?.code || "";
      if (code === "permission-denied" || msg.toLowerCase().includes("permission")) {
        showError("You don't have permission to add or edit services. Make sure your account is approved.");
      } else {
        showError(msg);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const startEditService = (service) => {
    const providerId = getCurrentProviderId();
    if (!belongsToCurrentProvider(service, providerId)) {
      showError("You can only edit services created by your account.");
      return;
    }

    const media = getServiceMedia(service).map((entry) => ({
      url: entry.url,
      description: entry.description || "",
      name: ""
    }));

    setEditingServiceId(String(service?._id || ""));
    setServiceForm({
      serviceName: service?.serviceName || "",
      category: service?.category || "",
      description: service?.description || "",
      price: service?.price ?? "",
      availabilityStatus: service?.availabilityStatus || "Available",
      imageDetails: media.slice(0, 10)
    });

    navigate("/provider?view=add");
    showSuccess("Service loaded for editing.");
  };

  const clearEditMode = () => {
    setEditingServiceId("");
    setServiceForm({
      ...defaultFormState
    });
  };

  const deleteService = async (serviceId) => {
    if (!window.confirm("Delete this service?")) return;
    const providerId = getCurrentProviderId();
    const targetService = services.find((service) => String(service?._id) === String(serviceId));
    if (!belongsToCurrentProvider(targetService, providerId)) {
      showError("You can only delete services created by your account.");
      return;
    }
    try {
      await deleteServiceFirestore(serviceId);
      notifyServicesUpdated();
      if (String(editingServiceId) === String(serviceId)) clearEditMode();
      showSuccess("Service deleted successfully.");
    } catch (err) {
      showError(err?.message || "Unable to delete service.");
    }
  };

  const formatBookingDate = (booking) => {
    const rawDate = booking?.date || booking?.bookingDate || booking?.createdAt;
    if (!rawDate) return "N/A";
    const parsedDate = new Date(rawDate);
    if (Number.isNaN(parsedDate.getTime())) return "N/A";
    return parsedDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  const getUserContact = (booking) =>
    booking?.userId?.phone ||
    booking?.user?.phone ||
    booking?.userPhone ||
    booking?.userId?.email ||
    booking?.user?.email ||
    booking?.userEmail ||
    "N/A";

  const getBookingServiceName = (booking) =>
    booking?.serviceId?.serviceName || booking?.serviceSnapshot?.serviceName || "—";

  const getBookingPrice = (booking) => {
    const p = booking?.serviceId?.price ?? booking?.serviceSnapshot?.price;
    return typeof p === "number" && !Number.isNaN(p) ? p : 0;
  };

  const canAddService = canProviderCreateServices(providerProfile);
  const providerAccessMessage = getProviderAccessMessage(providerProfile);

  // Dashboard stats and chart data (real-time from bookings/services)
  const dashboardStats = useMemo(() => {
    const byStatus = { Pending: 0, Accepted: 0, Rejected: 0, Cancelled: 0, Completed: 0 };
    let revenue = 0;
    bookings.forEach((b) => {
      const s = String(b?.status || "").trim() || "Pending";
      if (byStatus[s] !== undefined) byStatus[s]++;
      if (s === "Completed") revenue += getBookingPrice(b);
    });
    return {
      totalServices: services.length,
      totalBookings: bookings.length,
      pending: byStatus.Pending,
      accepted: byStatus.Accepted,
      completed: byStatus.Completed,
      rejected: byStatus.Rejected,
      cancelled: byStatus.Cancelled,
      revenue
    };
  }, [bookings, services]);

  const areaChartData = useMemo(() => {
    const days = 14;
    const now = new Date();
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      let count = 0;
      bookings.forEach((b) => {
        const raw = b?.bookingDate || b?.createdAt || b?.date;
        if (!raw) return;
        const dt = new Date(raw);
        if (dt >= d && dt < next) count++;
      });
      buckets.push({ date: label, bookings: count, fullDate: d.toISOString().slice(0, 10) });
    }
    return buckets;
  }, [bookings]);

  const statusChartData = useMemo(() => {
    const statuses = ["Pending", "Accepted", "Completed", "Rejected", "Cancelled"];
    return statuses.map((status) => ({
      status,
      count: dashboardStats[status.toLowerCase()] ?? 0
    }));
  }, [dashboardStats]);

  const recentBookings = useMemo(() => {
    return [...bookings]
      .sort((a, b) => {
        const da = new Date(a?.bookingDate || a?.createdAt || 0).getTime();
        const db = new Date(b?.bookingDate || b?.createdAt || 0).getTime();
        return db - da;
      })
      .slice(0, 15);
  }, [bookings]);

  return (
    <div className="user-dashboard-content">
      <main className="dashboard-main-content provider-right-content">
        {feedback.message && (
          <div
            className={`provider-feedback ${
              feedback.type === "error" ? "provider-feedback-error" : "provider-feedback-success"
            }`}
            role="status"
            aria-live="polite"
          >
            {feedback.message}
          </div>
        )}

        {!canAddService && providerAccessMessage && (
          <div className="provider-feedback provider-feedback-error" role="status" style={{ marginBottom: "1rem" }}>
            {providerAccessMessage} You cannot add or edit services until an administrator approves your account. Updates appear here in real time once approved.
          </div>
        )}

        {activeSection === "dashboard" && (
          <div className="dashboard-panel provider-dashboard-overview">
            <article className="provider-section-card">
              <h2 className="provider-card-heading">My Dashboard</h2>
              <p className="provider-dashboard-subtitle">Live overview of your services and bookings</p>

              <div className="provider-dashboard-metrics admin-report-strip">
                <div className="admin-metric provider-metric">
                  <p>My Services</p>
                  <strong>{dashboardStats.totalServices}</strong>
                </div>
                <div className="admin-metric provider-metric">
                  <p>Total Bookings</p>
                  <strong>{dashboardStats.totalBookings}</strong>
                </div>
                <div className="admin-metric provider-metric">
                  <p>Pending</p>
                  <strong>{dashboardStats.pending}</strong>
                </div>
                <div className="admin-metric provider-metric">
                  <p>Accepted</p>
                  <strong>{dashboardStats.accepted}</strong>
                </div>
                <div className="admin-metric provider-metric">
                  <p>Completed</p>
                  <strong>{dashboardStats.completed}</strong>
                </div>
                <div className="admin-metric provider-metric provider-metric-revenue">
                  <p>Revenue (Completed)</p>
                  <strong>{formatLrdPrice(dashboardStats.revenue)}</strong>
                </div>
              </div>

              <div className="provider-dashboard-charts">
                <div className="provider-chart-card">
                  <h3 className="provider-chart-title">Bookings over time (last 14 days)</h3>
                  <div className="provider-chart-wrap">
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={areaChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="providerAreaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--brand-blue)" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="var(--brand-blue)" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f2" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#64748b" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#64748b" />
                        <Tooltip
                          contentStyle={{ borderRadius: "10px", border: "1px solid #e3e7ee" }}
                          formatter={(value) => [value, "Bookings"]}
                          labelFormatter={(label, payload) =>
                            payload?.[0]?.payload?.fullDate ? new Date(payload[0].payload.fullDate).toLocaleDateString() : label
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="bookings"
                          stroke="var(--brand-blue)"
                          strokeWidth={2}
                          fill="url(#providerAreaGradient)"
                          name="Bookings"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="provider-chart-card">
                  <h3 className="provider-chart-title">Bookings by status</h3>
                  <div className="provider-chart-wrap">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={statusChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f2" />
                        <XAxis dataKey="status" tick={{ fontSize: 11 }} stroke="#64748b" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#64748b" />
                        <Tooltip
                          contentStyle={{ borderRadius: "10px", border: "1px solid #e3e7ee" }}
                          formatter={(value) => [value, "Count"]}
                        />
                        <Legend />
                        <Bar dataKey="count" fill="var(--brand-red)" name="Bookings" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="provider-dashboard-table-card">
                <h3 className="provider-chart-title">Recent bookings</h3>
                <div className="provider-table-wrap">
                  <table className="provider-table provider-dashboard-table">
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Client</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Amount (LRD)</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentBookings.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="provider-table-empty">
                            No bookings yet. New requests will appear here in real time.
                          </td>
                        </tr>
                      ) : (
                        recentBookings.map((booking) => (
                          <tr key={booking._id}>
                            <td>{getBookingServiceName(booking)}</td>
                            <td>
                              {booking?.userId?.name || booking?.userId?.email || "—"}
                              <br />
                              <small className="provider-table-contact">{getUserContact(booking)}</small>
                            </td>
                            <td>{formatBookingDate(booking)}</td>
                            <td>
                              <span
                                className="provider-booking-status-badge"
                                style={{
                                  background:
                                    booking.status === "Completed"
                                      ? "#dcfce7"
                                      : booking.status === "Pending"
                                        ? "#fef9c3"
                                        : booking.status === "Accepted"
                                          ? "#dbeafe"
                                          : "#fee2e2",
                                  color: "#0f172a"
                                }}
                              >
                                {booking.status || "—"}
                              </span>
                            </td>
                            <td>{formatLrdPrice(getBookingPrice(booking))}</td>
                            <td>
                              {booking.status === "Pending" && (
                                <>
                                  <button
                                    type="button"
                                    className="provider-table-btn provider-table-btn-accept"
                                    onClick={() => updateStatus(booking._id, "Accepted")}
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    className="provider-table-btn provider-table-btn-reject"
                                    onClick={() => updateStatus(booking._id, "Rejected")}
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {booking.status === "Accepted" && (
                                <button
                                  type="button"
                                  className="provider-table-btn provider-table-btn-complete"
                                  onClick={() => updateStatus(booking._id, "Completed")}
                                >
                                  Complete
                                </button>
                              )}
                              <button
                                type="button"
                                className="provider-table-btn provider-table-btn-message"
                                onClick={() =>
                                  navigate("/messages", {
                                    state: {
                                      recipientId: booking?.userId?._id || booking?.userId,
                                      recipientName: booking?.userId?.name || booking?.userId?.email
                                    }
                                  })
                                }
                              >
                                Message
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="provider-dashboard-table-footer">
                  <button
                    type="button"
                    className="provider-primary-btn provider-btn-sm"
                    onClick={() => navigate("/provider?view=bookings")}
                  >
                    View all booking requests
                  </button>
                </div>
              </div>
            </article>
          </div>
        )}

        {activeSection === "add" && (
          <div className="dashboard-panel">
            <article className="provider-add-service-card">
              <h2 className="provider-add-service-title">
                {editingServiceId ? "Edit Service" : "Add Service"}
              </h2>
              {!canAddService && (
                <p className="provider-empty-cell provider-access-message">{providerAccessMessage}</p>
              )}

              {/* Profile photo – real-time upload */}
              <div className="provider-profile-photo-section">
                <span className="provider-profile-photo-label">Profile photo</span>
                <div className="provider-profile-photo-box">
                  <div className="provider-profile-photo-preview">
                    {providerProfile?.profilePhoto ? (
                      <img src={providerProfile.profilePhoto} alt="Profile" />
                    ) : (
                      <span className="provider-profile-photo-placeholder">
                        {String(providerProfile?.name || "P")
                          .trim()
                          .slice(0, 2)
                          .toUpperCase() || "?"}
                      </span>
                    )}
                  </div>
                  <div className="provider-profile-photo-actions">
                    <label className="provider-profile-photo-btn provider-profile-photo-upload">
                      Change photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProfilePhotoChange}
                        disabled={!canAddService}
                        aria-label="Upload profile photo"
                      />
                    </label>
                    {providerProfile?.profilePhoto && (
                      <button
                        type="button"
                        className="provider-profile-photo-btn provider-profile-photo-remove"
                        onClick={handleRemoveProfilePhoto}
                        disabled={!canAddService}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <form className="provider-service-form provider-service-form-pro" onSubmit={createServiceSubmit}>
                <section className="provider-form-section">
                  <h3 className="provider-form-section-title">Service details</h3>
                  <div className="provider-form-grid">
                    <div className="provider-form-field">
                      <label className="provider-field-label" htmlFor="provider-service-name">
                        Service name
                      </label>
                      <input
                        id="provider-service-name"
                        type="text"
                        placeholder="e.g. Home tutoring"
                        value={serviceForm.serviceName}
                        onChange={(e) => setServiceForm((prev) => ({ ...prev, serviceName: e.target.value }))}
                        required
                        disabled={!canAddService}
                      />
                    </div>
                    <div className="provider-form-field">
                      <label className="provider-field-label" htmlFor="provider-category">
                        Category
                      </label>
                      <select
                        id="provider-category"
                        value={serviceForm.category}
                        onChange={(e) => setServiceForm((prev) => ({ ...prev, category: e.target.value }))}
                        required
                        disabled={!canAddService}
                      >
                        <option value="">Select category</option>
                        {serviceCategoryOptions.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="provider-form-field provider-form-field-full">
                    <label className="provider-field-label" htmlFor="provider-description">
                      Description
                    </label>
                    <textarea
                      id="provider-description"
                      rows={4}
                      placeholder="Describe what you offer and what customers can expect"
                      value={serviceForm.description}
                      onChange={(e) => setServiceForm((prev) => ({ ...prev, description: e.target.value }))}
                      required
                      disabled={!canAddService}
                    />
                  </div>
                </section>

                <section className="provider-form-section">
                  <h3 className="provider-form-section-title">Pricing & availability</h3>
                  <div className="provider-form-grid">
                    <div className="provider-form-field">
                      <label className="provider-field-label" htmlFor="provider-price">
                        Price (LRD)
                      </label>
                      <input
                        id="provider-price"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={serviceForm.price}
                        onChange={(e) => setServiceForm((prev) => ({ ...prev, price: e.target.value }))}
                        required
                        disabled={!canAddService}
                      />
                    </div>
                    <div className="provider-form-field">
                      <label className="provider-field-label" htmlFor="provider-availability">
                        Availability
                      </label>
                      <select
                        id="provider-availability"
                        value={serviceForm.availabilityStatus}
                        onChange={(e) =>
                          setServiceForm((prev) => ({ ...prev, availabilityStatus: e.target.value }))
                        }
                        disabled={!canAddService}
                      >
                        <option value="Available">Available</option>
                        <option value="Unavailable">Unavailable</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section className="provider-form-section">
                  <h3 className="provider-form-section-title">Service images (up to 10)</h3>
                  <div className="provider-media-wrapper provider-media-pro">
                    <label className="provider-media-upload-label" htmlFor="provider-service-images">
                      <span className="provider-media-upload-text">Choose images</span>
                      <input
                        id="provider-service-images"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={addSelectedImages}
                        disabled={!canAddService || serviceForm.imageDetails.length >= 10}
                        aria-label="Add service images"
                      />
                    </label>
                    <p className="provider-media-hint">JPG or PNG, max 10 images (~20MB total).</p>
                    {serviceForm.imageDetails.length > 0 && (
                      <div className="provider-media-grid">
                        {serviceForm.imageDetails.map((entry, index) => (
                          <div key={`media-${index}`} className="provider-media-item">
                            <img src={entry.url} alt={`Service ${index + 1}`} />
                            <input
                              type="text"
                              placeholder="Caption (optional)"
                              value={entry.description}
                              onChange={(e) => updateMediaField(index, "description", e.target.value)}
                              disabled={!canAddService}
                              className="provider-media-caption"
                            />
                            <button
                              type="button"
                              className="provider-media-remove"
                              onClick={() => removeMediaRow(index)}
                              disabled={!canAddService}
                              aria-label={`Remove image ${index + 1}`}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {serviceForm.imageDetails.length === 0 && (
                      <p className="provider-media-empty">No images added yet.</p>
                    )}
                  </div>
                </section>

                <div className="provider-form-actions">
                  <button type="submit" className="provider-primary-btn" disabled={isCreating || !canAddService}>
                    {isCreating ? "Saving…" : editingServiceId ? "Update service" : "Add service"}
                  </button>
                  {editingServiceId && (
                    <button
                      type="button"
                      className="provider-action-btn provider-edit-btn"
                      onClick={clearEditMode}
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              </form>
            </article>
          </div>
        )}

        {activeSection === "manage" && (
          <div className="dashboard-panel">
            <article className="provider-section-card">
              <h2 className="provider-card-heading">Manage My Services</h2>
              <div className="provider-table-wrap">
                <table className="provider-table">
                  <thead>
                    <tr>
                      <th>Service Name</th>
                      <th>Category</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="provider-empty-cell">
                          No services found.
                        </td>
                      </tr>
                    ) : (
                      services.map((service) => (
                        <tr key={service._id}>
                          <td>{service.serviceName || "N/A"}</td>
                          <td>{service.category || "N/A"}</td>
                          <td>
                            <div className="provider-action-group">
                              <button
                                type="button"
                                className="provider-action-btn provider-edit-btn"
                                onClick={() => startEditService(service)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="provider-action-btn provider-delete-btn"
                                onClick={() => deleteService(service._id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        )}

        {activeSection === "bookings" && (
          <div className="dashboard-panel">
            <article className="provider-section-card provider-booking-section">
              <h2 className="provider-card-heading">Booking Requests</h2>
              <div className="provider-table-wrap">
                <table className="provider-table">
                  <thead>
                    <tr>
                      <th>User Name</th>
                      <th>User Contact</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="provider-empty-cell">
                          No booking requests found.
                        </td>
                      </tr>
                    ) : (
                      bookings.map((booking) => {
                        const isPending = String(booking.status || "").toLowerCase() === "pending";
                        const isAccepted = String(booking.status || "").toLowerCase() === "accepted";
                        return (
                          <tr key={booking._id}>
                            <td>{booking.userId?.name || booking.user?.name || "N/A"}</td>
                            <td>{getUserContact(booking)}</td>
                            <td>{formatBookingDate(booking)}</td>
                            <td>
                              <span
                                className={`booking-status status-${String(booking.status || "").toLowerCase()}`}
                              >
                                {booking.status || "Unknown"}
                              </span>
                            </td>
                            <td>
                              <div className="provider-action-group">
                                <button
                                  type="button"
                                  className="provider-action-btn provider-edit-btn"
                                  onClick={() =>
                                    navigate("/messages", {
                                      state: {
                                        recipientId: booking.userId?._id || booking.user?._id,
                                        recipientName: booking.userId?.name || booking.user?.name || "Customer"
                                      }
                                    })
                                  }
                                >
                                  Message
                                </button>
                                <button
                                  type="button"
                                  className="provider-action-btn provider-accept-btn"
                                  onClick={() => updateStatus(booking._id, "Accepted")}
                                  disabled={!isPending}
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  className="provider-action-btn provider-reject-btn"
                                  onClick={() => updateStatus(booking._id, "Rejected")}
                                  disabled={!isPending}
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  className="provider-action-btn provider-complete-btn"
                                  onClick={() => updateStatus(booking._id, "Completed")}
                                  disabled={!isAccepted}
                                >
                                  Mark Complete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        )}

        {activeSection === "profile" && (
          <div className="dashboard-panel">
            <article className="provider-section-card provider-profile-section">
              <h2 className="provider-card-heading">Profile</h2>
              <div className="provider-profile-view">
                <div className="provider-profile-photo-box">
                  <div className="provider-profile-photo-preview">
                    {providerProfile?.profilePhoto ? (
                      <img src={providerProfile.profilePhoto} alt="Profile" />
                    ) : (
                      <span className="provider-profile-photo-placeholder">
                        {String(providerProfile?.name || "P").trim().slice(0, 2).toUpperCase() || "?"}
                      </span>
                    )}
                  </div>
                  <p className="provider-profile-view-name">{providerProfile?.name || "—"}</p>
                </div>
                <dl className="provider-profile-dl">
                  <dt>Email</dt>
                  <dd>{providerProfile?.email || "—"}</dd>
                  <dt>Phone</dt>
                  <dd>{providerProfile?.phone || "—"}</dd>
                  <dt>Address</dt>
                  <dd>{providerProfile?.providerAddress || "—"}</dd>
                </dl>
                <Link to="/provider?view=settings" className="provider-action-btn provider-edit-btn">
                  Edit in Settings
                </Link>
              </div>
            </article>
          </div>
        )}

        {activeSection === "settings" && (
          <div className="dashboard-panel">
            <article className="provider-add-service-card">
              <h2 className="provider-add-service-title">Settings</h2>

              <div className="provider-profile-photo-section">
                <span className="provider-profile-photo-label">Profile photo</span>
                <p className="profile-photo-detail">This photo appears in the top navigation bar.</p>
                <div className="provider-profile-photo-box">
                  <div className="provider-profile-photo-preview">
                    {providerProfile?.profilePhoto ? (
                      <img src={providerProfile.profilePhoto} alt="Profile" />
                    ) : (
                      <span className="provider-profile-photo-placeholder">
                        {String(providerProfile?.name || "P").trim().slice(0, 2).toUpperCase() || "?"}
                      </span>
                    )}
                  </div>
                  <div className="provider-profile-photo-actions">
                    <label className="provider-profile-photo-btn provider-profile-photo-upload">
                      Change photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProfilePhotoChange}
                        aria-label="Upload profile photo"
                      />
                    </label>
                    {providerProfile?.profilePhoto && (
                      <button
                        type="button"
                        className="provider-profile-photo-btn provider-profile-photo-remove"
                        onClick={handleRemoveProfilePhoto}
                        title="Remove your profile photo. Your initials will show in the nav bar instead."
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <form className="provider-service-form provider-service-form-pro" onSubmit={saveSettings}>
                <section className="provider-form-section">
                  <h3 className="provider-form-section-title">Account details</h3>
                  <div className="provider-form-grid">
                    <div className="provider-form-field">
                      <label className="provider-field-label" htmlFor="settings-name">Name</label>
                      <input
                        id="settings-name"
                        type="text"
                        value={settingsForm.name}
                        onChange={(e) => setSettingsForm((p) => ({ ...p, name: e.target.value }))}
                      />
                    </div>
                    <div className="provider-form-field">
                      <label className="provider-field-label" htmlFor="settings-phone">Phone</label>
                      <input
                        id="settings-phone"
                        type="text"
                        value={settingsForm.phone}
                        onChange={(e) => setSettingsForm((p) => ({ ...p, phone: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="provider-form-field provider-form-field-full">
                    <label className="provider-field-label" htmlFor="settings-address">Address</label>
                    <input
                      id="settings-address"
                      type="text"
                      value={settingsForm.providerAddress}
                      onChange={(e) => setSettingsForm((p) => ({ ...p, providerAddress: e.target.value }))}
                      placeholder="Business or service address"
                    />
                  </div>
                </section>
                <div className="provider-form-actions">
                  <button type="submit" className="provider-primary-btn" disabled={isSavingSettings}>
                    {isSavingSettings ? "Saving…" : "Save settings"}
                  </button>
                </div>
              </form>
            </article>
          </div>
        )}
      </main>
    </div>
  );
};

export default ProviderDashboard;
