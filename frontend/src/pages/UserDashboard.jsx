import { useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { getPublicServicesSnapshot, getServices, getUserProfile, subscribeBookingsByUser, updateUserProfile } from "../firebase/firestoreServices";
import UserBookings from "./UserBookings";
import { formatStars, getAverageRatingAndCount } from "../utils/rating";
import { getServiceMedia, getFirstServiceImageUrl } from "../utils/serviceMedia";
import { formatLrdPrice } from "../utils/currency";
import { getServiceSearchLocations, matchesLocationQuery } from "../utils/serviceSearch";
import { getEntityId, getLiveProviderPhoto, getServiceProviderId } from "../utils/providerProfile";
import WhatsAppIcon from "../components/WhatsAppIcon";

const UserDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const initialServices = getPublicServicesSnapshot();
  const [services, setServices] = useState(initialServices);
  const [providerProfiles, setProviderProfiles] = useState({});
  const [isLoading, setIsLoading] = useState(initialServices.length === 0);
  const [error, setError] = useState("");
  const [categoryInput, setCategoryInput] = useState("All");
  const [locationInput, setLocationInput] = useState("");
  const getViewFromSearch = (search) => {
    const view = new URLSearchParams(search).get("view");
    if (view === "bookings" || view === "profile") {
      return view;
    }
    return "services";
  };

  const [activeView, setActiveView] = useState(() => getViewFromSearch(location.search));
  const [filters, setFilters] = useState({
    category: "All",
    location: ""
  });
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [bookings, setBookings] = useState([]);

  const { user, refreshProfile } = useContext(AuthContext);

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
      if (file) setProfileError("Please select an image file (e.g. JPG, PNG).");
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (user?.uid) await updateUserProfile(user.uid, { profilePhoto: dataUrl });
      await refreshProfile();
      setProfileData((prev) => (prev ? { ...prev, profilePhoto: dataUrl } : null));
      setProfileError("");
    } catch (err) {
      setProfileError(err?.message || "Failed to update profile photo.");
    }
    event.target.value = "";
  };

  const handleRemoveProfilePhoto = async () => {
    try {
      if (user?.uid) await updateUserProfile(user.uid, { profilePhoto: "" });
      await refreshProfile();
      setProfileData((prev) => (prev ? { ...prev, profilePhoto: "" } : null));
      setProfileError("");
    } catch (err) {
      setProfileError(err?.message || "Failed to remove profile photo.");
    }
  };

  const getServiceLocation = (service) => getServiceSearchLocations(service)[0] || "";

  const getServiceImages = (service) => getServiceMedia(service).map((entry) => entry.url);

  const getReviewTimestamp = (review) => {
    if (!review || typeof review === "string") {
      return 0;
    }
    const rawDate = review?.createdAt || review?.updatedAt || review?.date;
    const timestamp = rawDate ? new Date(rawDate).getTime() : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const getReviewerName = (review) =>
    review?.userId?.name ||
    review?.user?.name ||
    review?.reviewerName ||
    review?.name ||
    "Anonymous";

  const getProviderName = (service) =>
    service?.providerId?.name ||
    service?.providerName ||
    service?.provider_address_name ||
    service?.ownerName ||
    service?.provider?.providerName ||
    service?.createdBy?.name ||
    service?.provider?.name ||
    service?.provider?.fullName ||
    "Not provided";

  const getProviderPhone = (service) =>
    service?.providerId?.phone ||
    service?.provider?.phone ||
    service?.providerPhone ||
    service?.phone ||
    "Not provided";

  const getProviderAddress = (service) =>
    service?.providerId?.providerAddress ||
    service?.providerAddress ||
    service?.provider_address ||
    service?.addressLine ||
    service?.providerLocation ||
    service?.location ||
    service?.providerId?.address ||
    service?.providerId?.location ||
    service?.provider?.address ||
    service?.provider?.location ||
    service?.createdBy?.address ||
    service?.createdBy?.location ||
    service?.address?.street ||
    service?.address ||
    getServiceLocation(service) ||
    "Not provided";

  const getProviderInitials = (name) => {
    const n = (name || "").trim();
    if (!n) return "?";
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    return n.slice(0, 2).toUpperCase();
  };

  const getProviderPhoto = (service) => getLiveProviderPhoto(service, providerProfiles);

  const formatPhoneForWhatsApp = (phone) => {
    const p = (phone || "").replace(/\D/g, "");
    return p ? p : null;
  };

  const getWhatsAppUrl = (phone) => {
    const num = formatPhoneForWhatsApp(phone);
    if (!num) return null;
    const text = encodeURIComponent("Hi, I'm interested in your service.");
    return `https://wa.me/${num}?text=${text}`;
  };

  const normalizeText = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const fetchServicesForDashboard = async () => {
    setIsLoading(true);
    setError("");
    try {
      const serviceList = await getServices({
        category: filters.category,
        location: filters.location.trim(),
        minPrice: "",
        maxPrice: "",
      });
      setServices(serviceList);
    } catch (err) {
      setServices([]);
      setError(err?.message || "Failed to load services.");
    } finally {
      setIsLoading(false);
    }
  };

  const isValidObjectId = (value) =>
    typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);

  useEffect(() => {
    fetchServicesForDashboard();
  }, [filters.category, filters.location]);

  useEffect(() => {
    const providerIds = [...new Set(services.map(getServiceProviderId).filter(Boolean))];
    if (!providerIds.length) {
      setProviderProfiles({});
      return undefined;
    }

    let cancelled = false;

    const loadProfiles = async () => {
      const profiles = await Promise.all(providerIds.map((providerId) => getUserProfile(providerId)));
      if (cancelled) return;
      const nextProfiles = profiles.reduce((acc, profile) => {
        const providerId = getEntityId(profile);
        if (providerId) acc[providerId] = profile;
        return acc;
      }, {});
      setProviderProfiles(nextProfiles);
    };

    loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [services]);

  useEffect(() => {
    const handleServiceUpdates = () => fetchServicesForDashboard();
    window.addEventListener("services:updated", handleServiceUpdates);
    return () => window.removeEventListener("services:updated", handleServiceUpdates);
  }, [filters.category, filters.location]);

  useEffect(() => {
    if (!user?.uid) {
      setBookings([]);
      return undefined;
    }

    const unsub = subscribeBookingsByUser(user.uid, (bookingList) => {
      setBookings(Array.isArray(bookingList) ? bookingList : []);
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (activeView !== "profile") return;

    setProfileData(user || {});
    setProfileError("");
    setProfileLoading(false);
  }, [activeView, user]);

  useEffect(() => {
    setActiveView(getViewFromSearch(location.search));
  }, [location.search]);

  const categories = useMemo(() => {
    const values = services
      .map((service) => service?.category)
      .filter((category) => typeof category === "string" && category.trim());
    const list = ["All", ...new Set(values)];
    if (categoryInput && !list.includes(categoryInput)) {
      list.push(categoryInput);
    }
    return list;
  }, [services, categoryInput]);

  const locations = useMemo(() => {
    const values = services.flatMap(getServiceSearchLocations);
    return [...new Set(values.map((location) => String(location).trim()).filter(Boolean))].slice(0, 30);
  }, [services]);

  const handleSearch = (event) => {
    event.preventDefault();
    setHasSearched(true);
    setFilters({
      category: categoryInput,
      location: locationInput
    });
  };

  const selectedService = useMemo(
    () => services.find((service) => String(service._id) === String(selectedServiceId)),
    [services, selectedServiceId]
  );

  const filteredServices = useMemo(() => {
    const category = normalizeText(filters.category);

    return services.filter((service) => {
      const serviceCategory = normalizeText(service?.category);

      const matchCategory =
        !category || category === "all" || serviceCategory === category;
      const matchLocation = matchesLocationQuery(service, filters.location);

      return matchCategory && matchLocation;
    });
  }, [services, filters.category, filters.location]);

  const profileEntries = useMemo(() => {
    const source = profileData || user || {};
    const excluded = new Set([
      "password",
      "__v",
      "_id",
      "id",
      "createdAt",
      "updatedAt",
      "token",
      "refreshToken",
      "profilePhoto"
    ]);

    return Object.entries(source)
      .filter(([key, value]) => !excluded.has(key) && value !== null && value !== undefined && value !== "")
      .map(([key, value]) => {
        const formattedLabel = key
          .replace(/([A-Z])/g, " $1")
          .replace(/[_-]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/^./, (char) => char.toUpperCase());

        const formattedValue =
          typeof value === "object"
            ? JSON.stringify(value)
            : String(value);

        return { label: formattedLabel, value: formattedValue };
      });
  }, [profileData, user]);

  const dashboardStats = useMemo(() => {
    const byStatus = { Pending: 0, Accepted: 0, Rejected: 0, Cancelled: 0, Completed: 0 };
    bookings.forEach((booking) => {
      const status = String(booking?.status || "").trim() || "Pending";
      if (Object.prototype.hasOwnProperty.call(byStatus, status)) {
        byStatus[status] += 1;
      }
    });

    return {
      availableServices: filteredServices.length,
      totalBookings: bookings.length,
      pendingBookings: byStatus.Pending,
      completedBookings: byStatus.Completed
    };
  }, [bookings, filteredServices.length]);

  return (
    <div className="user-dashboard-content">
      <main className="dashboard-main-content">
        {activeView === "services" && (
          <>
            {!selectedService && (
              <>
                <div className="admin-report-strip" style={{ marginBottom: "1.25rem" }}>
                  <div className="admin-metric">
                    <p>Available Services</p>
                    <strong>{dashboardStats.availableServices}</strong>
                  </div>
                  <div className="admin-metric">
                    <p>My Bookings</p>
                    <strong>{dashboardStats.totalBookings}</strong>
                  </div>
                  <div className="admin-metric">
                    <p>Pending</p>
                    <strong>{dashboardStats.pendingBookings}</strong>
                  </div>
                  <div className="admin-metric">
                    <p>Completed</p>
                    <strong>{dashboardStats.completedBookings}</strong>
                  </div>
                </div>

                <form className="dashboard-search" onSubmit={handleSearch}>
                  <select
                    value={categoryInput}
                    onChange={(event) => setCategoryInput(event.target.value)}
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <input
                    list="dashboard-location-options"
                    type="text"
                    value={locationInput}
                    placeholder="Search location or address"
                    onChange={(event) => setLocationInput(event.target.value)}
                  />
                  <datalist id="dashboard-location-options">
                    {locations.map((location) => (
                      <option key={location} value={location} />
                    ))}
                  </datalist>
                  <button
                    type="submit"
                    className={`dashboard-search-btn${hasSearched ? " searched" : ""}`}
                  >
                    Search
                  </button>
                </form>

                {!isLoading && error && <p className="dashboard-error">{error}</p>}

                {!error && (
                  <div className="dashboard-grid">
                    {filteredServices.map((service) => {
                      const firstImageUrl = getFirstServiceImageUrl(service);
                      const providerPhoto = getProviderPhoto(service);
                      const { average: embeddedAvg, count: embeddedCount } = getAverageRatingAndCount(service);
                      const displayRating = Number.isFinite(Number(service?.averageRating))
                        ? Number(service.averageRating)
                        : embeddedAvg;
                      const reviewCount = Number.isFinite(Number(service?.reviewsCount))
                        ? Number(service.reviewsCount)
                        : embeddedCount;
                      const description = service?.description || "";
                      const DESCRIPTION_PREVIEW_LENGTH = 110;
                      const truncatedDesc =
                        description.length > DESCRIPTION_PREVIEW_LENGTH
                          ? `${description.slice(0, DESCRIPTION_PREVIEW_LENGTH).trim()}…`
                          : description;
                      const providerName = getProviderName(service);
                      const providerPhone = getProviderPhone(service);
                      const location = getServiceLocation(service) || getProviderAddress(service);
                      const locationDisplay = location && location !== "Not provided" ? location : "";
                      const isAvailable = (service?.availabilityStatus || "").toLowerCase() === "available";
                      return (
                        <article key={service._id} className="sc-card">
                          <div className="sc-card__image-wrap">
                            {firstImageUrl ? (
                              <img
                                src={firstImageUrl}
                                alt={service.serviceName || "Service"}
                                className="sc-card__image"
                                loading="lazy"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.style.display = "none";
                                  const wrap = e.target.parentElement;
                                  const ph = wrap?.querySelector(".sc-card__image-placeholder");
                                  if (ph) ph.style.display = "flex";
                                }}
                              />
                            ) : null}
                            <div className="sc-card__image-placeholder" style={{ display: firstImageUrl ? "none" : "flex" }}>
                              No photo
                            </div>
                            <span className="sc-card__provider-badge" title={providerName}>
                              {providerPhoto ? (
                                <img src={providerPhoto} alt={providerName} className="sc-card__provider-avatar" />
                              ) : (
                                getProviderInitials(providerName)
                              )}
                            </span>
                          </div>
                          <div className="sc-card__content">
                            <div className="sc-card__tags">
                              <span className="sc-card__tag sc-card__tag--category">
                                {service?.category || "General"}
                              </span>
                              <span className={`sc-card__tag sc-card__tag--status ${isAvailable ? "sc-card__tag--available" : "sc-card__tag--unavailable"}`}>
                                {service?.availabilityStatus || "—"}
                              </span>
                            </div>
                            <h3 className="sc-card__title">{service.serviceName}</h3>
                            {truncatedDesc && <p className="sc-card__desc">{truncatedDesc}</p>}
                            <div className="sc-card__provider">
                              <span className="sc-card__provider-name">{providerName}</span>
                              {locationDisplay && (
                                <span className="sc-card__provider-location" title={locationDisplay}>
                                  {locationDisplay.length > 30 ? `${locationDisplay.slice(0, 30)}…` : locationDisplay}
                                </span>
                              )}
                            </div>
                            <div className="sc-card__bottom">
                              <div className="sc-card__price-rating">
                                <span className="sc-card__price">{formatLrdPrice(service?.price)}</span>
                                <span className="sc-card__rating">
                                  {formatStars(displayRating)}
                                  {displayRating > 0 && <em className="sc-card__rating-num">{Number(displayRating).toFixed(1)}</em>}
                                  {reviewCount > 0 && <span className="sc-card__rating-count">({reviewCount})</span>}
                                </span>
                              </div>
                              <div className="sc-card__actions">
                                <button
                                  type="button"
                                  className="sc-card__btn sc-card__btn--secondary"
                                  onClick={() => navigate(`/services/${service._id}`, { state: { service } })}
                                >
                                  Details
                                </button>
                                <button
                                  type="button"
                                  className="sc-card__btn sc-card__btn--primary"
                                  onClick={() => navigate(`/book/${service._id}`)}
                                  disabled={!isAvailable}
                                >
                                  Book Now
                                </button>
                                {getWhatsAppUrl(providerPhone) && (
                                  <a
                                    href={getWhatsAppUrl(providerPhone)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="sc-card__whatsapp"
                                    title="Chat on WhatsApp"
                                    aria-label="Chat on WhatsApp"
                                  >
                                    <WhatsAppIcon size={20} />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {!isLoading && !error && filteredServices.length === 0 && (
                  <p>No services match your search.</p>
                )}
              </>
            )}

            {selectedService && (
              <div className="dashboard-panel">
                <div className="service-detail-card">
                  <div className="service-detail-header">
                    <h3>{selectedService.serviceName}</h3>
                  </div>
                  <p>
                    <strong>Provider Name:</strong> {getProviderName(selectedService)}
                  </p>
                  <p>
                    <strong>Provider Phone:</strong> {getProviderPhone(selectedService)}
                  </p>
                  <p>
                    <strong>Provider Address:</strong> {getProviderAddress(selectedService)}
                  </p>
                  <p>
                    <strong>Category:</strong> {selectedService?.category || "General"}
                  </p>
                  {selectedService?.description && (
                    <p>
                      <strong>Description:</strong> {selectedService.description}
                    </p>
                  )}
                  <p>
                    <strong>Price:</strong> {formatLrdPrice(selectedService?.price)}
                  </p>
                  <p>
                    <strong>Status:</strong>{" "}
                    {selectedService?.availabilityStatus || "Not provided"}
                  </p>
                  <p>
                    <strong>Average Rating:</strong>{" "}
                    {formatStars(selectedService?.averageRating)}
                  </p>
                  {getServiceLocation(selectedService) && (
                    <p>
                      <strong>Location:</strong> {getServiceLocation(selectedService)}
                    </p>
                  )}

                  <div className="service-card-reviews full">
                    <div className="service-card-reviews-title">All Reviews</div>
                    {[...(Array.isArray(selectedService?.reviews) ? selectedService.reviews : [])]
                      .sort((a, b) => getReviewTimestamp(b) - getReviewTimestamp(a))
                      .map((review, index) => (
                        <div
                          key={review?._id || `${selectedService._id}-full-${index}`}
                          className="service-card-review"
                        >
                          <div className="service-card-review-name">
                            {typeof review === "string"
                              ? "Anonymous"
                              : getReviewerName(review)}
                          </div>
                          {typeof review !== "string" && (
                            <div className="service-card-review-comment">
                              {formatStars(review?.rating)}
                            </div>
                          )}
                          <div className="service-card-review-comment">
                            {typeof review === "string"
                              ? review
                              : review?.comment || "No comment provided."}
                          </div>
                        </div>
                      ))}
                    {(Array.isArray(selectedService?.reviews)
                      ? selectedService.reviews.length
                      : 0) === 0 && <p>No reviews yet.</p>}
                  </div>

                  {getServiceMedia(selectedService).length > 0 && (
                    <div className="service-gallery-detailed">
                      {getServiceMedia(selectedService).map((item, index) => (
                        <div key={`${selectedService._id}-image-${index}`} className="service-gallery-card">
                          <img
                            src={item.url}
                            alt={`${selectedService.serviceName} ${index + 1}`}
                          />
                          <div className="service-gallery-desc">
                            <strong>Image {index + 1}:</strong>{" "}
                            {item.description || "No description provided."}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="service-detail-footer">
                    <button
                      type="button"
                      className="service-card-btn"
                      onClick={() => navigate(`/book/${selectedService._id}`)}
                    >
                      Book Now
                    </button>
                    <button
                      type="button"
                      className="service-card-btn"
                      onClick={() => setSelectedServiceId("")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeView === "bookings" && (
          <div className="dashboard-panel">
            <UserBookings />
          </div>
        )}

        {activeView === "profile" && (
          <div className="dashboard-panel">
            <div className="profile-card">
              <div className="profile-card-title">User Profile</div>

              <div className="provider-profile-photo-section">
                <span className="provider-profile-photo-label">Profile photo</span>
                <p className="profile-photo-detail">This photo appears in the top navigation bar.</p>
                <div className="provider-profile-photo-box">
                  <div className="provider-profile-photo-preview">
                    {(profileData || user)?.profilePhoto ? (
                      <img src={(profileData || user).profilePhoto} alt="Profile" />
                    ) : (
                      <span className="provider-profile-photo-placeholder">
                        {String((profileData || user)?.name || "U").trim().slice(0, 2).toUpperCase() || "?"}
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
                    {(profileData || user)?.profilePhoto && (
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

              {profileLoading && <p>Loading profile...</p>}
              {!profileLoading && profileError && <p className="dashboard-error">{profileError}</p>}
              {!profileLoading && profileEntries.length === 0 && !profileError && <p>No profile details found.</p>}
              {!profileLoading &&
                profileEntries.map((entry) => (
                  <div className="profile-row" key={entry.label}>
                    <span>{entry.label}</span>
                    <span>{entry.value}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default UserDashboard;
