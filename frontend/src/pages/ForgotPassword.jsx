import { useState } from "react";
import { Link } from "react-router-dom";
import API from "../services/api";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      await API.post("/auth/forgot-password", { email: email.trim() });
      setSuccess("If this email exists, a password reset link has been sent.");
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to send reset email right now. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="forgot-page">
      <div className="forgot-card">
        <h2 className="forgot-title">Forgot Password</h2>
        <form className="forgot-form" onSubmit={handleSubmit}>
          <label htmlFor="forgot-email" className="login-label">Email</label>
          <div className="input-with-icon">
            <input
              id="forgot-email"
              type="email"
              value={email}
              placeholder="Enter your account email"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <span className="input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path
                  d="M3 6h18v12H3z M3 7l9 6 9-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>

          <button type="submit" className="login-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <p className="register-login-link">
          Back to <Link to="/login">Login</Link>
        </p>
        {success && <p className="forgot-success">{success}</p>}
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
};

export default ForgotPassword;
