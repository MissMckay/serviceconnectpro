import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import { formatStars } from "../utils/rating";
import { getServiceMedia } from "../utils/serviceMedia";
import { formatLrdPrice } from "../utils/currency";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

const ServiceDetails = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  const [service, setService] = useState(state?.service || null);
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);


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
    cursor: "pointer"
  };

  const backTarget = state?.from === "user-dashboard" ? "/user" : "/services";
  const backLabel =
    state?.from === "user-dashboard" ? "Back to User Dashboard" : "Back to Services";

  const getReviewerName = (review) =>
    review?.userId?.name ||
    review?.user?.name ||
    review?.reviewerName ||
    review?.name ||
    "Anonymous";

  // Provider profile (from populated providerId)
  const getProviderName = (entry) =>
    entry?.providerId?.name || "Not provided";

  const getProviderAddress = (entry) =>
    entry?.providerId?.providerAddress || "Not provided";

  const getReviewTimestamp = (review) => {
    const rawDate = review?.createdAt || review?.updatedAt || review?.date;
    const timestamp = rawDate ? new Date(rawDate).getTime() : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const formatReviewDate = (review) => {
    const timestamp = getReviewTimestamp(review);
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  useEffect(() => {
    const fetchServiceDetails = async () => {
      setIsLoading(true);
      setError("");
      try {
        const [serviceRes, reviewsRes] = await Promise.all([
          API.get(`/services/${id}`),
          API.get(`/reviews/service/${id}`).catch(() => ({ data: { data: [] } }))
        ]);

        setService(serviceRes.data?.data || null);

        const serviceReviews = Array.isArray(reviewsRes.data?.data)
          ? reviewsRes.data.data
          : [];

        setReviews(serviceReviews);
      } catch (err) {
        setService(null);
        setReviews([]);
        setError(err.response?.data?.message || "Failed to load service details.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchServiceDetails();
  }, [id]);

  const sortedReviews = useMemo(
    () => [...reviews].sort((a, b) => getReviewTimestamp(b) - getReviewTimestamp(a)),
    [reviews]
  );

  if (isLoading) {
    return <div className="page-shell">Loading service details...</div>;
  }

  if (error) {
    return (
      <div className="page-shell">
        <p style={{ color: "var(--brand-red)" }}>{error}</p>
        <button style={actionButtonStyle} onClick={() => navigate(backTarget)}>
          {backLabel}
        </button>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="page-shell">
        <p>Service not found.</p>
        <button style={actionButtonStyle} onClick={() => navigate(backTarget)}>
          {backLabel}
        </button>
      </div>
    );
  }

  const serviceMedia = getServiceMedia(service);
  const totalImages = serviceMedia.length;

  return (
    <div className="page-shell">
      <div style={cardStyle}>

        <h2 style={{ marginTop: 0 }}>Service Details</h2>

        {/* ✅ ALL IMAGES FIRST */}

{/* ===== IMAGE SECTION ===== */}
{totalImages > 0 ? (
  <>
    <div className="service-slider-wrapper">

      {/* Image Counter Badge */}
      {totalImages > 3 && (
        <div className="image-count-badge">
          +{totalImages - 3} more
        </div>
      )}

      <Swiper
        modules={[Navigation, Pagination]}
        spaceBetween={12}
        slidesPerView={1}
        navigation
        pagination={{ clickable: true }}
        className="service-swiper"
      >
        {serviceMedia.map((item, index) => (
          <SwiperSlide key={index}>
            <div>
              <div
                className="zoom-container"
                onClick={() => setLightboxIndex(index)}
              >
                <img
                  src={item.url}
                  alt={`Service ${index + 1}`}
                  loading="lazy"
                />
              </div>
              <p className="service-gallery-desc">
                <strong>Image {index + 1}:</strong>{" "}
                {item.description || "No description provided."}
              </p>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>

    {/* ===== LIGHTBOX MODAL ===== */}
    {lightboxIndex !== null && (
      <div
        className="lightbox-overlay"
        onClick={() => setLightboxIndex(null)}
      >
        <img
          src={serviceMedia[lightboxIndex].url}
          alt="Full view"
          className="lightbox-image"
        />
      </div>
    )}
  </>
) : (
  <p>No image uploaded.</p>
)}

        {/* ✅ SERVICE NAME AFTER IMAGES */}
        <h3>{service.serviceName}</h3>

        <p><strong>Category:</strong> {service.category}</p>
        <p><strong>Description:</strong> {service.description}</p>
        <p><strong>Provider Name:</strong> {getProviderName(service)}</p>
        <p><strong>Provider Address:</strong> {getProviderAddress(service)}</p>
        <p><strong>Price:</strong> {formatLrdPrice(service?.price)}</p>
        <p><strong>Status:</strong> {service.availabilityStatus}</p>
        <p><strong>Average Rating:</strong> {formatStars(service.averageRating)}</p>
      </div>

      <h4 style={{ margin: "4px 0 12px" }}>Reviews</h4>

      {sortedReviews.length === 0 ? (
        <p>No reviews yet.</p>
      ) : (
        sortedReviews.map((review, index) => {
          const reviewDate = formatReviewDate(review);
          return (
            <div key={review?._id || `review-${index}`} style={cardStyle}>
              <p style={{ margin: "0 0 4px" }}>
                <strong>{getReviewerName(review)}</strong>
              </p>
              <p style={{ margin: "0 0 4px" }}>
                {formatStars(review?.rating)}
              </p>
              {reviewDate && (
                <p style={{ margin: "0 0 6px", fontSize: "0.9em", color: "#666" }}>
                  {reviewDate}
                </p>
              )}
              <p style={{ margin: 0 }}>
                {review?.comment || "No comment provided."}
              </p>
            </div>
          );
        })
      )}

      <button style={actionButtonStyle} onClick={() => navigate(backTarget)}>
        {backLabel}
      </button>
    </div>
  );
};

export default ServiceDetails;
