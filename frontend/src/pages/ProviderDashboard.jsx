import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API from "../services/api";
import { getServiceMedia } from "../utils/serviceMedia";
import { canProviderCreateServices, getProviderAccessMessage } from "../utils/providerAccess";

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

const ProviderDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [providerProfile, setProviderProfile] = useState(() => getStoredUserSafe());
  const getSectionFromSearch = (search) => {
    const view = new URLSearchParams(search).get("view");
    if (view === "add" || view === "manage" || view === "bookings") {
      return view;
    }
    return "dashboard";
  };
  const [activeSection, setActiveSection] = useState(() => getSectionFromSearch(location.search));
  const [serviceForm, setServiceForm] = useState(defaultFormState);
  const showSuccess = (message) => setFeedback({ type: "success", message });
  const showError = (message) => setFeedback({ type: "error", message });
  const notifyServicesUpdated = () => {
    const stamp = String(Date.now());
    localStorage.setItem("services:lastUpdatedAt", stamp);
    window.dispatchEvent(new CustomEvent("services:updated", { detail: stamp }));
  };

  function getStoredUserSafe() {
    try {
      const rawUser = localStorage.getItem("user");
      if (!rawUser) return {};
      return JSON.parse(rawUser) || {};
    } catch {
      return {};
    }
  }

  const getStoredUser = () => getStoredUserSafe();

  const getCurrentProviderId = () => {
    const storedUser = getStoredUser();
    const userId =
      getEntityId(storedUser?._id) ||
      getEntityId(storedUser?.id) ||
      getEntityId(storedUser?.userId);
    if (userId) return String(userId);

    const token = localStorage.getItem("token");
    const decoded = decodeJwtPayload(token);
    return String(
      getEntityId(decoded?._id) ||
        getEntityId(decoded?.id) ||
        getEntityId(decoded?.userId) ||
        getEntityId(decoded?.user?._id) ||
        getEntityId(decoded?.user?.id) ||
        ""
    );
  };

  const belongsToCurrentProvider = (service, providerId) => {
    if (!providerId) return false;
    const serviceProviderId =
      getEntityId(service?.providerId) ||
      getEntityId(service?.provider) ||
      getEntityId(service?.createdBy);
    return String(serviceProviderId) === String(providerId);
  };

  const fetchBookings = async () => {
    try {
      const res = await API.get("/bookings/provider");
      setBookings(getDataArray(res));
    } catch (err) {
      console.log("Error fetching provider bookings:", err);
    }
  };

  const fetchServices = async () => {
    const providerId = getCurrentProviderId();
    try {
      const res = await API.get("/services");
      const allServices = getDataArray(res);

      if (!providerId) {
        setServices([]);
        showError("Unable to verify your provider profile. Please log in again.");
        return;
      }

      const filtered = allServices.filter((service) => belongsToCurrentProvider(service, providerId));
      setServices(filtered);
    } catch (err) {
      console.log("Error fetching provider services:", err);
      setServices([]);
    }
  };

  const getFirstSuccessful = async (paths) => {
    for (const path of paths) {
      try {
        const res = await API.get(path);
        return res;
      } catch {
        // Try next endpoint.
      }
    }
    return null;
  };

  const extractUser = (res) => {
    const data = res?.data;
    if (data?.data && !Array.isArray(data.data)) return data.data;
    if (data?.user && !Array.isArray(data.user)) return data.user;
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
    return null;
  };

  const fetchProviderProfile = async () => {
    const res = await getFirstSuccessful(["/users/me", "/auth/me", "/auth/profile"]);
    const latestProfile = extractUser(res) || getStoredUser();
    setProviderProfile(latestProfile || {});
    localStorage.setItem("user", JSON.stringify(latestProfile || {}));
  };

  useEffect(() => {
    fetchProviderProfile();
    fetchBookings();
    fetchServices();
  }, []);

  useEffect(() => {
    setActiveSection(getSectionFromSearch(location.search));
  }, [location.search]);

  useEffect(() => {
    if (!feedback.message) return undefined;
    const timer = setTimeout(() => {
      setFeedback({ type: "", message: "" });
    }, 2000);
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
    if (incomingFiles.length > filesToUpload.length) {
      showError("Only the first 10 images can be uploaded.");
    }

    try {
      const uploaded = await Promise.all(
        filesToUpload.map(async (file) => ({
          url: await readFileAsDataUrl(file),
          description: "",
          name: file.name
        }))
      );
      setServiceForm((prev) => ({
        ...prev,
        imageDetails: [...prev.imageDetails, ...uploaded].slice(0, 10)
      }));
    } catch {
      showError("Unable to process one or more images.");
    } finally {
      event.target.value = "";
    }
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
      await API.put(`/bookings/${id}`, { status });
      showSuccess(`Booking marked as ${status}.`);
      fetchBookings();
    } catch (err) {
      showError(err.response?.data?.message || "Unable to update booking status.");
    }
  };

  const createService = async (event) => {
    event.preventDefault();
    if (!canProviderCreateServices(providerProfile)) {
      showError(getProviderAccessMessage(providerProfile));
      return;
    }
    if (!serviceForm.serviceName.trim()) {
      showError("Service name is required.");
      return;
    }
    const storedUser = getStoredUser();
    const providerName = String(storedUser?.name || "").trim();
    const providerAddress = String(
      storedUser?.providerAddress || storedUser?.address || storedUser?.location || ""
    ).trim();

    setIsCreating(true);
    try {
      const normalizedMedia = serviceForm.imageDetails
        .map((entry) => ({
          url: String(entry?.url || "").trim(),
          description: String(entry?.description || "").trim()
        }))
        .filter((entry) => entry.url)
        .slice(0, 10);

      const payload = {
        ...serviceForm,
        price: Number(serviceForm.price) || 0,
        providerName: providerName || undefined,
        providerAddress: providerAddress || undefined,
        providerLocation: providerAddress || undefined,
        location: providerAddress || undefined,
        address: providerAddress || undefined,
        imageDetails: normalizedMedia,
        images: normalizedMedia.map((entry) => entry.url)
      };

      if (editingServiceId) {
        await API.put(`/services/${editingServiceId}`, payload);
      } else {
        await API.post("/services", payload);
      }
      setServiceForm({
        ...defaultFormState
      });
      setEditingServiceId("");
      await fetchServices();
      notifyServicesUpdated();
      navigate("/provider?view=manage");
      showSuccess(editingServiceId ? "Service updated successfully." : "Service added successfully.");
    } catch (err) {
      if (err.response?.status === 403) {
        showError(err.response?.data?.message || "Pending admin approval.");
        return;
      }
      showError(
        err.response?.data?.message ||
          (editingServiceId ? "Unable to update service" : "Unable to create service")
      );
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
      await API.delete(`/services/${serviceId}`);
      setServices((prev) => prev.filter((service) => String(service._id) !== String(serviceId)));
      await fetchServices();
      notifyServicesUpdated();
      if (String(editingServiceId) === String(serviceId)) {
        clearEditMode();
      }
      showSuccess("Service deleted successfully.");
    } catch (err) {
      showError(err.response?.data?.message || "Unable to delete service.");
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

  const canAddService = canProviderCreateServices(providerProfile);
  const providerAccessMessage = getProviderAccessMessage(providerProfile);

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

        {activeSection === "dashboard" && (
          <div className="dashboard-panel">
            <article className="provider-section-card">
              <h2 className="provider-card-heading">My Dashboard</h2>
              <div className="admin-report-strip">
                <div className="admin-metric">
                  <p>My Services</p>
                  <strong>{services.length}</strong>
                </div>
                <div className="admin-metric">
                  <p>My Bookings</p>
                  <strong>{bookings.length}</strong>
                </div>
                <div className="admin-metric">
                  <p>Pending Bookings</p>
                  <strong>
                    {bookings.filter((booking) => String(booking?.status || "").toLowerCase() === "pending").length}
                  </strong>
                </div>
              </div>
            </article>
          </div>
        )}

        {activeSection === "add" && (
          <div className="dashboard-panel">
            <article className="provider-section-card provider-form-card">
              <h2 className="provider-card-heading">
                {editingServiceId ? "Edit Service" : "Add Service"}
              </h2>
              {!canAddService && (
                <p className="provider-empty-cell">{providerAccessMessage}</p>
              )}
              <form className="provider-service-form" onSubmit={createService}>
                <label className="provider-field-label" htmlFor="provider-service-name">
                  Service Name
                </label>
                <input
                  id="provider-service-name"
                  type="text"
                  placeholder="Enter service name"
                  value={serviceForm.serviceName}
                  onChange={(e) => setServiceForm((prev) => ({ ...prev, serviceName: e.target.value }))}
                  required
                  disabled={!canAddService}
                />

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

                <label className="provider-field-label" htmlFor="provider-description">
                  Description
                </label>
                <textarea
                  id="provider-description"
                  rows={4}
                  placeholder="Describe the service"
                  value={serviceForm.description}
                  onChange={(e) => setServiceForm((prev) => ({ ...prev, description: e.target.value }))}
                  required
                  disabled={!canAddService}
                />

                <label className="provider-field-label" htmlFor="provider-price">
                  Price
                </label>
                <input
                  id="provider-price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Enter price"
                  value={serviceForm.price}
                  onChange={(e) => setServiceForm((prev) => ({ ...prev, price: e.target.value }))}
                  required
                  disabled={!canAddService}
                />

                <label className="provider-field-label" htmlFor="provider-availability">
                  Availability Status
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

                <div className="provider-media-wrapper">
                  <label className="provider-field-label">Service Images (up to 10)</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={addSelectedImages}
                    disabled={!canAddService || serviceForm.imageDetails.length >= 10}
                  />
                  {serviceForm.imageDetails.map((entry, index) => (
                    <div key={`media-${index}`} className="provider-media-row">
                      <img src={entry.url} alt={`Service image ${index + 1}`} />
                      <input
                        type="text"
                        placeholder={`Description for image ${index + 1}`}
                        value={entry.description}
                        onChange={(e) => updateMediaField(index, "description", e.target.value)}
                        disabled={!canAddService}
                      />
                      <button
                        type="button"
                        className="provider-action-btn provider-delete-btn"
                        onClick={() => removeMediaRow(index)}
                        disabled={!canAddService}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {serviceForm.imageDetails.length === 0 && (
                    <p className="provider-empty-cell">No images selected.</p>
                  )}
                </div>

                <div className="provider-form-actions">
                  <button type="submit" className="provider-primary-btn" disabled={isCreating || !canAddService}>
                    {isCreating ? "Saving..." : editingServiceId ? "Update Service" : "Add Service"}
                  </button>
                  {editingServiceId && (
                    <button
                      type="button"
                      className="provider-action-btn provider-edit-btn"
                      onClick={clearEditMode}
                    >
                      Cancel Edit
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
      </main>
    </div>
  );
};

export default ProviderDashboard;
