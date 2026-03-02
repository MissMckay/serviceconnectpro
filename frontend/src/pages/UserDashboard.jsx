import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API from "../services/api";
import UserBookings from "./UserBookings";
import { formatStars } from "../utils/rating";
import { getServiceMedia } from "../utils/serviceMedia";
import { formatLrdPrice } from "../utils/currency";
import { getServiceSearchLocations, matchesLocationQuery } from "../utils/serviceSearch";

const UserDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
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

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || {};
    } catch (err) {
      return {};
    }
  }, []);

  const decodeJwtPayload = (token) => {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    try {
      const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(payload));
    } catch {
      return null;
    }
  };

  const getFirstSuccessful = async (paths) => {
    for (const path of paths) {
      try {
        const res = await API.get(path);
        return res;
      } catch {
        // try next endpoint
      }
    }
    return null;
  };

  const extractUserFromResponse = (res) => {
    const data = res?.data;
    if (data?.data && !Array.isArray(data.data)) return data.data;
    if (data?.user && !Array.isArray(data.user)) return data.user;
    if (data && !Array.isArray(data) && typeof data === "object" && !data.data && !data.user) {
      return data;
    }
    return null;
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

  const normalizeText = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const fetchServices = async () => {
    setIsLoading(true);
    setError("");
    try {
      const params = {};
      if (filters.category !== "All") params.category = filters.category;
      if (filters.location.trim() !== "") params.location = filters.location.trim();

      const res = await API.get("/services", {
        params: { ...params, _ts: Date.now() }
      });
      const serviceList = Array.isArray(res.data?.data) ? res.data.data : [];

      const reviewsByService = await Promise.all(
        serviceList.map((service) =>
          API.get(`/reviews/service/${service._id}`)
            .then((reviewRes) => ({
              serviceId: service._id,
              reviews: Array.isArray(reviewRes.data?.data) ? reviewRes.data.data : []
            }))
            .catch(() => ({
              serviceId: service._id,
              reviews: []
            }))
        )
      );

      const reviewMap = new Map(
        reviewsByService.map((entry) => [String(entry.serviceId), entry.reviews])
      );

      const merged = serviceList.map((service) => {
        const fetchedReviews = reviewMap.get(String(service._id)) || [];
        const embeddedReviews = Array.isArray(service?.reviews)
          ? service.reviews
          : Array.isArray(service?.comments)
            ? service.comments
            : [];
        return {
          ...service,
          reviews: fetchedReviews.length ? fetchedReviews : embeddedReviews
        };
      });

      setServices(merged);
    } catch (err) {
      console.log("Error fetching services:", err);
      setServices([]);
      if (!err.response) {
        setError("Cannot reach backend API. Make sure the server is running on port 5000.");
      } else {
        setError(err.response?.data?.message || "Failed to load services.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isValidObjectId = (value) =>
    typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);

  useEffect(() => {
    fetchServices();
  }, [filters.category, filters.location]);

  useEffect(() => {
    const handleServiceUpdates = () => {
      fetchServices();
    };

    const handleStorage = (event) => {
      if (event.key === "services:lastUpdatedAt") {
        fetchServices();
      }
    };

    window.addEventListener("services:updated", handleServiceUpdates);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("services:updated", handleServiceUpdates);
      window.removeEventListener("storage", handleStorage);
    };
  }, [filters.category, filters.location]);

  useEffect(() => {
    if (activeView !== "profile") return;

    const loadProfile = async () => {
      setProfileLoading(true);
      setProfileError("");
      try {
        const token = localStorage.getItem("token");
        const decoded = decodeJwtPayload(token);
        const userId =
          user?._id ||
          user?.id ||
          decoded?._id ||
          decoded?.id ||
          decoded?.userId ||
          decoded?.user?._id ||
          decoded?.user?.id;

        const candidatePaths = ["/users/me"];
        if (isValidObjectId(userId)) {
          candidatePaths.push(`/users/${userId}`);
          candidatePaths.push(`/auth/users/${userId}`);
        }

        const res = await getFirstSuccessful(candidatePaths);
        const payload = extractUserFromResponse(res);
        const nextProfile = payload || user || {};

        setProfileData(nextProfile);
        localStorage.setItem("user", JSON.stringify(nextProfile));
      } catch {
        setProfileData(user || {});
        setProfileError("Could not refresh profile from server. Showing saved profile.");
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [activeView]);

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
      "refreshToken"
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

  return (
    <div className="user-dashboard-content">
      <main className="dashboard-main-content">
        {activeView === "services" && (
          <>
            {!selectedService && (
              <>
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

                {isLoading && <p>Loading services...</p>}
                {!isLoading && error && <p className="dashboard-error">{error}</p>}

                {!error && (
                  <div className="dashboard-grid">
                    {filteredServices.map((service) => {
                      const media = getServiceMedia(service);
                      const images = media.map((entry) => entry.url).slice(0, 3);
                      const reviews = Array.isArray(service?.reviews) ? service.reviews : [];
                      const sortedReviews = [...reviews].sort(
                        (a, b) => getReviewTimestamp(b) - getReviewTimestamp(a)
                      );
                      const previewReviews = sortedReviews.slice(0, 2);
                      return (
                        <div key={service._id} className="service-card">
                          <div className="service-card-media">
                            {images.length ? (
                              <div className="service-card-media-grid">
                                {images.map((image, index) => (
                                  <img key={`${service._id}-media-${index}`} src={image} alt={service.serviceName} />
                                ))}
                              </div>
                            ) : (
                              <div className="service-card-placeholder">
                                No image uploaded
                              </div>
                            )}
                          </div>
                          <div className="service-card-body">
                            <div className="service-card-title">{service.serviceName}</div>
                            <div className="service-card-meta">
                              <strong>Provider Name:</strong> {getProviderName(service)}
                            </div>
                            <div className="service-card-meta">
                              <strong>Provider Phone:</strong> {getProviderPhone(service)}
                            </div>
                            <div className="service-card-meta">
                              <strong>Provider Address:</strong> {getProviderAddress(service)}
                            </div>
                            <div className="service-card-meta">
                              <strong>Category:</strong> {service?.category || "General"}
                            </div>
                            <div className="service-card-meta">
                              <strong>Description:</strong>{" "}
                              {service?.description || "Not provided"}
                            </div>
                            <div className="service-card-meta">
                              <strong>Price:</strong> {formatLrdPrice(service?.price)}
                            </div>
                            <div className="service-card-meta">
                              <strong>Status:</strong>{" "}
                              {service?.availabilityStatus || "Not provided"}
                            </div>
                            <div className="service-card-meta">
                              <strong>Average Rating:</strong>{" "}
                              {formatStars(service?.averageRating)}
                            </div>
                            {getServiceLocation(service) && (
                              <div className="service-card-meta">
                                <strong>Location:</strong> {getServiceLocation(service)}
                              </div>
                            )}

                            <div className="service-card-actions">
                              <button
                                type="button"
                                className="service-card-btn"
                                onClick={() => setSelectedServiceId(service._id)}
                              >
                                Review
                              </button>
                            </div>

                            <div className="service-card-reviews">
                              <div className="service-card-reviews-title">
                                Recent Reviews
                              </div>
                              {previewReviews.length === 0 ? (
                                <p>No reviews yet.</p>
                              ) : (
                                previewReviews.map((review, index) => (
                                  <div
                                    key={review?._id || `${service._id}-preview-${index}`}
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
                                ))
                              )}
                            </div>
                          </div>
                        </div>
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
              {profileLoading && <p>Loading profile...</p>}
              {!profileLoading && profileError && <p className="dashboard-error">{profileError}</p>}
              {!profileLoading && profileEntries.length === 0 && <p>No profile details found.</p>}
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
