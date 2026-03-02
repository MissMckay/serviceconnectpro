import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import { formatStars } from "../utils/rating";
import { getServiceMedia } from "../utils/serviceMedia";
import { formatLrdPrice } from "../utils/currency";
import { getServiceSearchLocations, matchesLocationQuery } from "../utils/serviceSearch";

const ServiceListing = () => {
  const [services, setServices] = useState([]);
  const [role, setRole] = useState(() => localStorage.getItem("role"));
  const [searchInputs, setSearchInputs] = useState({
    selectedCategory: "All",
    location: "",
    minPrice: "",
    maxPrice: ""
  });
  const [appliedFilters, setAppliedFilters] = useState({
    selectedCategory: "All",
    location: "",
    minPrice: "",
    maxPrice: ""
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const PAGE_SIZE = 6;

  const cardStyle = {
    border: "1px solid #e3e7ee",
    borderRadius: "14px",
    padding: "16px",
    marginBottom: "14px",
    background: "var(--bg-white)",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)"
  };

  const actionButtonStyle = {
    border: "none",
    borderRadius: "12px",
    padding: "8px 12px",
    background: "var(--brand-red)",
    color: "#fff",
    cursor: "pointer",
    marginRight: "8px"
  };

  useEffect(() => {
    const fetchServices = async () => {
      setIsLoading(true);
      setError("");
      try {
        const params = {
          page: currentPage,
          limit: PAGE_SIZE
        };

        if (appliedFilters.selectedCategory !== "All") {
          params.category = appliedFilters.selectedCategory;
        }
        if (appliedFilters.location.trim() !== "") params.location = appliedFilters.location.trim();
        if (appliedFilters.minPrice !== "") params.minPrice = appliedFilters.minPrice;
        if (appliedFilters.maxPrice !== "") params.maxPrice = appliedFilters.maxPrice;

        const res = await API.get("/services", {
          params: { ...params, _ts: Date.now() }
        });

        const serviceList = Array.isArray(res.data?.data) ? res.data.data : [];
        const pagination =
          res.data?.pagination || res.data?.meta || res.data?.pageInfo || null;

        if (pagination) {
          const safeTotalPages = Number(pagination.totalPages || pagination.pages || 1);
          setTotalPages(safeTotalPages > 0 ? safeTotalPages : 1);
          setHasNextPage(Number(currentPage) < safeTotalPages);
        } else {
          setTotalPages(currentPage);
          setHasNextPage(serviceList.length === PAGE_SIZE);
        }

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

        const mergedServices = serviceList.map((service) => {
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

        setServices(mergedServices);
      } catch (err) {
        console.log("Error fetching services:", err);
        setServices([]);
        setError(err.response?.data?.message || "Failed to load services.");
      } finally {
        setIsLoading(false);
      }
    };

    const handleStorage = () => {
      setRole(localStorage.getItem("role"));
      fetchServices();
    };

    const handleServiceUpdates = () => {
      fetchServices();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("services:updated", handleServiceUpdates);
    fetchServices();

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("services:updated", handleServiceUpdates);
    };
  }, [currentPage, appliedFilters]);

  // Booking click handler
  const handleBookingClick = (serviceId) => {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/login");
    } else {
      navigate(`/book/${serviceId}`);
    }
  };

  // Review click handler -> pass showAllMedia flag so details page can render all 10 images
  const handleReviewClick = (serviceId, service) => {
    navigate(`/services/${serviceId}`, { state: { service, showAllMedia: true } });
  };

  const getServiceLocation = (service) => getServiceSearchLocations(service)[0] || "";

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
    (typeof service?.providerId === "object" ? service?.providerId?.location : "") ||
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

  const getReviewerName = (review) =>
    review?.userId?.name ||
    review?.user?.name ||
    review?.reviewerName ||
    review?.name ||
    "Anonymous";

  const getReviewTimestamp = (review) => {
    if (!review || typeof review === "string") {
      return 0;
    }

    const rawDate = review?.createdAt || review?.updatedAt || review?.date;
    const timestamp = rawDate ? new Date(rawDate).getTime() : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const formatReviewDate = (review) => {
    const timestamp = getReviewTimestamp(review);
    if (!timestamp) {
      return "";
    }

    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  const renderReviews = (service) => {
    const rawReviews = Array.isArray(service?.reviews)
      ? service.reviews
      : Array.isArray(service?.comments)
        ? service.comments
        : [];

    const reviews = [...rawReviews].sort(
      (a, b) => getReviewTimestamp(b) - getReviewTimestamp(a)
    );

    if (reviews.length === 0) {
      return (
        <p style={{ margin: 0 }}>
          <strong>Reviews:</strong> No reviews yet.
        </p>
      );
    }

    const visibleReviews = reviews.slice(0, 3);

    return (
      <div>
        <p style={{ margin: "0 0 8px" }}>
          <strong>Reviews:</strong>
        </p>

        {visibleReviews.map((review, index) => {
          const comment = typeof review === "string" ? review : review?.comment;
          const reviewerName = typeof review === "string" ? "Anonymous" : getReviewerName(review);
          const reviewerRating = typeof review === "string" ? null : review?.rating;
          const reviewDate = formatReviewDate(review);

          return (
            <div
              key={review?._id || `${service._id}-review-${index}`}
              style={{ marginBottom: "8px" }}
            >
              <div>
                <strong>{reviewerName}</strong>{" "}
                {reviewerRating ? formatStars(reviewerRating) : ""}
              </div>

              {reviewDate && (
                <div style={{ fontSize: "0.9em", color: "#666" }}>
                  {reviewDate}
                </div>
              )}

              <div>{comment || "No comment provided."}</div>
            </div>
          );
        })}

        {reviews.length > visibleReviews.length && (
          <p>{reviews.length - visibleReviews.length} more review(s) available.</p>
        )}
      </div>
    );
  };

  // ✅ Media preview: images first (max 3), displayed BEFORE service name
  const renderMediaPreview = (service) => {
    const media = getServiceMedia(service) || [];
    const imageOnly = media.filter((m) => m?.type === "image" || !m?.type);
    const preview = imageOnly.slice(0, 3);

    if (!preview.length) {
      return <p className="service-media-empty">No image uploaded.</p>;
    }

    return (
      <div className="service-media-preview">
        {preview.map((item, index) => (
          <img
            key={`${service._id}-preview-${index}`}
            src={item.url}
            alt={`${service.serviceName} preview ${index + 1}`}
          />
        ))}
      </div>
    );
  };

  const categories = [
    "All",
    ...new Set(
      services
        .map((service) => service?.category)
        .filter((category) => typeof category === "string" && category.trim())
    )
  ];

  if (appliedFilters.selectedCategory && !categories.includes(appliedFilters.selectedCategory)) {
    categories.push(appliedFilters.selectedCategory);
  }

  const locationSuggestions = [
    ...new Set(
      services
        .flatMap(getServiceSearchLocations)
        .map((location) => String(location).trim())
        .filter(Boolean)
    )
  ].slice(0, 30);

  const filteredServices = services.filter((service) => {
    const category = (service?.category || "").toLowerCase();
    const price = Number(service?.price);

    const selectedCategory = appliedFilters.selectedCategory.toLowerCase();
    const minPrice = Number(appliedFilters.minPrice);
    const maxPrice = Number(appliedFilters.maxPrice);

    const matchesCategory =
      !selectedCategory || selectedCategory === "all" || category === selectedCategory;

    const matchesMinPrice =
      appliedFilters.minPrice === "" || (Number.isFinite(price) && price >= minPrice);

    const matchesMaxPrice =
      appliedFilters.maxPrice === "" || (Number.isFinite(price) && price <= maxPrice);

    const matchesLocation = matchesLocationQuery(service, appliedFilters.location);

    return matchesCategory && matchesMinPrice && matchesMaxPrice && matchesLocation;
  });

  const handleSearch = (event) => {
    event.preventDefault();
    setCurrentPage(1);
    setAppliedFilters(searchInputs);
  };

  return (
    <div className="page-shell">
      <h2>Available Services</h2>

      <form className="service-listing-search" onSubmit={handleSearch}>
        <select
          value={searchInputs.selectedCategory}
          onChange={(e) =>
            setSearchInputs((prev) => ({ ...prev, selectedCategory: e.target.value }))
          }
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <input
          list="service-location-options"
          type="text"
          placeholder="Search location or address"
          value={searchInputs.location}
          onChange={(e) => setSearchInputs((prev) => ({ ...prev, location: e.target.value }))}
        />
        <datalist id="service-location-options">
          {locationSuggestions.map((location) => (
            <option key={location} value={location} />
          ))}
        </datalist>

        <input
          type="number"
          min="0"
          placeholder="Min price (optional)"
          value={searchInputs.minPrice}
          onChange={(e) => setSearchInputs((prev) => ({ ...prev, minPrice: e.target.value }))}
        />

        <input
          type="number"
          min="0"
          placeholder="Max price (optional)"
          value={searchInputs.maxPrice}
          onChange={(e) => setSearchInputs((prev) => ({ ...prev, maxPrice: e.target.value }))}
        />

        <button type="submit" style={{ ...actionButtonStyle, marginRight: 0 }}>
          Search
        </button>
      </form>

      {isLoading && <p>Loading services...</p>}
      {!isLoading && error && <p style={{ color: "var(--brand-red)" }}>{error}</p>}

      {!error && (
        <div className="service-listing-grid">
          {filteredServices.map((service) => (
            <div
              key={service._id}
              style={{
                ...cardStyle,
                textAlign: "left",
                width: "100%",
                marginBottom: 0
              }}
            >
              {/* ✅ Images first */}
              {renderMediaPreview(service)}

              {/* ✅ Service name AFTER images */}
              <h3 style={{ marginTop: "10px" }}>{service.serviceName}</h3>

              <p>
                <strong>Provider Name:</strong> {getProviderName(service)}
              </p>

              <p>
                <strong>Provider Phone:</strong> {getProviderPhone(service)}
              </p>

              <p>
                <strong>Provider Address:</strong> {getProviderAddress(service)}
              </p>

              <p>
                <strong>Category:</strong> {service.category}
              </p>

              <p>
                <strong>Description:</strong> {service.description}
              </p>

              <p>
                <strong>Price:</strong> {formatLrdPrice(service?.price)}
              </p>

              <p>
                <strong>Status:</strong> {service.availabilityStatus}
              </p>

              <p>
                <strong>Average Rating:</strong>{" "}
                {formatStars(service.averageRating)}{" "}
                {Number.isFinite(Number(service.averageRating)) &&
                  Number(service.averageRating) > 0 && (
                    <span>({Number(service.averageRating).toFixed(1)})</span>
                  )}
              </p>

              <button
                style={actionButtonStyle}
                onClick={() => handleReviewClick(service._id, service)}
              >
                Review
              </button>

              {renderReviews(service)}

              {(role === "user" || !role) && (
                <button
                  style={actionButtonStyle}
                  onClick={() => handleBookingClick(service._id)}
                >
                  Book Now
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!isLoading && !error && filteredServices.length === 0 && (
        <p>No services match your search/filter criteria.</p>
      )}

      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "14px" }}>
        <button
          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          disabled={currentPage === 1 || isLoading}
        >
          Previous Page
        </button>

        <span>
          Page {currentPage} of {Math.max(totalPages, currentPage)}
        </span>

        <button
          onClick={() => setCurrentPage((prev) => prev + 1)}
          disabled={(!hasNextPage && currentPage >= totalPages) || isLoading}
        >
          Next Page
        </button>
      </div>
    </div>
  );
};

export default ServiceListing;
