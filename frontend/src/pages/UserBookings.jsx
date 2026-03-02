import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import { formatStars } from "../utils/rating";
import { getServiceMedia } from "../utils/serviceMedia";
import { formatLrdPrice } from "../utils/currency";

const UserBookings = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [reviews, setReviews] = useState({});
  const [serviceReviews, setServiceReviews] = useState({});
  const [submittingId, setSubmittingId] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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

    const serviceIds = [...new Set(completedBookings.map((b) => getServiceRefId(b)).filter(Boolean))];
    const responses = await Promise.all(
      serviceIds.map((serviceId) =>
        API.get(`/reviews/service/${serviceId}`).catch(() => null)
      )
    );

    const reviewedBookingIds = new Set();
    responses.forEach((res) => {
      const list = res?.data?.data || [];
      list.forEach((review) => {
        if (review?.bookingId) {
          reviewedBookingIds.add(String(review.bookingId));
        }
      });
    });

    if (!reviewedBookingIds.size) return;

    setReviews((prev) => {
      const next = { ...prev };
      completedBookings.forEach((booking) => {
        const bookingId = String(booking._id);
        if (reviewedBookingIds.has(bookingId)) {
          next[bookingId] = {
            rating: prev[bookingId]?.rating || 5,
            comment: prev[bookingId]?.comment || "",
            submitted: true
          };
        }
      });
      return next;
    });
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

  // `silent=true` refreshes data without toggling loading text.
  const fetchBookings = async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setError("");
    }

    try {
      const res = await API.get("/bookings/user");
      const bookingData = res.data.data || [];
      setBookings(bookingData);

      const serviceIds = [
        ...new Set(
          bookingData
            .map((booking) => getServiceRefId(booking))
            .filter(Boolean)
            .map(String)
        )
      ];

      if (serviceIds.length) {
        const reviewResponses = await Promise.all(
          serviceIds.map((serviceId) =>
            API.get(`/reviews/service/${serviceId}`)
              .then((reviewRes) => ({
                serviceId,
                reviews: Array.isArray(reviewRes.data?.data) ? reviewRes.data.data : []
              }))
              .catch(() => ({ serviceId, reviews: [] }))
          )
        );

        setServiceReviews((prev) => {
          const next = { ...prev };
          reviewResponses.forEach((entry) => {
            next[String(entry.serviceId)] = entry.reviews;
          });
          return next;
        });
      } else {
        setServiceReviews({});
      }

      await markSubmittedReviews(bookingData);
    } catch (err) {
      console.log("Error fetching bookings:", err);
      const status = Number(err?.response?.status || 0);
      const noBookingsYet = status === 404;
      if (noBookingsYet) {
        setBookings([]);
        setServiceReviews({});
        setError("");
        return;
      }
      if (!silent) {
        setBookings([]);
        setError(err.response?.data?.message || "Failed to load bookings.");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchBookings();

    const interval = setInterval(() => {
      fetchBookings(true);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

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
      await API.put(`/bookings/cancel/${id}`);
      alert("Booking Cancelled");
      fetchBookings(true);
    } catch (err) {
      console.log("Cancel error:", err);
      alert(err.response?.data?.message || "Failed to cancel booking");
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
    if (!booking) {
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
      await API.post("/reviews", {
        bookingId,
        rating: Number(review.rating),
        comment: review.comment.trim()
      });

      setReviews((prev) => ({
        ...prev,
        [bookingId]: {
          ...review,
          submitted: true
        }
      }));
      alert("Review submitted successfully");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to submit review");
    } finally {
      setSubmittingId("");
    }
  };

  const deleteBooking = async (bookingId) => {
    const booking = bookings.find((item) => String(item._id) === String(bookingId));
    if (!booking) {
      alert("Booking not found.");
      return;
    }

    if (!window.confirm("Delete this booking from your history?")) return;

    setDeletingId(bookingId);
    try {
      const endpoints = [`/bookings/${bookingId}`];
      let deleted = false;

      for (const endpoint of endpoints) {
        try {
          await API.delete(endpoint);
          deleted = true;
          break;
        } catch {
          // try next delete endpoint
        }
      }

      if (!deleted) {
        throw new Error("Unable to delete booking.");
      }

      setBookings((prev) => prev.filter((item) => String(item._id) !== String(bookingId)));
      setReviews((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        return next;
      });
      alert("Booking deleted from history.");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete booking.");
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

  const getProviderName = (booking) =>
    booking?.serviceSnapshot?.providerName ||
    booking?.serviceProviderName ||
    booking?.providerId?.name ||
    booking?.provider?.name ||
    booking?.providerName ||
    booking?.serviceId?.providerName ||
    booking?.serviceId?.provider?.providerName ||
    booking?.serviceId?.providerId?.name ||
    booking?.serviceId?.provider?.name ||
    booking?.serviceId?.createdBy?.name ||
    "Not provided";

  const getProviderLocation = (booking) =>
    booking?.serviceSnapshot?.providerAddress ||
    booking?.serviceSnapshot?.providerLocation ||
    booking?.providerAddress ||
    booking?.providerLocation ||
    booking?.provider?.providerAddress ||
    booking?.provider?.location ||
    booking?.provider?.address ||
    booking?.providerId?.providerAddress ||
    booking?.providerId?.location ||
    booking?.providerId?.address ||
    booking?.serviceId?.providerId?.providerAddress ||
    booking?.serviceId?.provider?.providerAddress ||
    booking?.serviceId?.providerLocation ||
    booking?.serviceId?.providerAddress ||
    booking?.serviceId?.provider?.location ||
    booking?.serviceId?.provider?.address ||
    booking?.serviceId?.providerId?.location ||
    booking?.serviceId?.providerId?.address ||
    booking?.serviceId?.createdBy?.location ||
    booking?.serviceId?.createdBy?.address ||
    booking?.serviceId?.location ||
    booking?.serviceId?.city ||
    booking?.serviceId?.area ||
    "Not provided";

  const getServiceName = (booking) =>
    booking?.serviceSnapshot?.serviceName ||
    booking?.serviceName ||
    booking?.service?.serviceName ||
    booking?.serviceId?.serviceName ||
    "Service";

  const getServicePrice = (booking) =>
    booking?.serviceSnapshot?.price ||
    booking?.price ||
    booking?.amount ||
    booking?.totalAmount ||
    booking?.service?.price ||
    booking?.serviceId?.price;

  const getServiceDescription = (booking) =>
    booking?.serviceSnapshot?.description ||
    booking?.serviceDescription ||
    booking?.description ||
    booking?.service?.description ||
    booking?.serviceId?.description ||
    "No description provided.";

  const getServiceCategory = (booking) =>
    booking?.serviceSnapshot?.category ||
    booking?.serviceCategory ||
    booking?.service?.category ||
    booking?.serviceId?.category ||
    "General";

  const getBookingImage = (booking) => {
    const service =
      (booking?.serviceId && typeof booking.serviceId === "object" ? booking.serviceId : null) ||
      booking?.serviceSnapshot ||
      {};
    const images = getServiceMedia(service);
    if (images.length > 0) {
      return images[0].url;
    }
    return "";
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
          <button style={actionButtonStyle} onClick={() => navigate("/services")}>
            Browse Services
          </button>
        </div>
      )}

      {!error && bookings.length > 0 && (
        <div className="bookings-grid">
          {bookings.map((booking) => {
            const bookingImage = getBookingImage(booking);
            return (
              <div key={booking._id} className="booking-card" style={cardStyle}>
                {bookingImage ? (
                  <img
                    src={bookingImage}
                    alt={getServiceName(booking)}
                    style={{
                      width: "100%",
                      maxHeight: "220px",
                      objectFit: "cover",
                      borderRadius: "12px",
                      marginBottom: "10px",
                      border: "1px solid #e5e7eb"
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      minHeight: "120px",
                      display: "grid",
                      placeItems: "center",
                      borderRadius: "12px",
                      marginBottom: "10px",
                      border: "1px dashed #d1d5db",
                      color: "#6b7280",
                      background: "#f8fafc"
                    }}
                  >
                    No image uploaded
                  </div>
                )}
                <p>
                  <strong>Service:</strong> {getServiceName(booking)}
                </p>
                <p>
                  <strong>Provider Name:</strong> {getProviderName(booking)}
                </p>
                <p>
                  <strong>Provider Address:</strong> {getProviderLocation(booking)}
                </p>
                <p>
                  <strong>Category:</strong> {getServiceCategory(booking)}
                </p>
                <p>
                  <strong>Description:</strong> {getServiceDescription(booking)}
                </p>
                <p>
                  <strong>Price:</strong> {formatLrdPrice(getServicePrice(booking))}
                </p>

                <p>
                  <strong>Status:</strong>{" "}
                  <span style={{ color: getStatusColor(booking.status) }}>
                    {booking.status}
                  </span>
                </p>

              <div style={{ marginTop: "12px" }}>
                <h4 style={{ marginBottom: "8px" }}>Recent Reviews</h4>
                {(() => {
                  const serviceId = getServiceRefId(booking);
                  const canOpenService = Boolean(
                    booking?.serviceId &&
                    typeof booking.serviceId === "object" &&
                    booking.serviceId?._id
                  );
                  const rawReviews = serviceId
                    ? serviceReviews[String(serviceId)] || []
                    : [];
                  const sortedReviews = [...rawReviews].sort(
                    (a, b) => getReviewTimestamp(b) - getReviewTimestamp(a)
                  );
                  const recentReviews = sortedReviews.slice(0, 2);

                  if (!recentReviews.length) {
                    return <p style={{ margin: 0 }}>No reviews yet.</p>;
                  }

                  return (
                    <div>
                      {recentReviews.map((review, index) => (
                        <div key={review?._id || `${booking._id}-review-${index}`}>
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
                        style={{ ...actionButtonStyle, marginTop: "8px" }}
                        onClick={() =>
                          navigate(`/services/${serviceId}`, {
                            state: { from: "user-dashboard" }
                          })
                        }
                        disabled={!serviceId || !canOpenService}
                      >
                        Review
                      </button>
                    </div>
                  );
                })()}
              </div>

                {booking.status === "Pending" && (
                  <div className="booking-actions-end">
                    <button
                      style={actionButtonStyle}
                      onClick={() => cancelBooking(booking._id)}
                      disabled={cancellingId === booking._id || isLoading}
                    >
                      {cancellingId === booking._id ? "Cancelling..." : "Cancel Booking"}
                    </button>
                  </div>
                )}

                {booking.status === "Completed" && (
                  <div style={{ marginTop: "12px" }}>
                    <h4 style={{ marginBottom: "8px" }}>Rate this completed job</h4>

                  {reviews[booking._id]?.submitted ? (
                    <p style={{ color: "var(--brand-blue)", margin: 0 }}>
                      Review already submitted for this booking.
                    </p>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
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
                                fontSize: "22px",
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

                      <div style={{ marginTop: "8px" }}>
                        <textarea
                          rows={3}
                          placeholder="Write your comment"
                          value={reviews[booking._id]?.comment || ""}
                          onChange={(e) =>
                            updateReviewField(booking._id, "comment", e.target.value)
                          }
                          style={{
                            width: "100%",
                            maxWidth: "500px",
                            borderRadius: "12px",
                            border: "1px solid #d7dbe3",
                            padding: "10px"
                          }}
                        />
                      </div>

                      <button
                        style={{ ...actionButtonStyle, marginTop: "10px" }}
                        onClick={() => submitReview(booking._id)}
                        disabled={
                          submittingId === booking._id ||
                          !String(reviews[booking._id]?.comment || "").trim()
                        }
                      >
                        {submittingId === booking._id ? "Submitting..." : "Submit Review"}
                      </button>
                    </>
                  )}
                  </div>
                )}

                <div className="booking-actions-end" style={{ marginTop: "10px" }}>
                  <button
                    style={{
                      ...actionButtonStyle,
                      background: "#6b7280"
                    }}
                    onClick={() => deleteBooking(booking._id)}
                    disabled={deletingId === booking._id || isLoading}
                  >
                    {deletingId === booking._id ? "Deleting..." : "Delete"}
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


