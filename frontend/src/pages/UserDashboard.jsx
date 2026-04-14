import { useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { getPublicServicesSnapshot, getUserProfile, subscribeBookingsByUser, subscribeServices, updateUserProfile } from "../firebase/firestoreServices";
import UserBookings from "./UserBookings";
import { formatStars, getAverageRatingAndCount } from "../utils/rating";
import { getServiceMedia, getMarketplaceCardMedia } from "../utils/serviceMedia";
import { formatLrdPrice } from "../utils/currency";
import { getServiceSearchLocations, matchesLocationQuery } from "../utils/serviceSearch";
import { getEntityId, getServiceProviderId, serviceHasProviderSummary } from "../utils/providerProfile";
import { prepareProfilePhotoUpload } from "../utils/imageUpload";
import WhatsAppIcon from "../components/WhatsAppIcon";
import { preloadBookingRoute, preloadServiceDetailsRoute } from "../utils/routePreload";

const NEW_SERVICE_WINDOW_HOURS = 42;
const NEW_SERVICE_WINDOW_MS = NEW_SERVICE_WINDOW_HOURS * 60 * 60 * 1000;

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

  const handleProfilePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      if (file) setProfileError("Please select an image file (e.g. JPG, PNG).");
      event.target.value = "";
      return;
    }
    try {
      const { dataUrl, wasResized } = await prepareProfilePhotoUpload(file);
      if (user?.uid) await updateUserProfile(user.uid, { profilePhoto: dataUrl });
      await refreshProfile();
      setProfileData((prev) => (prev ? { ...prev, profilePhoto: dataUrl } : null));
      setProfileError(wasResized ? "Profile photo resized automatically for a safer upload." : "");
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

  useEffect(() => {
    setIsLoading(services.length === 0);
    setError("");

    let unsub;

    try {
      unsub = subscribeServices(
        {
          category: filters.category,
          location: filters.location.trim(),
          minPrice: "",
          maxPrice: "",
        },
        (serviceList) => {
          setServices(Array.isArray(serviceList) ? serviceList : []);
          setError("");
          setIsLoading(false);
        },
        { pollMs: 0, limit: 24 }
      );
    } catch (err) {
      setServices([]);
      setError(err?.message || "Failed to load services.");
      setIsLoading(false);
    }

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [filters.category, filters.location]);

  useEffect(() => {
    const providerIds = [...new Set(services.map(getServiceProviderId).filter(Boolean))];
    if (!providerIds.length) {
      setProviderProfiles({});
      return undefined;
    }

    let cancelled = false;

    const embeddedProfiles = services.reduce((acc, service) => {
      const providerId = getServiceProviderId(service);
      if (!providerId) return acc;

      const embeddedProfile =
        (typeof service?.providerId === "object" && service.providerId) ||
        service?.provider ||
        service?.createdBy ||
        service?.owner;

      if (!embeddedProfile || typeof embeddedProfile !== "object") {
        return acc;
      }

      acc[providerId] = {
        id: providerId,
        _id: providerId,
        ...embeddedProfile,
      };

      return acc;
    }, {});

    setProviderProfiles((prev) => ({ ...prev, ...embeddedProfiles }));

    const missingProviderIds = providerIds.filter((providerId) => {
      const matchingService = services.find(
        (service) => getServiceProviderId(service) === providerId
      );
      if (
        matchingService &&
        serviceHasProviderSummary(matchingService) &&
        getMarketplaceCardMedia(matchingService, providerProfiles).providerPhotoUrl
      ) {
        return false;
      }
      const embedded = embeddedProfiles[providerId];
      return !embedded?.profilePhoto && !embedded?.name && !embedded?.fullName;
    }).slice(0, 12);

    if (!missingProviderIds.length) {
      return undefined;
    }

    const loadProfiles = async () => {
      const profiles = await Promise.all(missingProviderIds.map((providerId) => getUserProfile(providerId)));
      if (cancelled) return;
      const nextProfiles = profiles.reduce((acc, profile) => {
        const providerId = getEntityId(profile);
        if (providerId) acc[providerId] = profile;
        return acc;
      }, {});
      setProviderProfiles((prev) => ({ ...prev, ...nextProfiles }));
    };

    loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [services]);

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
    if (!user?.uid) {
      setProfileData(null);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;

    const loadCurrentProfile = async () => {
      setProfileLoading(true);
      setProfileError("");
      try {
        const profile = await getUserProfile(user.uid, { forceFresh: true, ttlMs: 0 });
        if (cancelled) return;
        setProfileData(profile ? { ...profile, uid: user.uid } : { ...user });
      } catch (err) {
        if (cancelled) return;
        setProfileData({ ...user });
        setProfileError(err?.message || "Failed to load your profile.");
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    loadCurrentProfile();

    return () => {
      cancelled = true;
    };
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
                <div className="admin-report-strip user-dashboard-metrics" style={{ marginBottom: "1.25rem" }}>
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
                      const { serviceImageUrl: firstImageUrl, providerPhotoUrl: providerPhoto, mediaCount } =
                        getMarketplaceCardMedia(service, providerProfiles);
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
                      const createdAtTime =
                        service?.createdAt instanceof Date
                          ? service.createdAt.getTime()
                          : new Date(service?.createdAt || 0).getTime();
                      const isFresh =
                        Number.isFinite(createdAtTime) &&
                        createdAtTime >= Date.now() - NEW_SERVICE_WINDOW_MS;
                      return (
                        <article key={service._id} className="sc-card">
                          <div
                            className="sc-card__image-wrap"
                            onClick={() => navigate(`/services/${service._id}`, { state: { service } })}
                            onPointerDown={() => preloadServiceDetailsRoute(service._id)}
                            onTouchStart={() => preloadServiceDetailsRoute(service._id)}
                            onMouseEnter={() => preloadServiceDetailsRoute(service._id)}
                            onFocus={() => preloadServiceDetailsRoute(service._id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                navigate(`/services/${service._id}`, { state: { service } });
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={`Open details for ${service.serviceName || "this service"}`}
                          >
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
                            <div className="sc-card__image-badges">
                              {mediaCount > 1 && (
                                <span className="sc-card__image-badge dashboard-card-photo-count">
                                  {mediaCount} photos
                                </span>
                              )}
                              {isFresh && (
                                <span className="sc-card__image-badge sc-card__image-badge--fresh">
                                  New
                                </span>
                              )}
                              <span
                                className={`sc-card__image-badge ${
                                  isAvailable
                                    ? "sc-card__image-badge--available"
                                    : "sc-card__image-badge--unavailable"
                                }`}
                              >
                                {service?.availabilityStatus || "—"}
                              </span>
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
                                  onPointerDown={() => preloadServiceDetailsRoute(service._id)}
                                  onTouchStart={() => preloadServiceDetailsRoute(service._id)}
                                  onMouseEnter={() => preloadServiceDetailsRoute(service._id)}
                                  onFocus={() => preloadServiceDetailsRoute(service._id)}
                                  aria-label={`View details for ${service.serviceName || "this service"}`}
                                  title="View details"
                                >
                                  View
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
                                <button
                                  type="button"
                                  className="sc-card__btn sc-card__btn--primary"
                                  onClick={() => navigate(`/book/${service._id}`, { state: { service, from: "user-dashboard" } })}
                                  onPointerDown={() => preloadBookingRoute(service._id)}
                                  onTouchStart={() => preloadBookingRoute(service._id)}
                                  onMouseEnter={() => preloadBookingRoute(service._id)}
                                  onFocus={() => preloadBookingRoute(service._id)}
                                  disabled={!isAvailable}
                                >
                                  Book
                                </button>
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
                      onClick={() => navigate(`/book/${selectedService._id}`, { state: { service: selectedService, from: "user-dashboard" } })}
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
