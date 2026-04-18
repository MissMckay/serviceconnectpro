import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getServiceById, getReviewsByService, subscribeUserProfile } from "../firebase/firestoreServices";
import { formatStars, getAverageRatingAndCount } from "../utils/rating";
import { getServiceMedia } from "../utils/serviceMedia";
import { formatLrdPrice } from "../utils/currency";
import { getLiveProviderPhoto, getServiceProviderId } from "../utils/providerProfile";
import { preloadBookingRoute, preloadServiceListingRoute } from "../utils/routePreload";
import WhatsAppIcon from "../components/WhatsAppIcon";

const ServiceDetails = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const initialService = state?.service || null;
  const shouldForceFullMedia = state?.showAllMedia === true;

  const [service, setService] = useState(initialService);
  const [reviews, setReviews] = useState([]);
  const [providerProfile, setProviderProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(() => !initialService);
  const [error, setError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  const backTarget = state?.from === "user-dashboard" ? "/user" : "/services";
  const backLabel =
    state?.from === "user-dashboard" ? "Back to Dashboard" : "Back to Services";
  const canUseHistoryBack = state?.from !== "user-dashboard" && typeof window !== "undefined" && window.history.length > 1;

  const handleBack = () => {
    if (canUseHistoryBack) {
      navigate(-1);
      return;
    }
    navigate(backTarget);
  };

  const getReviewerName = (review) =>
    review?.userId?.name ||
    review?.user?.name ||
    review?.reviewerName ||
    review?.name ||
    "Anonymous";

  const getReviewerInitials = (review) => {
    const name = getReviewerName(review);
    const n = (name || "").trim();
    if (!n || n === "Anonymous") return "?";
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    return n.slice(0, 2).toUpperCase();
  };

  const getProviderName = (entry) =>
    entry?.providerName || entry?.providerId?.name || "Not provided";

  const getProviderAddress = (entry) =>
    entry?.providerAddress ||
    entry?.providerId?.providerAddress ||
    entry?.provider_address ||
    "Not provided";

  const getProviderPhone = (entry) =>
    entry?.providerPhone || entry?.providerId?.phone || entry?.phone || "Not provided";

  const getProviderInitials = (name) => {
    const n = (name || "").trim();
    if (!n || n === "Not provided") return "?";
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    return n.slice(0, 2).toUpperCase();
  };

  const formatPhoneForWhatsApp = (phone) => {
    const p = (phone || "").replace(/\D/g, "");
    return p ? p : null;
  };

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

  const fetchServiceDetails = useCallback(async (showLoading = true) => {
    if (!id) return;
    if (showLoading) setIsLoading(true);
    setError("");
    try {
      const [serviceData, serviceReviews] = await Promise.all([
        getServiceById(id, {
          forceFresh: shouldForceFullMedia,
          timeoutMs: 5000,
        }),
        getReviewsByService(id)
      ]);
      setService((prev) => serviceData || prev || null);
      setReviews(Array.isArray(serviceReviews) ? serviceReviews : []);
    } catch (err) {
      if (showLoading) {
        setService((prev) => prev || null);
        setReviews([]);
        setError(err?.message || "Failed to load service details.");
      }
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [id, shouldForceFullMedia]);

  useEffect(() => {
    fetchServiceDetails(!initialService);
  }, [fetchServiceDetails]);

  useEffect(() => {
    const providerId = getServiceProviderId(service);
    if (!providerId) {
      setProviderProfile(null);
      return undefined;
    }

    const unsub = subscribeUserProfile(providerId, setProviderProfile);
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [service]);

  /* Real-time: refetch every 30s so details stay fresh */
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => fetchServiceDetails(false), 30000);
    return () => clearInterval(interval);
  }, [id, fetchServiceDetails]);

  const sortedReviews = useMemo(
    () => [...reviews].sort((a, b) => getReviewTimestamp(b) - getReviewTimestamp(a)),
    [reviews]
  );

  useEffect(() => {
    setActiveMediaIndex(0);
  }, [id, service?._id]);

  useEffect(() => {
    if (state?.from === "user-dashboard") return;
    preloadServiceListingRoute();
  }, [state?.from]);

  if (isLoading) {
    return (
      <div className="service-details-page">
        <nav className="service-details-nav">
          <div className="service-details-skeleton service-details-skeleton-back" />
        </nav>
        <div className="service-details-layout service-details-skeleton-layout">
          <div className="service-details-main">
            <div className="service-details-skeleton service-details-skeleton-gallery" />
            <div className="service-details-skeleton service-details-skeleton-block" />
            <div className="service-details-skeleton service-details-skeleton-block service-details-skeleton-reviews" />
          </div>
          <aside className="service-details-sidebar">
            <div className="service-details-sidebar-card service-details-skeleton-card">
              <div className="service-details-skeleton service-details-skeleton-title" />
              <div className="service-details-skeleton service-details-skeleton-badges" />
              <div className="service-details-skeleton service-details-skeleton-price" />
              <div className="service-details-skeleton service-details-skeleton-provider" />
              <div className="service-details-skeleton service-details-skeleton-btn" />
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="service-details-page">
        <div className="service-details-error-card">
          <p className="service-details-error-text">{error}</p>
          <button className="service-details-btn" onClick={handleBack}>
            {backLabel}
          </button>
        </div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="service-details-page">
        <div className="service-details-error-card">
          <p>Service not found.</p>
          <button className="service-details-btn" onClick={handleBack}>
            {backLabel}
          </button>
        </div>
      </div>
    );
  }

  const serviceMedia = getServiceMedia(service);
  const totalImages = serviceMedia.length;
  const selectedMedia = serviceMedia[activeMediaIndex] || serviceMedia[0] || null;
  const providerName = getProviderName(service);
  const providerAddress = getProviderAddress(service);
  const providerPhoto = getLiveProviderPhoto(service, {
    [getServiceProviderId(service)]: providerProfile,
  });
  const providerPhone = getProviderPhone(service);
  const whatsappNumber = formatPhoneForWhatsApp(providerPhone);
  const isAvailable = (service?.availabilityStatus || "").toLowerCase() === "available";
  const serviceWithReviews = { ...service, reviews };
  const { average: computedAvg, count: reviewCount } = getAverageRatingAndCount(serviceWithReviews);
  const displayRating = Number.isFinite(Number(service?.averageRating))
    ? Number(service.averageRating)
    : computedAvg;

  return (
    <div className="service-details-page service-details-page-enter">
      <nav className="service-details-nav">
        <button
          type="button"
          className="service-details-back"
          onClick={handleBack}
        >
          ← {backLabel}
        </button>
      </nav>

      <div className="service-details-layout">
        {/* Left: Gallery + Description + Reviews */}
        <div className="service-details-main">
          <section className="service-details-gallery-section">
            {totalImages > 0 ? (
              <>
                <div className="service-details-slider-wrap">
                  {totalImages > 1 && (
                    <span className="service-details-image-badge">
                      {totalImages} {totalImages === 1 ? "photo" : "photos"}
                    </span>
                  )}
                  <div className="service-details-gallery-frame" aria-label="Service images">
                    {totalImages > 1 && (
                      <>
                        <button
                          type="button"
                          className="service-details-gallery-nav service-details-gallery-nav--prev"
                          onClick={() =>
                            setActiveMediaIndex((prev) => (prev - 1 + totalImages) % totalImages)
                          }
                          aria-label="Show previous service photo"
                        >
                          {"<"}
                        </button>
                        <button
                          type="button"
                          className="service-details-gallery-nav service-details-gallery-nav--next"
                          onClick={() =>
                            setActiveMediaIndex((prev) => (prev + 1) % totalImages)
                          }
                          aria-label="Show next service photo"
                        >
                          {">"}
                        </button>
                      </>
                    )}

                    {selectedMedia && (
                      <div className="service-details-gallery-slide">
                        <button
                          type="button"
                          className="service-details-zoom-wrap"
                          onClick={() => setLightboxIndex(activeMediaIndex)}
                        >
                          <img
                            src={selectedMedia.url}
                            alt={`${service.serviceName} — ${activeMediaIndex + 1}`}
                            loading="lazy"
                            decoding="async"
                          />
                        </button>
                        {selectedMedia.description && (
                          <p className="service-details-caption">{selectedMedia.description}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {totalImages > 1 && (
                    <div className="service-details-gallery-thumbs" aria-label="Service image thumbnails">
                      {serviceMedia.map((item, index) => (
                        <button
                          type="button"
                          key={index}
                          className={`service-details-gallery-thumb ${index === activeMediaIndex ? "is-active" : ""}`}
                          onClick={() => setActiveMediaIndex(index)}
                          aria-label={`Show photo ${index + 1}`}
                        >
                          <img
                            src={item.url}
                            alt={`${service.serviceName} thumbnail ${index + 1}`}
                            loading="lazy"
                            decoding="async"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {lightboxIndex !== null && (
                  <div
                    className="lightbox-overlay"
                    onClick={() => setLightboxIndex(null)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Escape" && setLightboxIndex(null)}
                    aria-label="Close"
                  >
                    <img
                      src={serviceMedia[lightboxIndex].url}
                      alt="Full size"
                      className="lightbox-image"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="service-details-no-image">No images</div>
            )}
          </section>

          <section className="service-details-description-section">
            <h2 className="service-details-section-title">About this service</h2>
            <p className="service-details-description">
              {service.description || "No description provided."}
            </p>
          </section>

          <section className="service-details-reviews-section">
            <h2 className="service-details-section-title">
              Reviews {reviewCount > 0 && `(${reviewCount})`}
            </h2>
            {sortedReviews.length === 0 ? (
              <p className="service-details-no-reviews">No reviews yet. Be the first to review!</p>
            ) : (
              <ul className="service-details-review-list">
                {sortedReviews.map((review, index) => (
                  <li key={review?._id || `review-${index}`} className="service-details-review-card">
                    <div className="service-details-review-avatar">
                      {getReviewerInitials(review)}
                    </div>
                    <div className="service-details-review-body">
                      <div className="service-details-review-meta">
                        <span className="service-details-review-name">
                          {getReviewerName(review)}
                        </span>
                        <span className="service-details-review-date">
                          {formatReviewDate(review)}
                        </span>
                      </div>
                      <div className="service-details-review-stars">
                        {formatStars(review?.rating)}
                      </div>
                      <p className="service-details-review-comment">
                        {review?.comment || "No comment provided."}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right: Sticky sidebar */}
        <aside className="service-details-sidebar">
          <div className="service-details-sidebar-card">
            <h1 className="service-details-title">{service.serviceName}</h1>

            <div className="service-details-badges">
              <span className="service-details-badge service-details-badge-category">
                {service.category || "General"}
              </span>
              <span
                className={`service-details-badge service-details-badge-status ${isAvailable ? "available" : "unavailable"}`}
              >
                {service.availabilityStatus || "—"}
              </span>
            </div>

            <div className="service-details-rating-block">
              {formatStars(displayRating)}
              {displayRating > 0 && (
                <span className="service-details-rating-value">
                  {Number(displayRating).toFixed(1)}
                </span>
              )}
              {reviewCount > 0 && (
                <span className="service-details-rating-count">
                  · {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
                </span>
              )}
            </div>

            <div className="service-details-price-block">
              <span className="service-details-price">{formatLrdPrice(service?.price)}</span>
            </div>

            <div className="service-details-provider-block">
              <div className="service-details-provider-avatar">
                {providerPhoto ? (
                  <img src={providerPhoto} alt={providerName} />
                ) : (
                  getProviderInitials(providerName)
                )}
              </div>
              <div className="service-details-provider-info">
                <span className="service-details-provider-name">{providerName}</span>
                {providerAddress && providerAddress !== "Not provided" && (
                  <span className="service-details-provider-address">{providerAddress}</span>
                )}
              </div>
              {whatsappNumber && (
                <a
                  href={`https://wa.me/${whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="service-details-whatsapp"
                  title="Chat on WhatsApp"
                >
                  <WhatsAppIcon size={22} />
                </a>
              )}
            </div>

            <div className="service-details-actions">
              <button
                type="button"
                className="service-details-btn service-details-btn-primary"
                onClick={() => navigate(`/book/${id}`, { state: { service, from: state?.from || "services" } })}
                onMouseEnter={() => preloadBookingRoute(id)}
                onFocus={() => preloadBookingRoute(id)}
                disabled={!isAvailable}
              >
                Book Now
              </button>
              <button
                type="button"
                className="service-details-btn service-details-btn-secondary"
                onClick={() => navigate(backTarget)}
              >
                {backLabel}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ServiceDetails;
