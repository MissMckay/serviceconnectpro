import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import { formatStars } from "../utils/rating";
import { formatLrdPrice } from "../utils/currency";
import { getServiceMedia } from "../utils/serviceMedia";

const BookingPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [reviewCount, setReviewCount] = useState(0);
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

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
      setIsLoading(true);
      setError("");
      try {
        const [servicesRes, reviewsRes] = await Promise.all([
          API.get("/services"),
          API.get(`/reviews/service/${id}`).catch(() => ({ data: { data: [] } }))
        ]);
        const serviceList = Array.isArray(servicesRes.data?.data) ? servicesRes.data.data : [];
        const selectedService = serviceList.find((entry) => String(entry._id) === String(id));
        setService(selectedService || null);

        const reviews = Array.isArray(reviewsRes.data?.data) ? reviewsRes.data.data : [];
        setReviewCount(reviews.length);
      } catch (err) {
        console.log("Failed to fetch service details:", err);
        setError("Unable to load service details for this booking.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchService();
  }, [id]);

  const handleBooking = async () => {
    if (!id) {
      setError("Invalid service selected.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const normalizedDescription = String(service?.description || "").trim();
      const normalizedServiceName = String(service?.serviceName || "").trim();
      const normalizedCategory = String(service?.category || "").trim();
      const normalizedProviderName = String(
        service?.providerName || service?.providerId?.name || service?.provider?.name || ""
      ).trim();
      const normalizedProviderLocation = String(
        service?.providerLocation ||
          service?.providerAddress ||
          service?.location ||
          service?.providerId?.location ||
          service?.providerId?.address ||
          service?.provider?.location ||
          service?.provider?.address ||
          ""
      ).trim();
      const snapshotMedia = getServiceMedia(service)
        .filter((entry) => Boolean(entry?.url))
        .slice(0, 10)
        .map((entry) => ({
          url: entry.url,
          type: entry.type || "image",
          description: String(entry.description || "").trim()
        }));

      await API.post("/bookings", {
        serviceId: id,
        date: date || undefined,
        time: time || undefined,
        notes: notes.trim() || undefined,
        serviceName: normalizedServiceName || undefined,
        serviceCategory: normalizedCategory || undefined,
        serviceDescription: normalizedDescription || undefined,
        description: normalizedDescription || undefined,
        price: Number(service?.price) || undefined,
        providerName: normalizedProviderName || undefined,
        providerLocation: normalizedProviderLocation || undefined,
        serviceSnapshot: {
          serviceId: id,
          serviceName: normalizedServiceName || undefined,
          category: normalizedCategory || undefined,
          description: normalizedDescription || undefined,
          price: Number(service?.price) || undefined,
          providerName: normalizedProviderName || undefined,
          providerLocation: normalizedProviderLocation || undefined,
          availabilityStatus: service?.availabilityStatus || undefined,
          image: snapshotMedia[0]?.url || undefined,
          imageDetails: snapshotMedia.length ? snapshotMedia : undefined
        }
      });

      alert("Booking Created!");
      navigate("/services");
    } catch (err) {
      const message = err.response?.data?.message || "Booking failed";
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
    service?.providerId?.name || service?.provider?.name || "Provider Name";
  const price = formatLrdPrice(service?.price);
  const averageRating = Number(service?.averageRating);
  const hasRating = Number.isFinite(averageRating) && averageRating > 0;

  return (
    <div className="booking-page">
      <div className="booking-shell">
        <h1 className="booking-title">Booking Page</h1>
        <div className="booking-divider" />

        <div className="booking-columns">
          <section className="booking-column">
            <h2 className="booking-section-title">Service Details</h2>

            <div className="booking-service-name-box">
              {isLoading ? "Loading service..." : serviceName}
            </div>

            <p className="booking-description">{serviceDescription}</p>

            <div className="booking-meta"><strong>Provider:</strong> {providerName}</div>
            <div className="booking-meta"><strong>Price:</strong> {price}</div>
            <div className="booking-meta">
              <strong>Rating:</strong> {formatStars(service?.averageRating)} ({reviewCount} Reviews)
              <span className="booking-rating-value">
                {" "}
                {hasRating ? averageRating.toFixed(1) : "Not rated yet"}
              </span>
            </div>
          </section>

          <section className="booking-column">
            <h2 className="booking-section-title">Booking Form</h2>

            <label htmlFor="booking-date" className="booking-label">Select Date</label>
            <input
              id="booking-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="booking-input"
              min={todayISO}
            />

            <label htmlFor="booking-time" className="booking-label">Select Time</label>
            <select
              id="booking-time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="booking-input"
            >
              <option value="">Select Time</option>
              {timeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label htmlFor="booking-notes" className="booking-label">Notes (Optional)</label>
            <textarea
              id="booking-notes"
              className="booking-input booking-notes"
              placeholder="Enter any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            {error && <p className="booking-error">{error}</p>}

            <button
              type="button"
              className="booking-confirm-btn"
              onClick={handleBooking}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Confirm Booking"}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};

export default BookingPage;
