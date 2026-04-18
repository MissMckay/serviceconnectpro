import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import {
  subscribeBookingsByUser,
  cancelBooking as cancelBookingRequest,
  deleteBooking as deleteBookingRequest,
  createReview,
  getReviewByBookingAndUser,
  getReviewsByService,
  getServiceById,
} from "../firebase/firestoreServices";
import DashboardActionIcon from "../components/DashboardActionIcon";
import { formatStars } from "../utils/rating";
import { getMarketplaceCardMedia, getServiceMedia } from "../utils/serviceMedia";
import { formatLrdPrice } from "../utils/currency";

const UserBookings = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [bookings, setBookings] = useState([]);
  const [servicesMap, setServicesMap] = useState({});
  const [serviceReviewsMap, setServiceReviewsMap] = useState({});
  const [reviews, setReviews] = useState({});
  const [submittingId, setSubmittingId] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const cardStyle = {
    border: "1px solid #e3e7ee",
    borderRadius: "12px",
    padding: "12px",
    marginBottom: "0",
    background: "var(--bg-white)",
    boxShadow: "0 6px 18px rgba(15, 23, 42, 0.07)"
  };

  const actionButtonStyle = {
    border: "none",
    borderRadius: "12px",
    padding: "8px 12px",
    background: "var(--brand-red)",
    color: "#fff",
    cursor: "pointer"
  };

  const getServiceRefId = (booking) => {
    const rawService = booking?.serviceId;
    if (typeof rawService === "string" && rawService.trim()) {
      return rawService.trim();
    }
    return (
      rawService?._id ||
      booking?.serviceSnapshot?.serviceId ||
      ""
    );
  };

  const markSubmittedReviews = async (bookingList) => {
    const completedBookings = bookingList.filter(
      (booking) => booking.status === "Completed" && getServiceRefId(booking)
    );
    if (!completedBookings.length) return;
    for (const booking of completedBookings) {
      try {
        const existing = await getReviewByBookingAndUser(booking._id, user?.uid);
        if (existing) {
          setReviews((prev) => ({
            ...prev,
            [booking._id]: { rating: existing.rating, comment: existing.comment || "", submitted: true },
          }));
        }
      } catch {
        // ignore
      }
    }
  };

  const getReviewTimestamp = (review) => {
    if (!review || typeof review === "string") return 0;
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

  useEffect(() => {
    if (!user?.uid) {
      setIsLoading(false);
      setBookings([]);
      return;
    }
    setIsLoading(true);
    setError("");
    let unsub;
    try {
      unsub = subscribeBookingsByUser(user.uid, (bookingData) => {
        setBookings(bookingData);
        setError("");
        setIsLoading(false);
        markSubmittedReviews(bookingData);
      });
    } catch (err) {
      setBookings([]);
      setError(err?.message || "Failed to load bookings.");
      setIsLoading(false);
    }
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [user?.uid]);

  useEffect(() => {
    const loadServices = async () => {
      const ids = [...new Set(bookings.map((b) => getServiceRefId(b)).filter(Boolean))];
      const map = {};
      await Promise.all(
        ids.map(async (sid) => {
          try {
            const s = await getServiceById(sid);
            if (s) map[sid] = s;
          } catch {
            // ignore
          }
        })
      );
      setServicesMap(map);
    };
    if (bookings.length) loadServices();
    else setServicesMap({});
  }, [bookings]);

  useEffect(() => {
    const loadReviews = async () => {
      const ids = [...new Set(bookings.map((b) => getServiceRefId(b)).filter(Boolean))];
      const map = {};
      await Promise.all(
        ids.map(async (sid) => {
          try {
            map[sid] = await getReviewsByService(sid);
          } catch {
            map[sid] = [];
          }
        })
      );
      setServiceReviewsMap(map);
    };
    if (bookings.length) loadReviews();
    else setServiceReviewsMap({});
  }, [bookings]);

  const cancelBooking = async (id) => {
    const booking = bookings.find((item) => String(item._id) === String(id));
    if (!booking) {
      alert("You can only cancel your own bookings.");
      return;
    }
    if (booking?.status !== "Pending") {
      alert("Only pending bookings can be cancelled.");
      return;
    }
    try {
      setCancellingId(id);
      await cancelBookingRequest(id);
      alert("Booking Cancelled");
    } catch (err) {
      alert(err?.message || "Failed to cancel booking");
    } finally {
      setCancellingId("");
    }
  };

  const updateReviewField = (bookingId, field, value) => {
    setReviews((prev) => ({
      ...prev,
      [bookingId]: {
        rating: prev[bookingId]?.rating || 5,
        comment: prev[bookingId]?.comment || "",
        submitted: prev[bookingId]?.submitted || false,
        [field]: value
      }
    }));
  };

  const submitReview = async (bookingId) => {
    const booking = bookings.find((item) => String(item._id) === String(bookingId));
    if (!booking || !user) {
      alert("You can only review your own bookings.");
      return;
    }
    if (booking?.status !== "Completed") {
      alert("Review is allowed only for completed bookings.");
      return;
    }
    const review = reviews[bookingId] || { rating: 5, comment: "" };
    if (!review.comment.trim()) {
      alert("Comment is required.");
      return;
    }
    setSubmittingId(bookingId);
    try {
      const serviceId = getServiceRefId(booking);
      const submittedReview = await createReview({
        bookingId,
        serviceId,
        userId: user.uid,
        rating: Number(review.rating),
        comment: review.comment.trim(),
      });
      setReviews((prev) => ({ ...prev, [bookingId]: { ...review, submitted: true } }));
      if (serviceId) {
        setServiceReviewsMap((prev) => ({
          ...prev,
          [serviceId]: [
            submittedReview || {
              _id: `${bookingId}-local-review`,
              userId: { name: user?.name || "You" },
              rating: Number(review.rating),
              comment: review.comment.trim(),
              createdAt: new Date(),
            },
            ...(prev[serviceId] || []),
          ],
        }));
      }
      alert("Review submitted successfully");
    } catch (err) {
      alert(err?.message || "Failed to submit review");
    } finally {
      setSubmittingId("");
    }
  };

  const deleteBooking = async (bookingId) => {
    if (!window.confirm("Delete this booking from your history?")) return;
    try {
      setDeletingId(bookingId);
      await deleteBookingRequest(bookingId);
      alert("Booking deleted successfully.");
    } catch (err) {
      alert(err?.message || "Failed to delete booking");
    } finally {
      setDeletingId("");
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Pending":
        return "#bf0a30";
      case "Accepted":
      case "Completed":
        return "#002868";
      case "Rejected":
        return "#bf0a30";
      case "Cancelled":
        return "#6b7280";
      default:
        return "#1a1a1a";
    }
  };

  const getProviderName = (booking) => {
    const sid = getServiceRefId(booking);
    const service = sid ? servicesMap[sid] : null;
    return service?.providerName || booking?.providerName || "Not provided";
  };

  const getProviderId = (booking) => {
    const p = booking?.providerId;
    if (typeof p === "string" && p.trim()) return p.trim();
    if (p && typeof p === "object" && (p._id || p.id)) return p._id || p.id;
    const sid = getServiceRefId(booking);
    const service = sid ? servicesMap[sid] : null;
    const serviceProvider = service?.providerId || service?.provider;
    if (typeof serviceProvider === "string" && serviceProvider.trim()) return serviceProvider.trim();
    if (serviceProvider && typeof serviceProvider === "object" && (serviceProvider._id || serviceProvider.id)) {
      return serviceProvider._id || serviceProvider.id;
    }
    return null;
  };

  const getProviderLocation = (booking) => {
    const sid = getServiceRefId(booking);
    const service = sid ? servicesMap[sid] : null;
    return service?.providerAddress || booking?.providerAddress || "Not provided";
  };

  const getServiceName = (booking) => {
    const sid = getServiceRefId(booking);
    const service = sid ? servicesMap[sid] : null;
    return service?.serviceName || booking?.serviceName || "Service";
  };

  const getServicePrice = (booking) => {
    const sid = getServiceRefId(booking);
    const service = sid ? servicesMap[sid] : null;
    return service?.price ?? booking?.price ?? booking?.amount;
  };

  const getServiceDescription = (booking) => {
    const sid = getServiceRefId(booking);
    const service = sid ? servicesMap[sid] : null;
    return service?.description || booking?.description || "No description provided.";
  };

  const getServiceCategory = (booking) => {
    const sid = getServiceRefId(booking);
    const service = sid ? servicesMap[sid] : null;
    return service?.category || booking?.category || "General";
  };

  const getBookingImage = (booking) => {
    const sid = getServiceRefId(booking);
    const service = sid ? servicesMap[sid] : null;
    if (!service) return "";
    return getMarketplaceCardMedia(service).serviceImageUrl;
  };

  const getProviderPhoto = (booking) => {
    const sid = getServiceRefId(booking);
    const service = sid ? servicesMap[sid] : null;
    if (!service) return "";
    return getMarketplaceCardMedia(service).providerPhotoUrl;
  };

  return (
    <div className="page-shell">
      <h2>My Booking History</h2>

      {isLoading && <p>Loading bookings...</p>}
      {!isLoading && error && <p style={{ color: "var(--brand-red)" }}>{error}</p>}
      {!isLoading && !error && bookings.length === 0 && (
        <div style={cardStyle}>
          <p style={{ marginTop: 0 }}><strong>No bookings yet.</strong></p>
          <p style={{ marginBottom: "10px" }}>
            Your booking history will appear here after you book a service.
          </p>
          <button
            style={actionButtonStyle}
            className="booking-card__action-btn dashboard-icon-btn"
            onClick={() => navigate("/services")}
            aria-label="Browse services"
            title="Browse services"
          >
            <DashboardActionIcon name="browse" />
          </button>
        </div>
      )}

      {!error && bookings.length > 0 && (
        <div className="bookings-grid">
          {bookings.map((booking) => {
            const serviceId = getServiceRefId(booking);
            const bookingImage = getBookingImage(booking);
            const providerPhoto = getProviderPhoto(booking);
            const providerName = getProviderName(booking);
            return (
              <div key={booking._id} className="booking-card booking-card--compact" style={cardStyle}>
                <button
                  type="button"
                  className="booking-card__image-trigger"
                  onClick={() =>
                    serviceId &&
                    navigate(`/services/${serviceId}`, {
                      state: { from: "user-dashboard" }
                    })
                  }
                  disabled={!serviceId}
                  aria-label={serviceId ? `Open details for ${getServiceName(booking)}` : "Service details unavailable"}
                >
                  {bookingImage ? (
                    <img
                      className="booking-card__image"
                      src={bookingImage}
                      alt={getServiceName(booking)}
                      style={{
                        width: "100%",
                        maxHeight: "64px",
                        objectFit: "cover",
                        borderRadius: "8px",
                        marginBottom: "4px",
                        border: "1px solid #e5e7eb"
                      }}
                    />
                  ) : (
                    <div
                      className="booking-card__image booking-card__image--empty"
                      style={{
                        width: "100%",
                        minHeight: "52px",
                        display: "grid",
                        placeItems: "center",
                        borderRadius: "8px",
                        marginBottom: "4px",
                        border: "1px dashed #d1d5db",
                        color: "#6b7280",
                        background: "#f8fafc"
                      }}
                    >
                      No image uploaded
                    </div>
                  )}
                </button>
                <p className="booking-card__meta">
                  <strong>Service:</strong> {getServiceName(booking)}
                </p>
                <p className="booking-card__meta">
                  <strong>Provider Name:</strong>{" "}
                  <span className="booking-provider-chip">
                    {providerPhoto ? (
                      <img src={providerPhoto} alt={providerName} />
                    ) : (
                      <span>{String(providerName || "?").trim().slice(0, 2).toUpperCase() || "?"}</span>
                    )}
                    {providerName}
                  </span>
                </p>
                <p className="booking-card__meta">
                  <strong>Category:</strong> {getServiceCategory(booking)}
                </p>
                <p className="booking-card__meta">
                  <strong>Price:</strong> {formatLrdPrice(getServicePrice(booking))}
                </p>

                <p className="booking-card__meta">
                  <strong>Status:</strong>{" "}
                  <span style={{ color: getStatusColor(booking.status) }}>
                    {booking.status}
                  </span>
                </p>

              <div className="booking-card__reviews">
                <h4 className="booking-card__section-title">Recent Reviews</h4>
                {(() => {
                  const canOpenService = Boolean(serviceId);
                  const rawReviews = serviceReviewsMap[serviceId] || [];
                  const sortedReviews = [...rawReviews].sort(
                    (a, b) => getReviewTimestamp(b) - getReviewTimestamp(a)
                  );
                  const recentReviews = sortedReviews.slice(0, 2);
                  const compactRecentReviews = recentReviews.slice(0, 1);

                  if (!compactRecentReviews.length) {
                    return <p className="booking-card__empty-text">No reviews yet.</p>;
                  }

                  return (
                    <div className="booking-card__review-list">
                      {compactRecentReviews.map((review, index) => (
                        <div key={review?._id || `${booking._id}-review-${index}`} className="booking-card__review-item">
                          <strong>
                            {typeof review === "string"
                              ? "Anonymous"
                              : getReviewerName(review)}
                          </strong>
                          {typeof review !== "string" && (
                            <div>{formatStars(review?.rating)}</div>
                          )}
                          <div>
                            {typeof review === "string"
                              ? review
                              : review?.comment || "No comment provided."}
                          </div>
                        </div>
                      ))}
                      <button
                        style={{ ...actionButtonStyle, marginTop: "4px" }}
                        className="booking-card__action-btn dashboard-icon-btn"
                        onClick={() =>
                          navigate(`/services/${serviceId}`, {
                            state: { from: "user-dashboard" }
                          })
                        }
                        disabled={!serviceId || !canOpenService}
                        aria-label="Open service reviews"
                        title="Open service reviews"
                      >
                        <DashboardActionIcon name="review" />
                      </button>
                    </div>
                  );
                })()}
              </div>

                {booking.status === "Pending" && (
                  <div className="booking-actions-end">
                    <button
                      style={actionButtonStyle}
                      className="booking-card__action-btn"
                      onClick={() => cancelBooking(booking._id)}
                      disabled={cancellingId === booking._id || isLoading}
                      aria-label="Cancel booking"
                      title="Cancel booking"
                    >
                      {cancellingId === booking._id ? "Cancelling..." : "Cancel Booking"}
                    </button>
                  </div>
                )}

                {booking.status === "Completed" && (
                  <div className="booking-card__review-form">
                    <h4 className="booking-card__section-title">Rate this completed job</h4>

                  {reviews[booking._id]?.submitted ? (
                    <p style={{ color: "var(--brand-blue)", margin: 0 }}>
                      Review already submitted for this booking.
                    </p>
                  ) : (
                    <>
                      <div className="booking-card__stars">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const active = star <= Number(reviews[booking._id]?.rating || 5);
                          return (
                            <button
                              key={`${booking._id}-star-${star}`}
                              type="button"
                              onClick={() => updateReviewField(booking._id, "rating", star)}
                              disabled={submittingId === booking._id}
                              style={{
                                border: "none",
                                background: "transparent",
                                padding: 0,
                                cursor: "pointer",
                                fontSize: "16px",
                                lineHeight: 1,
                                opacity: active ? 1 : 0.4,
                                color: "var(--brand-red)"
                              }}
                              aria-label={`Rate ${star} star`}>
                              {"\u2605"}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ marginTop: "4px" }}>
                        <textarea
                          className="booking-card__textarea"
                          rows={2}
                          placeholder="Write your comment"
                          value={reviews[booking._id]?.comment || ""}
                          onChange={(e) =>
                            updateReviewField(booking._id, "comment", e.target.value)
                          }
                          style={{
                            width: "100%",
                            maxWidth: "500px",
                            borderRadius: "10px",
                            border: "1px solid #d7dbe3",
                            padding: "6px"
                          }}
                        />
                      </div>

                      <button
                        style={{ ...actionButtonStyle, marginTop: "6px" }}
                        className="booking-card__action-btn dashboard-icon-btn"
                        onClick={() => submitReview(booking._id)}
                        disabled={
                          submittingId === booking._id ||
                          !String(reviews[booking._id]?.comment || "").trim()
                        }
                        aria-label="Submit review"
                        title="Submit review"
                      >
                        {submittingId === booking._id ? "…" : <DashboardActionIcon name="review" />}
                      </button>
                    </>
                  )}
                  </div>
                )}

                <div className="booking-actions-end booking-card__footer" style={{ marginTop: "6px" }}>
                  {getProviderId(booking) && String(booking.status || "").toLowerCase() === "completed" && (
                    <button
                      type="button"
                      className="booking-card__action-btn dashboard-icon-btn"
                      style={{
                        ...actionButtonStyle,
                        background: "var(--brand-blue)",
                        marginRight: "8px"
                      }}
                      onClick={() =>
                        navigate("/messages", {
                          state: {
                            fromRole: "user",
                            recipientId: getProviderId(booking),
                            recipientName: getProviderName(booking)
                          }
                        })
                      }
                      aria-label="Message provider"
                      title="Message provider"
                    >
                      <DashboardActionIcon name="message" />
                    </button>
                  )}
                  <button
                    className="booking-card__action-btn dashboard-icon-btn"
                    style={{
                      ...actionButtonStyle,
                      background: "#6b7280"
                    }}
                    onClick={() => deleteBooking(booking._id)}
                    disabled={deletingId === booking._id || isLoading}
                    aria-label="Delete booking"
                    title="Delete booking"
                  >
                    {deletingId === booking._id ? "…" : <DashboardActionIcon name="delete" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UserBookings;


