import { useState, useEffect, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { getBookingById, createReview } from "../firebase/firestoreServices";

const ReviewPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [booking, setBooking] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!id) return;
    getBookingById(id)
      .then(setBooking)
      .catch(() => setLoadError("Booking not found."));
  }, [id]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const safeRating = Number(rating);
    if (!Number.isFinite(safeRating) || safeRating < 1 || safeRating > 5) {
      alert("Please choose a valid rating between 1 and 5.");
      return;
    }
    if (!comment.trim()) {
      alert("Comment is required.");
      return;
    }
    if (!booking || !user) {
      alert("Booking not found or not signed in.");
      return;
    }
    if (booking.status !== "Completed") {
      alert("You can only review completed bookings.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createReview({
        bookingId: id,
        serviceId: booking.serviceId,
        userId: user.uid,
        rating: safeRating,
        comment: comment.trim(),
      });
      alert("Review Submitted");
      navigate("/my-bookings");
    } catch (err) {
      alert(err?.message || "Failed to submit review");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="review-page">
        <p>{loadError}</p>
        <button type="button" onClick={() => navigate("/my-bookings")}>Back to bookings</button>
      </div>
    );
  }

  if (!booking) {
    return <div className="review-page">Loading...</div>;
  }

  return (
    <div className="review-page">
      <main className="review-content">
        <h1 className="review-title">Review Your Service</h1>
        <div className="review-divider" />
        <p className="review-instruction">Rate your completed service:</p>

        <form className="review-form" onSubmit={handleSubmit}>
          <div className="review-rating-section">
            <div className="review-label">Your Rating:</div>
            <div className="review-stars" role="radiogroup" aria-label="Your rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={`review-star-${star}`}
                  type="button"
                  className={`review-star-btn${star <= Number(rating) ? " active" : ""}`}
                  onClick={() => setRating(star)}
                  aria-label={`Rate ${star} star`}
                  aria-pressed={star <= Number(rating)}
                >
                  {"\u2605"}
                </button>
              ))}
            </div>
          </div>

          <div className="review-comment-section">
            <label htmlFor="review-comment" className="review-label">
              Your Comments:
            </label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write your comments here..."
              rows={7}
              className="review-textarea"
            />
          </div>

          <label className="review-anon-row">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
            />
            <span>Submit as Anonymous.</span>
          </label>

          <div className="review-submit-wrap">
            <button
              type="submit"
              className="review-submit-btn"
              disabled={isSubmitting || !comment.trim()}
            >
              {isSubmitting ? "Submitting..." : "Submit Review"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default ReviewPage;
