import { useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getServiceById, getReviewsByService, createBooking } from "../firebase/firestoreServices";
import { formatStars } from "../utils/rating";
import { formatLrdPrice } from "../utils/currency";
import { getServiceMedia } from "../utils/serviceMedia";
import { AuthContext } from "../context/AuthContext";

const getProviderLocation = (service) =>
  service?.providerLocation ||
  service?.providerAddress ||
  service?.location ||
  service?.providerId?.providerAddress ||
  service?.providerId?.location ||
  service?.providerId?.address ||
  service?.provider?.location ||
  service?.provider?.address ||
  "";

const BookingPage = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const initialService = state?.service || null;
  const [service, setService] = useState(initialService);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !initialService);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [reviewCount, setReviewCount] = useState(0);
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const media = useMemo(() => getServiceMedia(service || {}), [service]);
  const firstImage = media[0]?.url;

  const timeOptions = [
    "09:00 AM",
    "10:00 AM",
    "11:00 AM",
    "12:00 PM",
    "01:00 PM",
    "02:00 PM",
    "03:00 PM",
    "04:00 PM",
    "05:00 PM"
  ];

  useEffect(() => {
    const fetchService = async () => {
      if (!id) return;
      if (!initialService) setIsLoading(true);
      setError("");
      try {
        const [serviceData, reviews] = await Promise.all([
          getServiceById(id),
          getReviewsByService(id)
        ]);
        setService((prev) => serviceData || prev || null);
        setReviewCount(Array.isArray(reviews) ? reviews.length : 0);
      } catch (err) {
        setService((prev) => prev || null);
        setError(err?.message || "Unable to load service details for this booking.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchService();
  }, [id, initialService]);

  const handleBooking = async () => {
    if (!id || !user || !service) {
      setError("Invalid service selected or not signed in.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const bookingDate = date ? new Date(`${date}T12:00:00`) : new Date();
      await createBooking(user.uid, {
        serviceId: id,
        providerId: service.providerId || "",
        bookingDate,
      });

      alert("Booking Created!");
      navigate("/my-bookings");
    } catch (err) {
      const message = err?.message || "Booking failed";
      setError(message);
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const serviceName = service?.serviceName || "Service Name";
  const serviceDescription =
    service?.description ||
    "This service helps you complete your requested task efficiently with provider support and clear delivery expectations.";
  const providerName =
    service?.providerId?.name || service?.provider?.name || service?.providerName || "Provider Name";
  const price = formatLrdPrice(service?.price);
  const averageRating = Number(service?.averageRating);
  const hasRating = Number.isFinite(averageRating) && averageRating > 0;
  const category = service?.category || "General";
  const availability = service?.availabilityStatus || "Available";
  const location = getProviderLocation(service);
  const isAvailable = String(availability).toLowerCase() === "available";

  return (
    <div className="booking-page">
      <div className="booking-shell">
        <h1 className="booking-page-title">Book this service</h1>

        {isLoading ? (
          <div className="booking-loading">Loading service details…</div>
        ) : !service ? (
          <div className="booking-error-block">
            {error || "Service not found."}
            <button
              type="button"
              className="booking-back-btn"
              onClick={() => navigate(state?.from === "user-dashboard" ? "/user" : "/services")}
            >
              Back to services
            </button>
          </div>
        ) : (
          <div className="booking-layout">
            <section className="booking-service-card">
              <div className="booking-hero">
                {firstImage ? (
                  <img src={firstImage} alt={serviceName} className="booking-hero-image" />
                ) : (
                  <div className="booking-hero-placeholder">No image</div>
                )}
                <div className="booking-hero-overlay">
                  <span className="booking-service-category">{category}</span>
                  <h2 className="booking-service-title">{serviceName}</h2>
                  <div className="booking-hero-meta">
                    <span className="booking-hero-price">{price}</span>
                    <span className={`booking-hero-availability ${isAvailable ? "available" : "unavailable"}`}>
                      {availability}
                    </span>
                  </div>
                </div>
              </div>

              {media.length > 1 && (
                <div className="booking-gallery-strip">
                  {media.slice(0, 5).map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="booking-gallery-thumb"
                      onClick={() => {}}
                      aria-label={`View image ${idx + 1}`}
                    >
                      <img src={item.url} alt={item.description || ""} />
                    </button>
                  ))}
                </div>
              )}

              <div className="booking-details">
                <p className="booking-desc">{serviceDescription}</p>
                <dl className="booking-detail-list">
                  <dt>Provider</dt>
                  <dd>{providerName}</dd>
                  {location && (
                    <>
                      <dt>Location</dt>
                      <dd>{location}</dd>
                    </>
                  )}
                  <dt>Price</dt>
                  <dd>{price}</dd>
                  <dt>Rating</dt>
                  <dd>
                    {formatStars(service?.averageRating)}
                    {hasRating && <span className="booking-rating-num"> {averageRating.toFixed(1)}</span>}
                    <span className="booking-review-count"> ({reviewCount} reviews)</span>
                  </dd>
                </dl>
              </div>
            </section>

            <section className="booking-form-card">
              <h3 className="booking-form-title">Your booking</h3>
              <label htmlFor="booking-date" className="booking-label">Date</label>
              <input
                id="booking-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="booking-input"
                min={todayISO}
              />
              <label htmlFor="booking-time" className="booking-label">Time</label>
              <select
                id="booking-time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="booking-input"
              >
                <option value="">Select time</option>
                {timeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <label htmlFor="booking-notes" className="booking-label">Notes (optional)</label>
              <textarea
                id="booking-notes"
                className="booking-input booking-notes"
                placeholder="Special requests or notes for the provider…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              {error && <p className="booking-error">{error}</p>}
              <button
                type="button"
                className="booking-confirm-btn"
                onClick={handleBooking}
                disabled={isSubmitting || !isAvailable}
              >
                {isSubmitting ? "Submitting…" : "Confirm booking"}
              </button>
              {!isAvailable && (
                <p className="booking-unavailable-hint">This service is currently unavailable for booking.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookingPage;
