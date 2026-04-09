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
  getServiceById,
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

const MAX_SERVICE_IMAGE_COUNT = 7;
const MAX_MEDIA_PAYLOAD_BYTES = 1650 * 1024;
const MAX_PROFILE_PHOTO_BYTES = 180 * 1024;
const MAX_SERVICE_IMAGE_BYTES = 280 * 1024;
const MAX_SERVICE_THUMBNAIL_BYTES = 55 * 1024;
const MAX_PROVIDER_PHOTO_DIMENSION = 160;

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

const compressCanvasToDataUrl = (canvas, maxBytes, initialQuality = 0.82) => {
  let quality = initialQuality;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);

  while (getApproxPayloadBytes(dataUrl) > maxBytes && quality > 0.4) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  return dataUrl;
};

const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error(`Unable to read file ${file.name}`));
    };
    image.src = imageUrl;
  });

const compressProfilePhoto = async (file) => {
  const image = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to process the selected image.");

  const scale = Math.min(1, MAX_PROVIDER_PHOTO_DIMENSION / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);

  while (getApproxPayloadBytes(dataUrl) > MAX_PROFILE_PHOTO_BYTES && quality > 0.45) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  if (getApproxPayloadBytes(dataUrl) > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error("Profile photo is too large. Please choose a smaller image.");
  }

  return dataUrl;
};

const buildScaledCanvas = (image, maxDimension) => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to process the selected image.");
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const buildCoverCanvas = (image, width, height) => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to process the selected image.");

  canvas.width = width;
  canvas.height = height;

  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  return canvas;
};

const compressServiceImage = async (file) => {
  const image = await loadImageFromFile(file);
  const fullCanvas = buildScaledCanvas(image, 1440);
  const thumbnailCanvas = buildCoverCanvas(image, 360, 260);

  const url = compressCanvasToDataUrl(fullCanvas, MAX_SERVICE_IMAGE_BYTES, 0.84);
  const thumbnailUrl = compressCanvasToDataUrl(thumbnailCanvas, MAX_SERVICE_THUMBNAIL_BYTES, 0.78);

  if (
    getApproxPayloadBytes(url) > MAX_SERVICE_IMAGE_BYTES ||
    getApproxPayloadBytes(thumbnailUrl) > MAX_SERVICE_THUMBNAIL_BYTES
  ) {
    throw new Error(`Image ${file.name} is too large. Please choose a smaller image.`);
  }

  return {
    url,
    thumbnailUrl,
    description: "",
    name: file.name,
  };
};

const getServiceImageEntries = (service) => {
  if (Array.isArray(service?.images) && service.images.length) {
    return service.images
      .map((entry, index) => {
        if (typeof entry === "string") {
          return {
            url: entry,
            thumbnailUrl: index === 0 ? service?.thumbnailUrl || "" : "",
            description: "",
            name: "",
          };
        }

        const url = String(entry?.imageUrl || entry?.url || "").trim();
        if (!url) return null;

        return {
          url,
          thumbnailUrl: String(entry?.thumbnailUrl || (index === 0 ? service?.thumbnailUrl || "" : "")).trim(),
          description: String(entry?.caption || entry?.description || "").trim(),
          name: "",
        };
      })
      .filter(Boolean)
      .slice(0, MAX_SERVICE_IMAGE_COUNT);
  }

  return getServiceMedia(service)
    .slice(0, MAX_SERVICE_IMAGE_COUNT)
    .map((entry, index) => ({
      url: entry.url,
      thumbnailUrl: index === 0 ? String(service?.thumbnailUrl || "").trim() : "",
      description: entry.description || "",
      name: "",
    }));
};

const ProviderDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refreshProfile } = useContext(AuthContext);
  const providerProfile = user || {};
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isPreparingEdit, setIsPreparingEdit] = useState(false);
  const [preparingEditId, setPreparingEditId] = useState("");
  const [editingServiceId, setEditingServiceId] = useState("");
  const [initialEditImagesSignature, setInitialEditImagesSignature] = useState("");
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
    return;
  };

  useEffect(() => {
    const providerId = getCurrentProviderId();
    if (!providerId) {
      setBookings([]);
      setServices([]);
      return;
    }
    const unsubBookings = subscribeBookingsByProvider(providerId, setBookings);
    const unsubServices = subscribeServices({ providerId }, setServices, {
      pollMs: 0
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
      const dataUrl = await compressProfilePhoto(file);
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
      notifyServicesUpdated();
      showSuccess("Settings saved successfully.");
    } catch (err) {
      showError(err?.message || "Failed to save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const addSelectedImages = async (event) => {
    const incomingFiles = Array.from(event.target.files || []);
    if (!incomingFiles.length) return;

    const remainingSlots = Math.max(0, MAX_SERVICE_IMAGE_COUNT - serviceForm.imageDetails.length);
    if (remainingSlots <= 0) {
      showError(`You can upload up to ${MAX_SERVICE_IMAGE_COUNT} images.`);
      event.target.value = "";
      return;
    }

    const filesToUpload = incomingFiles.slice(0, remainingSlots);
    const skippedCount = Math.max(0, incomingFiles.length - filesToUpload.length);
    const results = await Promise.allSettled(
      filesToUpload.map((file) => compressServiceImage(file))
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
      const nextImageDetails = [...serviceForm.imageDetails, ...uploaded].slice(0, MAX_SERVICE_IMAGE_COUNT);
      if (getApproxPayloadBytes(nextImageDetails) > MAX_MEDIA_PAYLOAD_BYTES) {
        showError("These images are still too large together. Please add fewer or smaller images.");
        event.target.value = "";
        return;
      }

      setServiceForm((prev) => ({
        ...prev,
        imageDetails: nextImageDetails
      }));
    }

    if (failedNames.length || skippedCount > 0) {
      const failuresText = failedNames.length
        ? ` Failed to read: ${failedNames.join(", ")}.`
        : "";
      const skippedText = skippedCount > 0 ? ` ${skippedCount} file(s) were skipped due to the ${MAX_SERVICE_IMAGE_COUNT}-image limit.` : "";
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

  const replaceMediaRow = async (index, event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const nextEntry = await compressServiceImage(file);
      const nextItems = serviceForm.imageDetails.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              url: nextEntry.url,
              thumbnailUrl: nextEntry.thumbnailUrl,
              name: file.name || entry.name || "",
            }
          : entry
      );

      if (getApproxPayloadBytes(nextItems) > MAX_MEDIA_PAYLOAD_BYTES) {
        throw new Error("This replacement image is still too large. Please choose a smaller image.");
      }

      setServiceForm((prev) => ({
        ...prev,
        imageDetails: nextItems,
      }));
      showSuccess(`Image ${index + 1} replaced.`);
    } catch (err) {
      showError(err?.message || "Unable to replace this image.");
    }

    event.target.value = "";
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
          thumbnailUrl: String(entry?.thumbnailUrl || "").trim(),
          description: String(entry?.description || "").trim()
        }))
        .filter((entry) => entry.url)
        .slice(0, MAX_SERVICE_IMAGE_COUNT);

    const images = normalizedMedia.map((m) => ({
      imageUrl: m.url,
      thumbnailUrl: m.thumbnailUrl || "",
      caption: m.description || ""
    }));
    const currentImagesSignature = JSON.stringify(images);

    setIsCreating(true);
    try {
      if (editingServiceId) {
          const updatePayload = {
            serviceName: serviceForm.serviceName,
            category: serviceForm.category,
            description: serviceForm.description,
            price: Number(serviceForm.price) || 0,
            availabilityStatus: serviceForm.availabilityStatus || "Available",
          };
          if (currentImagesSignature !== initialEditImagesSignature) {
            updatePayload.images = images;
          }
          await updateServiceFirestore(editingServiceId, {
            ...updatePayload,
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
      setInitialEditImagesSignature("");
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

  const startEditService = async (service) => {
    const providerId = getCurrentProviderId();
    if (!belongsToCurrentProvider(service, providerId)) {
      showError("You can only edit services created by your account.");
      return;
    }

    setIsPreparingEdit(true);
    setPreparingEditId(String(service?._id || ""));
    try {
      const freshService = await getServiceById(String(service?._id || ""), {
        forceFresh: true,
      });
      const sourceService = freshService || service;
      const media = getServiceImageEntries(sourceService);
      const nextImagesSignature = JSON.stringify(
        media.slice(0, MAX_SERVICE_IMAGE_COUNT).map((entry) => ({
          imageUrl: String(entry?.url || "").trim(),
          thumbnailUrl: String(entry?.thumbnailUrl || "").trim(),
          caption: String(entry?.description || "").trim(),
        }))
      );

      setEditingServiceId(String(sourceService?._id || service?._id || ""));
      setInitialEditImagesSignature(nextImagesSignature);
      setServiceForm({
        serviceName: sourceService?.serviceName || "",
        category: sourceService?.category || "",
        description: sourceService?.description || "",
        price: sourceService?.price ?? "",
        availabilityStatus: sourceService?.availabilityStatus || "Available",
        imageDetails: media.slice(0, MAX_SERVICE_IMAGE_COUNT),
      });

      navigate("/provider?view=add");
      showSuccess("Service loaded for editing.");
    } catch (err) {
      showError(err?.message || "Unable to load this service for editing.");
    } finally {
      setIsPreparingEdit(false);
      setPreparingEditId("");
    }
  };

  const clearEditMode = (options = {}) => {
    setEditingServiceId("");
    setInitialEditImagesSignature("");
    setServiceForm({
      ...defaultFormState
    });

    if (options.navigateToManage) {
      navigate("/provider?view=manage");
    }
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
      if (String(editingServiceId) === String(serviceId)) clearEditMode({ navigateToManage: true });
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
              <p className="provider-dashboard-subtitle">Live overview of your services and booking requests</p>

              <div className="provider-dashboard-metrics admin-report-strip">
                <button type="button" className="admin-metric provider-metric provider-metric-button" onClick={() => navigate("/provider?view=manage")}>
                  <p>My Services</p>
                  <strong>{dashboardStats.totalServices}</strong>
                </button>
                <button type="button" className="admin-metric provider-metric provider-metric-button" onClick={() => navigate("/provider?view=bookings")}>
                  <p>Total Requests</p>
                  <strong>{dashboardStats.totalBookings}</strong>
                </button>
                <button type="button" className="admin-metric provider-metric provider-metric-button" onClick={() => navigate("/provider?view=bookings")}>
                  <p>Pending</p>
                  <strong>{dashboardStats.pending}</strong>
                </button>
                <button type="button" className="admin-metric provider-metric provider-metric-button" onClick={() => navigate("/provider?view=bookings")}>
                  <p>Accepted</p>
                  <strong>{dashboardStats.accepted}</strong>
                </button>
                <button type="button" className="admin-metric provider-metric provider-metric-button" onClick={() => navigate("/provider?view=bookings")}>
                  <p>Completed</p>
                  <strong>{dashboardStats.completed}</strong>
                </button>
                <button type="button" className="admin-metric provider-metric provider-metric-revenue provider-metric-button" onClick={() => navigate("/provider?view=bookings")}>
                  <p>Revenue (Completed)</p>
                  <strong>{formatLrdPrice(dashboardStats.revenue)}</strong>
                </button>
              </div>

              <div className="provider-dashboard-charts">
                <div className="provider-chart-card">
                  <h3 className="provider-chart-title">Booking requests over time (last 14 days)</h3>
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
                <h3 className="provider-chart-title">Recent booking requests</h3>
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
                            No booking requests yet. New requests will appear here in real time.
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
                                      recipientId: getEntityId(booking?.userId) || getEntityId(booking?.user) || "",
                                      recipientName: booking?.userId?.name || booking?.user?.name || booking?.userId?.email || booking?.user?.email || "Customer"
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
                  <h3 className="provider-form-section-title">Service images (up to 7)</h3>
                  <div className="provider-media-wrapper provider-media-pro">
                    <label className="provider-media-upload-label" htmlFor="provider-service-images">
                      <span className="provider-media-upload-text">Choose images</span>
                      <input
                        id="provider-service-images"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={addSelectedImages}
                        disabled={!canAddService || serviceForm.imageDetails.length >= MAX_SERVICE_IMAGE_COUNT}
                        aria-label="Add service images"
                      />
                    </label>
                    <p className="provider-media-hint">JPG or PNG, up to 7 images. The system creates thumbnails for the marketplace cards automatically.</p>
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
                            <label className="provider-media-replace">
                              Replace image
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => replaceMediaRow(index, e)}
                                disabled={!canAddService}
                              />
                            </label>
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
                      onClick={() => clearEditMode({ navigateToManage: true })}
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
                                disabled={isPreparingEdit}
                              >
                                {isPreparingEdit && String(preparingEditId || "") === String(service?._id || "") ? "Loading…" : "Edit"}
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
                                        recipientId: getEntityId(booking?.userId) || getEntityId(booking?.user) || "",
                                        recipientName: booking.userId?.name || booking.user?.name || booking.userId?.email || booking.user?.email || "Customer"
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
